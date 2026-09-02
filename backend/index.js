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

//   if (payload.merchantReferenceInformation && !payload.data.merchantReferenceInformation) {
//     payload.data.merchantReferenceInformation = payload.merchantReferenceInformation;
//   }

//   if (payload.orderInformation && !payload.data.orderInformation) {
//     payload.data.orderInformation = payload.orderInformation;
//   }

//   delete payload.orderInformation;
//   delete payload.merchantReferenceInformation;
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

//     const cybersourceId = decoded.id || decoded.transactionId || null;
//     const merchantRefCode = decoded.clientReferenceInformation?.code || null;
  

//     return res.status(200).json({
//       success: true,
//       transactionId: cybersourceId,
//       merchantReferenceCode: merchantRefCode,
//       decoded,
//     });
//   } catch (error) {
//     console.error("Payment result error:", error);

//     return res.status(500).json({
//       error: "Failed to process payment result",
//       details: error.message, // Helps debug future backend issues
//     });
//   }
// };



// app.post("/checkout-session", createCheckoutSession);


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

require("dotenv").config({
  path: path.join(__dirname, ".env"),
});

const { createHeaders } = require("cybersource-auth");

const app = express();

// ============================================================
// Middleware
// ============================================================

app.use(
  cors({
    origin: "https://unified-checkout-frontend.vercel.app",

    methods: ["GET", "POST", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// ============================================================
// CyberSource configuration
// ============================================================

const HOST = process.env.CYBERSOURCE_HOST;

const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;

const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;

const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;

const resourcePath = "/uc/v1/sessions";

// ============================================================
// Decode JWT payload
// ============================================================

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

    const json = Buffer.from(base64, "base64").toString("utf8");

    return JSON.parse(json);
  } catch (error) {
    console.error("Failed to decode JWT:", error);

    return null;
  }
};

// ============================================================
// Validate Checkout Payload
// ============================================================

const validateCheckoutPayload = (payload) => {
  const errors = [];

  // ----------------------------------------------------------
  // clientReferenceInformation
  // ----------------------------------------------------------

  if (!payload.clientReferenceInformation || typeof payload.clientReferenceInformation !== "object") {
    errors.push("clientReferenceInformation is required.");
  } else if (typeof payload.clientReferenceInformation.code !== "string" || payload.clientReferenceInformation.code.trim().length === 0) {
    errors.push("clientReferenceInformation.code is required.");
  }

  // ----------------------------------------------------------
  // targetOrigins
  // ----------------------------------------------------------

  if (!Array.isArray(payload.targetOrigins) || payload.targetOrigins.length === 0) {
    errors.push("targetOrigins must be a non-empty array.");
  }

  // ----------------------------------------------------------
  // clientVersion
  // ----------------------------------------------------------

  if (payload.clientVersion !== undefined && (typeof payload.clientVersion !== "string" || payload.clientVersion.trim().length === 0)) {
    errors.push("clientVersion must be a non-empty string when provided.");
  }

  // ----------------------------------------------------------
  // allowedCardNetworks
  // ----------------------------------------------------------

  if (!Array.isArray(payload.allowedCardNetworks) || payload.allowedCardNetworks.length === 0) {
    errors.push("allowedCardNetworks must be a non-empty array.");
  }

  // ----------------------------------------------------------
  // allowedPaymentTypes
  // ----------------------------------------------------------

  if (!Array.isArray(payload.allowedPaymentTypes) || payload.allowedPaymentTypes.length === 0) {
    errors.push("allowedPaymentTypes must be a non-empty array.");
  }

  // ----------------------------------------------------------
  // country
  // ----------------------------------------------------------

  if (typeof payload.country !== "string" || payload.country.trim().length === 0) {
    errors.push("country is required.");
  }

  // ----------------------------------------------------------
  // locale
  // ----------------------------------------------------------

  if (typeof payload.locale !== "string" || payload.locale.trim().length === 0) {
    errors.push("locale is required.");
  }

  // ----------------------------------------------------------
  // order information
  // ----------------------------------------------------------

  const orderInfo = payload.data?.orderInformation || payload.orderInformation;

  if (typeof orderInfo !== "object" || orderInfo === null) {
    errors.push("data.orderInformation is required.");

    return errors;
  }

  // ----------------------------------------------------------
  // amount details
  // ----------------------------------------------------------

  const amountDetails = orderInfo.amountDetails;

  if (typeof amountDetails !== "object" || amountDetails === null) {
    errors.push("data.orderInformation.amountDetails is required.");

    return errors;
  }

  // ----------------------------------------------------------
  // total amount
  // ----------------------------------------------------------

  if (typeof amountDetails.totalAmount !== "string" || amountDetails.totalAmount.trim().length === 0) {
    errors.push("data.orderInformation.amountDetails.totalAmount is required.");
  }

  // ----------------------------------------------------------
  // currency
  // ----------------------------------------------------------

  if (typeof amountDetails.currency !== "string" || amountDetails.currency.trim().length === 0) {
    errors.push("data.orderInformation.amountDetails.currency is required.");
  }

  return errors;
};

// ============================================================
// Normalize Checkout Payload
// ============================================================

const normalizeCheckoutPayload = (rawPayload) => {
  const payload =
    rawPayload && typeof rawPayload === "object"
      ? {
          ...rawPayload,
        }
      : {};

  // ----------------------------------------------------------
  // Ensure data exists
  // ----------------------------------------------------------

  if (typeof payload.data !== "object" || payload.data === null) {
    payload.data = {};
  }

  // ----------------------------------------------------------
  // Backwards compatibility:
  // If orderInformation was accidentally supplied
  // outside data, move it inside data.
  // ----------------------------------------------------------

  if (payload.orderInformation && !payload.data.orderInformation) {
    payload.data.orderInformation = payload.orderInformation;
  }

  delete payload.orderInformation;

  return payload;
};

// ============================================================
// Safe JSON parser
// ============================================================

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

// ============================================================
// Extract Capture Context
// ============================================================

const extractCaptureContext = (response, data, responseText) => {
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
};

// ============================================================
// Create Checkout Session
// ============================================================

const createCheckoutSession = async (req, res) => {
  try {
    // --------------------------------------------------------
    // Verify environment variables
    // --------------------------------------------------------

    if (!HOST || !MERCHANT_ID || !API_KEY_ID || !SHARED_SECRET) {
      return res.status(500).json({
        error: "CyberSource environment variables are not fully configured.",
      });
    }

    // --------------------------------------------------------
    // Normalize host
    // --------------------------------------------------------

    const normalizedHost = HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");

    const url = `https://${normalizedHost}${resourcePath}`;

    // --------------------------------------------------------
    // Read payload
    // --------------------------------------------------------

    const rawPayload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : req.body;

    // --------------------------------------------------------
    // Normalize
    // --------------------------------------------------------

    const payload = normalizeCheckoutPayload(rawPayload);

    // --------------------------------------------------------
    // Validate
    // --------------------------------------------------------

    const validationErrors = validateCheckoutPayload(payload);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid checkout-session payload.",

        validationErrors,
      });
    }

    // --------------------------------------------------------
    // Log the exact payload
    // --------------------------------------------------------

    console.log("CyberSource Sessions payload:");

    console.log(JSON.stringify(payload, null, 2));

    // --------------------------------------------------------
    // Serialize body
    // --------------------------------------------------------

    const rawBody = JSON.stringify(payload);

    // --------------------------------------------------------
    // Create CyberSource authentication headers
    // --------------------------------------------------------

    const headers = createHeaders(MERCHANT_ID, normalizedHost, "post", resourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

    // --------------------------------------------------------
    // Request capture context
    // --------------------------------------------------------

    const response = await fetch(url, {
      method: "POST",

      headers,

      body: rawBody,

      signal: AbortSignal.timeout(10000),
    });

    // --------------------------------------------------------
    // Read response
    // --------------------------------------------------------

    const responseText = await response.text();

    const data = safeParseJson(responseText);

    console.log("CyberSource Sessions status:", response.status);

    console.log("CyberSource Sessions response:", data);

    // --------------------------------------------------------
    // Handle CyberSource errors
    // --------------------------------------------------------

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || `CyberSource request failed (${response.status})`,

        details: data.details || data,
      });
    }

    // --------------------------------------------------------
    // Extract capture context
    // --------------------------------------------------------

    const captureContext = extractCaptureContext(response, data, responseText);

    if (!captureContext) {
      return res.status(500).json({
        error: "CyberSource returned a 200 response, but no Capture Context token was generated.",

        responseHeaders: Object.fromEntries(response.headers.entries()),

        rawResponse: data,

        rawText: responseText,
      });
    }

    // --------------------------------------------------------
    // Return capture context
    // --------------------------------------------------------

    return res.json({
      captureContext,
    });
  } catch (error) {
    console.error("Create checkout session error:", error);

    return res.status(500).json({
      error: error.message || "Failed to create checkout session.",
    });
  }
};

// ============================================================
// Verify Payment Result
// ============================================================

const verifyPaymentResult = async (req, res) => {
  try {
    const { completeResponse } = req.body;

    // --------------------------------------------------------
    // Validate request
    // --------------------------------------------------------

    if (!completeResponse) {
      return res.status(400).json({
        error: "completeResponse JWT is required",
      });
    }

    // --------------------------------------------------------
    // Decode Unified Checkout response
    // --------------------------------------------------------

    const decoded = decodeJwtPayload(completeResponse);

    if (!decoded) {
      return res.status(400).json({
        error: "Unable to decode payment result JWT",
      });
    }

    // --------------------------------------------------------
    // Log complete response
    // --------------------------------------------------------

    console.log("Decoded payment result:");

    console.log(JSON.stringify(decoded, null, 2));

    // --------------------------------------------------------
    // CyberSource transaction ID
    // --------------------------------------------------------

    const transactionId = decoded.id || decoded.details?.processorInformation?.transactionId || decoded.transactionId || null;

    // --------------------------------------------------------
    // YOUR custom reference
    //
    // CyberSource's authorization response puts this at:
    //
    // details.clientReferenceInformation.code
    // --------------------------------------------------------

    const clientReferenceCode = decoded.details?.clientReferenceInformation?.code || decoded.clientReferenceInformation?.code || null;

    // --------------------------------------------------------
    // Payment status
    // --------------------------------------------------------

    const status = decoded.status || decoded.outcome || null;

    // --------------------------------------------------------
    // Return useful information
    // --------------------------------------------------------

    return res.status(200).json({
      success: status === "AUTHORIZED",

      status,

      transactionId,

      clientReferenceCode,

      message: decoded.message || null,

      decoded,
    });
  } catch (error) {
    console.error("Payment result error:", error);

    return res.status(500).json({
      error: "Failed to process payment result",

      details: error.message,
    });
  }
};

// ============================================================
// Routes
// ============================================================

app.post("/checkout-session", createCheckoutSession);

app.post("/verify-payment", verifyPaymentResult);

// ============================================================
// Local development
// ============================================================

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

// ============================================================
// Export
// ============================================================

module.exports = app;
