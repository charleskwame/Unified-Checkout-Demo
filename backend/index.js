const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const { createHeaders } = require("cybersource-auth");

require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const app = express();


const PORT = process.env.PORT || 3000;

const FRONTEND_ORIGIN = "https://unified-checkout-frontend.vercel.app";

const CYBERSOURCE_HOST = process.env.CYBERSOURCE_HOST;

const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;

const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;

const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;



app.use(
  cors({
    origin: FRONTEND_ORIGIN,

    methods: ["GET", "POST", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());


const validateConfig = () => {
  const missing = [];

  if (!CYBERSOURCE_HOST) {
    missing.push("CYBERSOURCE_HOST");
  }

  if (!MERCHANT_ID) {
    missing.push("CYBERSOURCE_MERCHANT_ID");
  }

  if (!API_KEY_ID) {
    missing.push("CYBERSOURCE_API_KEY_ID");
  }

  if (!SHARED_SECRET) {
    missing.push("CYBERSOURCE_API_SECRET_KEY");
  }

  return missing;
};


const normalizeHost = (host) => {
  return host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
};

const safeParseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const decodeJwtPayload = (token) => {
  try {
    if (!token || typeof token !== "string") {
      throw new Error("JWT is empty or invalid.");
    }

    const parts = token.split(".");

    if (parts.length !== 3) {
      throw new Error("Invalid JWT format.");
    }

    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    while (base64.length % 4) {
      base64 += "=";
    }

    return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  } catch (error) {
    console.error("JWT decode failed:", error);
    return null;
  }
};

const validateCheckoutPayload = (payload) => {
  const errors = [];

  if (!Array.isArray(payload.targetOrigins) || payload.targetOrigins.length === 0) {
    errors.push("targetOrigins must be a non-empty array.");
  }

  if (typeof payload.clientVersion !== "string" || !payload.clientVersion.trim()) {
    errors.push("clientVersion is required.");
  }

  if (!Array.isArray(payload.allowedCardNetworks) || payload.allowedCardNetworks.length === 0) {
    errors.push("allowedCardNetworks must be a non-empty array.");
  }

  if (!Array.isArray(payload.allowedPaymentTypes) || payload.allowedPaymentTypes.length === 0) {
    errors.push("allowedPaymentTypes must be a non-empty array.");
  }

  if (typeof payload.country !== "string" || !payload.country.trim()) {
    errors.push("country is required.");
  }

  if (typeof payload.locale !== "string" || !payload.locale.trim()) {
    errors.push("locale is required.");
  }

  const orderInformation = payload.data?.orderInformation;

  if (!orderInformation || typeof orderInformation !== "object") {
    errors.push("data.orderInformation is required.");
    return errors;
  }

  const amountDetails = orderInformation.amountDetails;

  if (!amountDetails || typeof amountDetails !== "object") {
    errors.push("data.orderInformation.amountDetails is required.");
    return errors;
  }

  if (typeof amountDetails.totalAmount !== "string" || !amountDetails.totalAmount.trim()) {
    errors.push("totalAmount is required.");
  }

  if (typeof amountDetails.currency !== "string" || !amountDetails.currency.trim()) {
    errors.push("currency is required.");
  }

  return errors;
};

const createCheckoutSession = async (req, res) => {
  try {
    const missing = validateConfig();

    if (missing.length > 0) {
      return res.status(500).json({
        error: "CyberSource environment variables are not configured.",
        missing,
      });
    }

    const host = normalizeHost(CYBERSOURCE_HOST);
    const resourcePath = "/uc/v1/sessions";
    const url = `https://${host}${resourcePath}`;
    const payload = req.body;

    const validationErrors = validateCheckoutPayload(payload);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid checkout session payload.",
        validationErrors,
      });
    }

    const rawBody = JSON.stringify(payload);

    const headers = createHeaders(MERCHANT_ID, host, "post", resourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

    console.log("Creating CyberSource Capture Context...");

    const response = await fetch(url, {
      method: "POST",

      headers: {
        ...headers,
        "Content-Type": "application/json",
      },

      body: rawBody,
      signal: AbortSignal.timeout(15000),
    });

    const responseText = await response.text();

    console.log("CyberSource /uc/v1/sessions status:", response.status);

    if (!response.ok) {
      console.error("CyberSource Capture Context error:", responseText);

      const errorData = safeParseJson(responseText);

      return res.status(response.status).json({
        error: errorData?.message || "CyberSource Capture Context request failed.",
        details: errorData || responseText,
      });
    }

  
    const captureContext = responseText.trim();

    if (!captureContext) {
      return res.status(500).json({
        error: "CyberSource returned an empty Capture Context.",
      });
    }

  
    const jwtParts = captureContext.split(".");

    if (jwtParts.length !== 3) {
      console.error("Unexpected CyberSource response:", responseText);

      return res.status(500).json({
        error: "CyberSource returned an invalid Capture Context JWT.",
        cyberSourceResponse: responseText,
      });
    }


    const decoded = decodeJwtPayload(captureContext);

    if (!decoded) {
      return res.status(500).json({
        error: "CyberSource returned a JWT that could not be decoded.",
      });
    }

    const contextData = decoded?.ctx?.[0]?.data;

    if (!contextData) {
      return res.status(500).json({
        error: "Capture Context does not contain ctx[0].data.",
      });
    }

    console.log("Capture Context successfully created.");
    console.log("Client library:", contextData.clientLibrary);
    console.log("Target origins:", contextData.targetOrigins);

    return res.status(200).json({
      captureContext,
    });
  } catch (error) {
    console.error("Create checkout session exception:", error);

    return res.status(500).json({
      error: "Failed to create CyberSource checkout session.",

      details: error.message,
    });
  }
};


const processPayment = async (req, res) => {
  try {
    const missing = validateConfig();

    if (missing.length) {
      return res.status(500).json({
        error: "CyberSource environment variables are not configured.",
        missing,
      });
    }

    const { transientToken, amount, currency = "USD" } = req.body;

    if (!transientToken || typeof transientToken !== "string") {
      return res.status(400).json({
        error: "transientToken is required.",
      });
    }

    if (!amount || typeof amount !== "string") {
      return res.status(400).json({
        error: "amount is required.",
      });
    }


    const host = normalizeHost(CYBERSOURCE_HOST);
    const resourcePath = "/pts/v2/payments";
    const url = `https://${host}${resourcePath}`;

    const payload = {
      clientReferenceInformation: {
        code: `ORDER-${Date.now()}`,
      },
      orderInformation: {
        amountDetails: {
          totalAmount: amount,
          currency,
        },
      },
      tokenInformation: {
        transientTokenJwt: transientToken,
      },
    };

    const rawBody = JSON.stringify(payload);

    const headers = createHeaders(MERCHANT_ID, host, "post", resourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

    console.log("Sending transient token to CyberSource...");

    const response = await axios.post(url, payload, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    console.log("CyberSource payment status:", response.status);
    console.log("CyberSource payment response:", response.data);

    if (response.status >= 200 && response.status < 300) {
      return res.status(200).json({
        success: true,
        message: "Payment authorized successfully.",
        status: response.status,
        data: response.data,
      });
    }

    return res.status(response.status).json({
      success: false,
      message: "CyberSource payment authorization failed.",
      status: response.status,
      error: response.data,
    });
  } catch (error) {
    console.error("Payment processing exception:", error);
    console.error("CyberSource response:", error.response?.data);

    return res.status(error.response?.status || 500).json({
      success: false,
      message: "Payment processing failed.",
      error: error.response?.data || error.message,
    });
  }
};

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "CyberSource Unified Checkout backend",
  });
});


app.post("/checkout-session", createCheckoutSession);

app.post("/payment", processPayment);


if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}

module.exports = app;
