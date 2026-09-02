// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// require("dotenv").config({ path: path.join(__dirname, ".env") });
// const { createHeaders } = require("cybersource-auth");
// const jwt = require("jsonwebtoken")
// const axios = require("axios")

// const app = express();

// app.use(
//   cors({
//     origin: "https://unified-checkout-frontend.vercel.app",
//     methods: ["GET", "POST", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   })
// );

// app.use(express.json());

// const HOST = process.env.CYBERSOURCE_HOST;
// const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
// const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
// const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;
// const resourcePath = "/uc/v1/sessions";

// const decodeJwtPayload = (token) => {
//   try {
//     if (!token || typeof token !== "string") {
//       throw new Error("JWT is empty or invalid.");
//     }

//     const parts = token.split(".");

//     if (parts.length !== 3) {
//       throw new Error("Invalid JWT format.");
//     }

//     const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");

//     const json = Buffer.from(base64, "base64").toString("utf8");

//     return JSON.parse(json);
//   } catch (error) {
//     console.error("Failed to decode JWT:", error);
//     return null;
//   }
// };

// const createCheckoutSession = async (req, res) => {
//   try {
//     if (!HOST || !MERCHANT_ID || !API_KEY_ID || !SHARED_SECRET) {
//       return res.status(500).json({
//         error: "CyberSource environment variables are not fully configured.",
//       });
//     }

//     const normalizedHost = HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
//     const url = `https://${normalizedHost}${resourcePath}`;

//     const rawPayload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : req.body;
//     const payload = normalizeCheckoutPayload(rawPayload);

//     const validationErrors = validateCheckoutPayload(payload);

//     if (validationErrors.length > 0) {
//       return res.status(400).json({
//         error: "Invalid checkout-session payload.",
//         validationErrors,
//       });
//     }

//     const rawBody = JSON.stringify(payload);

//     const headers = createHeaders(MERCHANT_ID, normalizedHost, "post", resourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

//     const response = await fetch(url, {
//       method: "POST",
//       headers: headers,
//       body: rawBody,
//       signal: AbortSignal.timeout(10000),
//     });

//     const responseText = await response.text();
//     const data = safeParseJson(responseText);
 
//     if (!response.ok) {
//       return res.status(response.status).json({
//         error: data.message || `CyberSource request failed (${response.status})`,
//         details: data.details || data,
//       });
//     }

//     const captureContext = extractCaptureContext(response, data, responseText);

//     if (!captureContext) {
//       return res.status(500).json({
//         error: "CyberSource returned a 200 response, but no Capture Context token was generated.",
//         responseHeaders: Object.fromEntries(response.headers.entries()),
//         rawResponse: data,
//         rawText: responseText,
//       });
//     }

//     return res.json({ captureContext });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// const validateCheckoutPayload = (payload) => {
//   const errors = [];

//   if (!Array.isArray(payload.targetOrigins) || payload.targetOrigins.length === 0) {
//     errors.push("targetOrigins must be a non-empty array.");
//   }

//   if (typeof payload.clientVersion !== "string" || payload.clientVersion.trim().length === 0) {
//     errors.push("clientVersion is required.");
//   }

//   if (!Array.isArray(payload.allowedCardNetworks) || payload.allowedCardNetworks.length === 0) {
//     errors.push("allowedCardNetworks must be a non-empty array.");
//   }

//   if (!Array.isArray(payload.allowedPaymentTypes) || payload.allowedPaymentTypes.length === 0) {
//     errors.push("allowedPaymentTypes must be a non-empty array.");
//   }

//   if (typeof payload.country !== "string" || payload.country.trim().length === 0) {
//     errors.push("country is required.");
//   }

//   if (typeof payload.locale !== "string" || payload.locale.trim().length === 0) {
//     errors.push("locale is required.");
//   }

//   const orderInfo = payload.data?.orderInformation || payload.orderInformation;

//   if (typeof orderInfo !== "object" || orderInfo === null || typeof orderInfo.amountDetails !== "object" || orderInfo.amountDetails === null) {
//     errors.push("data.orderInformation.amountDetails is required.");
//     return errors;
//   }

//   const amountDetails = orderInfo.amountDetails;

//   if (typeof amountDetails.totalAmount !== "string" || amountDetails.totalAmount.trim().length === 0) {
//     errors.push("data.orderInformation.amountDetails.totalAmount is required.");
//   }

//   if (typeof amountDetails.currency !== "string" || amountDetails.currency.trim().length === 0) {
//     errors.push("data.orderInformation.amountDetails.currency is required.");
//   }

//   return errors;
// }


// const normalizeCheckoutPayload = (rawPayload) => {
//   const payload = rawPayload && typeof rawPayload === "object" ? { ...rawPayload } : {};

//   if (typeof payload.data !== "object" || payload.data === null) {
//     payload.data = {};
//   }

//   if (payload.orderInformation && !payload.data.orderInformation) {
//     payload.data.orderInformation = payload.orderInformation;
//   }

//   delete payload.orderInformation;
//   return payload;
// }

// function safeParseJson(value) {
//   try {
//     return JSON.parse(value);
//   } catch {
//     return {};
//   }
// }

// const extractCaptureContext = (response, data, responseText) => {
//   const value =
//     data.captureContext ||
//     data.id ||
//     data.token ||
//     data.keyId ||
//     data.data?.captureContext ||
//     data.data?.id ||
//     data.data?.token ||
//     data.data?.keyId ||
//     response.headers.get("capture-context") ||
//     response.headers.get("v-c-capture-context") ||
//     response.headers.get("location");

//   if (typeof value === "string" && value.trim().length > 0) {
//     return value.trim();
//   }

//   if (typeof responseText === "string" && responseText.trim().length > 0) {
//     return responseText.trim();
//   }

//   return null;
// }


// const verifyPaymentResult = async (req, res) => {
//   try {
//     const { completeResponse } = req.body;

//     if (!completeResponse) {
//       return res.status(400).json({
//         error: "completeResponse JWT is required",
//       });
//     }

//     const decoded = decodeJwtPayload(completeResponse);

//     if (!decoded) {
//       return res.status(400).json({
//         error: "Unable to decode payment result JWT",
//       });
//     }

//     console.log("Decoded payment result:", decoded);

//     return res.status(200).json({
//       success: true,
//       decoded,
//     });
//   } catch (error) {
//     console.error("Payment result error:", error);

//     return res.status(500).json({
//       error: "Failed to process payment result",
//     });
//   }
// };


// const processPayment = async (req, res) => {
//   try {
//     const url = "https://apitest.cybersource.com/pts/v2/payments";
//     const httpMethod = "POST";
//     const resourcePath = "/pts/v2/payments";

//     const payload = {
//       clientReferenceInformation: {
//         code: "TC50171_3",
//       },
//       orderInformation: {
//         amountDetails: {
//           totalAmount: req.body.amount,
//           currency: "USD",
//         },
//       },
//       tokenInformation: {
//         transientTokenJwt: req.body.transientToken,
//       },
//     };

//     const payloadString = JSON.stringify(payload);

//     const headers = createHeaders(MERCHANT_ID, httpMethod, resourcePath, payloadString, API_KEY_ID, SHARED_SECRET);

//     const response = await axios.post(url, payload, {
//       headers: {
//         ...headers,
//         "Content-Type": "application/json",
//       },
//     });

//     return res.status(200).json({
//       message: "Payment success",
//       data: response.data,
//     });
//   } catch (error) {
//     console.error("CyberSource Request Error:", error.response?.data || error.message);

//     return res.status(error.response?.status || 500).json({
//       message: "Payment request failed",
//       error: error.response?.data || error.message,
//     });
//   }
// };


// app.post("/checkout-session", createCheckoutSession);

// app.post("/payment", processPayment)


// app.post("/verify-payment", verifyPaymentResult);

// if (process.env.NODE_ENV !== "production") {
//   const PORT = process.env.PORT || 3000;
//   app.listen(PORT, () => {
//     console.log(`Backend server running on http://localhost:${PORT}`);
//   });
// }

// module.exports = app;


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

    if (missing.length) {
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

    if (validationErrors.length) {
      return res.status(400).json({
        error: "Invalid checkout session payload.",
        validationErrors,
      });
    }

    const rawBody = JSON.stringify(payload);

    const headers = createHeaders(MERCHANT_ID, host, "post", resourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

    console.log("Creating CyberSource checkout session...");

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

    const data = safeParseJson(responseText);

    console.log("CyberSource checkout session status:", response.status);

    if (!response.ok) {
      console.error("CyberSource checkout session error:", responseText);

      return res.status(response.status).json({
        error: data?.message || "CyberSource checkout session failed.",

        details: data || responseText,
      });
    }

    const captureContext = data?.captureContext || data?.id || data?.token;

    if (!captureContext || typeof captureContext !== "string") {
      console.error("Unexpected CyberSource session response:", data || responseText);

      return res.status(500).json({
        error: "CyberSource did not return a Capture Context.",
        cyberSourceResponse: data || responseText,
      });
    }

    return res.status(200).json({
      captureContext,
    });
  } catch (error) {
    console.error("Checkout session exception:", error);

    return res.status(500).json({
      error: "Failed to create checkout session.",
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
