const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { createHeaders } = require("cybersource-auth");

const app = express();

app.use(
  cors({
    origin: "https://unified-checkout-frontend.vercel.app",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

const HOST = process.env.CYBERSOURCE_HOST;
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;
const resourcePath = "/uc/v1/sessions";

const createCheckoutSession = async (req, res) => {
  try {
    if (!HOST || !MERCHANT_ID || !API_KEY_ID || !SHARED_SECRET) {
      return res.status(500).json({
        error: "CyberSource environment variables are not fully configured.",
      });
    }

    const normalizedHost = HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const url = `https://${normalizedHost}${resourcePath}`;

    const rawPayload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : req.body;
    const payload = normalizeCheckoutPayload(rawPayload);

    const validationErrors = validateCheckoutPayload(payload);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid checkout-session payload.",
        validationErrors,
      });
    }

    const rawBody = JSON.stringify(payload);

    const headers = createHeaders(MERCHANT_ID, normalizedHost, "post", resourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: rawBody,
      signal: AbortSignal.timeout(10000),
    });

    const responseText = await response.text();
    const data = safeParseJson(responseText);

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || `CyberSource request failed (${response.status})`,
        details: data.details || data,
      });
    }

    const captureContext = extractCaptureContext(response, data, responseText);

    if (!captureContext) {
      return res.status(500).json({
        error: "CyberSource returned a 200 response, but no Capture Context token was generated.",
        responseHeaders: Object.fromEntries(response.headers.entries()),
        rawResponse: data,
        rawText: responseText,
      });
    }

    return res.json({ captureContext });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function validateCheckoutPayload(payload) {
  const errors = [];

  if (!Array.isArray(payload.targetOrigins) || payload.targetOrigins.length === 0) {
    errors.push("targetOrigins must be a non-empty array.");
  }

  if (typeof payload.clientVersion !== "string" || payload.clientVersion.trim().length === 0) {
    errors.push("clientVersion is required.");
  }

  if (!Array.isArray(payload.allowedCardNetworks) || payload.allowedCardNetworks.length === 0) {
    errors.push("allowedCardNetworks must be a non-empty array.");
  }

  if (!Array.isArray(payload.allowedPaymentTypes) || payload.allowedPaymentTypes.length === 0) {
    errors.push("allowedPaymentTypes must be a non-empty array.");
  }

  if (typeof payload.country !== "string" || payload.country.trim().length === 0) {
    errors.push("country is required.");
  }

  if (typeof payload.locale !== "string" || payload.locale.trim().length === 0) {
    errors.push("locale is required.");
  }

  const orderInfo = payload.data?.orderInformation || payload.orderInformation;

  if (typeof orderInfo !== "object" || orderInfo === null || typeof orderInfo.amountDetails !== "object" || orderInfo.amountDetails === null) {
    errors.push("data.orderInformation.amountDetails is required.");
    return errors;
  }

  const amountDetails = orderInfo.amountDetails;

  if (typeof amountDetails.totalAmount !== "string" || amountDetails.totalAmount.trim().length === 0) {
    errors.push("data.orderInformation.amountDetails.totalAmount is required.");
  }

  if (typeof amountDetails.currency !== "string" || amountDetails.currency.trim().length === 0) {
    errors.push("data.orderInformation.amountDetails.currency is required.");
  }

  return errors;
}


function normalizeCheckoutPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? { ...rawPayload } : {};

  if (typeof payload.data !== "object" || payload.data === null) {
    payload.data = {};
  }

  if (payload.orderInformation && !payload.data.orderInformation) {
    payload.data.orderInformation = payload.orderInformation;
  }

  delete payload.orderInformation;
  return payload;
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function extractCaptureContext(response, data, responseText) {
  const value =
    data.captureContext ||
    data.id ||
    data.token ||
    data.keyId ||
    data.data?.captureContext ||
    data.data?.id ||
    data.data?.token ||
    data.data?.keyId ||
    response.headers.get("capture-context") ||
    response.headers.get("v-c-capture-context") ||
    response.headers.get("location");

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof responseText === "string" && responseText.trim().length > 0) {
    return responseText.trim();
  }

  return null;
}

const processPaymentWithToken = async (req, res) => {
  try {
    if (!HOST || !MERCHANT_ID || !API_KEY_ID || !SHARED_SECRET) {
      return res.status(500).json({
        error: "CyberSource environment variables are not fully configured.",
      });
    }

    const paymentResult = req.body;

    if (!paymentResult) {
      return res.status(400).json({
        error: "Invalid payment result. Expected a payment result object or transient token string.",
      });
    }

    let transientToken;
    let paymentResultData = {};

    // Handle case where the transient token is sent directly as a string
    if (typeof paymentResult === "string") {
      transientToken = paymentResult.trim();
    } else if (typeof paymentResult === "object") {
      paymentResultData = paymentResult;
      transientToken = extractTransientToken(paymentResult);
    } else {
      return res.status(400).json({
        error: "Invalid payment result. Expected a payment result object or transient token string.",
      });
    }

    if (!transientToken) {
      return res.status(400).json({
        error: "No transient token found in the payment result.",
        receivedKeys: typeof paymentResult === "object" ? Object.keys(paymentResult) : undefined,
      });
    }

    const paymentPayload = buildPaymentPayload(paymentResultData, transientToken);

    const normalizedHost = HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const paymentResourcePath = "/pts/v2/payments";
    const url = `https://${normalizedHost}${paymentResourcePath}`;

    const rawBody = JSON.stringify(paymentPayload);

    const headers = createHeaders(
      MERCHANT_ID,
      normalizedHost,
      "post",
      paymentResourcePath,
      rawBody,
      API_KEY_ID,
      SHARED_SECRET
    );

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: rawBody,
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await response.text();
    const data = safeParseJson(responseText);

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || `CyberSource payment request failed (${response.status})`,
        details: data.details || data,
      });
    }

    return res.json(data);
  } catch (error) {
    console.error("Payment processing error:", error);
    res.status(500).json({ error: error.message });
  }
};

function extractTransientToken(paymentResult) {
  const candidates = [
    paymentResult.transientToken,
    paymentResult.token,
    paymentResult.id,
    paymentResult.paymentInformation?.token?.id,
    paymentResult.paymentInformation?.token,
    paymentResult.data?.transientToken,
    paymentResult.data?.token,
    paymentResult.data?.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

// function buildPaymentPayload(paymentResult, transientToken) {
//   const orderInfo =
//     paymentResult.data?.orderInformation ||
//     paymentResult.orderInformation ||
//     paymentResult.orderInformationData || {};

//   const amountDetails = orderInfo.amountDetails || {};

//   const payload = {
//     clientReferenceInformation: {
//       code: `UC-${Date.now()}`,
//     },
//     processingInformation: {
//       actionList: ["TOKEN_CREATE"],
//       actionTokenTypes: ["customer"],
//     },
//     paymentInformation: {
//       token: {
//         id: transientToken,
//       },
//     },
//     orderInformation: {
//       amountDetails: {
//         totalAmount: amountDetails.totalAmount || "0.00",
//         currency: amountDetails.currency || "USD",
//       },
//     },
//   };

//   if (orderInfo.billTo && typeof orderInfo.billTo === "object") {
//     payload.orderInformation.billTo = orderInfo.billTo;
//   }

//   if (paymentResult.billTo && typeof paymentResult.billTo === "object") {
//     payload.orderInformation.billTo = paymentResult.billTo;
//   }

//   return payload;
// }

function buildPaymentPayload(paymentResult, transientToken) {
  const orderInfo = paymentResult.data?.orderInformation || paymentResult.orderInformation || paymentResult.orderInformationData || {};

  const amountDetails = orderInfo.amountDetails || {};

  const payload = {
    clientReferenceInformation: {
      code: `UC-${Date.now()}`,
    },
    // Fix: Pass transientToken directly in paymentInformation
    paymentInformation: {
      transientToken: {
        id: transientToken,
      },
    },
    orderInformation: {
      amountDetails: {
        totalAmount: amountDetails.totalAmount || "0.00",
        currency: amountDetails.currency || "USD",
      },
    },
  };

  // Keep customer token creation only if specifically intended
  if (paymentResult.actionList) {
    payload.processingInformation = {
      actionList: paymentResult.actionList,
    };
  }

  if (orderInfo.billTo && typeof orderInfo.billTo === "object") {
    payload.orderInformation.billTo = orderInfo.billTo;
  } else if (paymentResult.billTo && typeof paymentResult.billTo === "object") {
    payload.orderInformation.billTo = paymentResult.billTo;
  }

  return payload;
}

app.post("/checkout-session", createCheckoutSession);

app.post("/payment-session", processPaymentWithToken);

// Start the server locally; Vercel handles this automatically in production.
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
