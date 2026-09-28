// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// require("dotenv").config({ path: path.join(__dirname, ".env") });
// const { createHeaders } = require("cybersource-auth");
// const jwt = require("jsonwebtoken");
// const axios = require("axios");

// const app = express();
// const allowedOrigins = [
//   "https://unified-checkout-frontend.vercel.app",
//   "https://reactjsimplementation.vercel.app",
//   "http://localhost:5173",
//   process.env.FRONTEND_ORIGIN,
// ].filter(Boolean);

// app.use(
//   cors({
//     origin: (origin, callback) => {
//       if (!origin || allowedOrigins.includes(origin)) {
//         callback(null, true);
//         return;
//       }

//       callback(new Error("Origin is not allowed by CORS."));
//     },
//     methods: ["GET", "POST", "OPTIONS"],
//     allowedHeaders: ["Content-Type", "Authorization"],
//   }),
// );

// app.use(express.json());

// const HOST = process.env.CYBERSOURCE_HOST;
// const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
// const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
// const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;
// const resourcePath = "/uc/v1/sessions";
// const subscriptionResourcePath = process.env.SUBSCRIPTION_RESOURCE_PATH;

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

// const normalizedHost = HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");

// const createCheckoutSession = async (req, res) => {
//   try {
//     if (!HOST || !MERCHANT_ID || !API_KEY_ID || !SHARED_SECRET) {
//       return res.status(500).json({
//         error: "CyberSource environment variables are not fully configured.",
//       });
//     }

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

//     const response = await axios.post(url, payload, { headers, timeout: 10000 });

//     const captureContext = response.data;

//     if (!captureContext) {
//       return res.status(500).json({
//         error: "CyberSource returned a 200 response, but no Capture Context token was generated.",
//         responseHeaders: response.headers,
//         rawResponse: response.data,
//       });
//     }

//     return res.json(captureContext);
//   } catch (error) {
//     console.error("CyberSource API Error:", error.response?.data || error.message);

//     if (error.response) {
//       return res.status(error.response.status).json({
//         error: error.response.data?.message || "CyberSource request failed",
//         details: error.response.data,
//       });
//     }

//     return res.status(500).json({ error: error.message });
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
// };

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
// };

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

// const activateRecurringBilling = async (req, res) => {
//   try {
//     const decoded = decodeJwtPayload(req.body?.result);

//     const transactionId = decoded?.id;

//     if (!transactionId) {
//       return res.status(400).json({
//         error: "Transaction ID is missing from the decoded result",
//       });
//     }

//     const subscriptionData = {
//       clientReferenceInformation: {
//         code: `subscription_${Date.now()}`,
//       },
//       subscriptionInformation: {
//         planId: "7896588237846374604803",
//         name: "Daily 20 Test",
//         startDate: `${new Date().toISOString()}`,
//       },
//     };

//     const rawBody = JSON.stringify(subscriptionData);

//     if (!transactionId) {
//       return res.status(400).json({
//         error: "Transaction ID is missing from the decoded result",
//       });
//     }

//     const resourcePath = `${subscriptionResourcePath}/${transactionId}`;

//     const headers = createHeaders(MERCHANT_ID, normalizedHost, "post", resourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

//     const response = await axios.post(`https://${normalizedHost}${resourcePath}`, rawBody, {
//       headers: {
//         ...headers,
//         "Content-Type": "application/json",
//       },
//       timeout: 10000,
//     });

//     return res.status(200).json({
//       success: true,
//       response: response?.data,
//     });
//   } catch (error) {
//     console.error("Recurring billing error:", error.response?.data || error.message);
//     return res.status(500).json({
//       error: "Failed to process recurring billing",
//       details: error.response?.data ?? null,
//     });
//   }
// };

// app.post("/activate-recurring-billing", activateRecurringBilling);

// app.post("/checkout-session", createCheckoutSession);

// // app.post("/verify-payment", verifyPaymentResult);

// console.log(`Backend server started at ${new Date().toISOString()}`);

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
const axios = require("axios");

const app = express();

// ============================================================
// CORS
// ============================================================

const allowedOrigins = [
  "https://unified-checkout-frontend.vercel.app",
  "https://reactjsimplementation.vercel.app",
  "http://localhost:5173",
  process.env.FRONTEND_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

// ============================================================
// ENVIRONMENT
// ============================================================

const HOST = process.env.CYBERSOURCE_HOST;
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;

const resourcePath = "/uc/v1/sessions";

const subscriptionResourcePath = process.env.SUBSCRIPTION_RESOURCE_PATH || "/rbs/v1/subscriptions";

// Remove protocol and trailing slash from CyberSource host.
const normalizedHost = HOST ? HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "") : "";

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================

const validateEnvironment = () => {
  const required = {
    CYBERSOURCE_HOST: HOST,
    CYBERSOURCE_MERCHANT_ID: MERCHANT_ID,
    CYBERSOURCE_API_KEY_ID: API_KEY_ID,
    CYBERSOURCE_API_SECRET_KEY: SHARED_SECRET,
    SUBSCRIPTION_RESOURCE_PATH: subscriptionResourcePath,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return missing;
};

// Don't log secrets.
console.log("CyberSource configuration:", {
  host: normalizedHost || "MISSING",
  merchantId: MERCHANT_ID ? "SET" : "MISSING",
  apiKeyId: API_KEY_ID ? "SET" : "MISSING",
  apiSecretKey: SHARED_SECRET ? "SET" : "MISSING",
  subscriptionResourcePath: subscriptionResourcePath || "MISSING",
});

// ============================================================
// JWT DECODER
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

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    const json = Buffer.from(base64, "base64").toString("utf8");

    return JSON.parse(json);
  } catch (error) {
    console.error("Failed to decode JWT:", error.message);
    return null;
  }
};

// ============================================================
// CHECKOUT SESSION
// ============================================================

const validateCheckoutPayload = (payload) => {
  const errors = [];

  if (!Array.isArray(payload.targetOrigins) || payload.targetOrigins.length === 0) {
    errors.push("targetOrigins must be a non-empty array.");
  }

  if (typeof payload.clientVersion !== "string" || payload.clientVersion.trim().length === 0) {
    errors.push("clientVersion is required.");
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
};

const normalizeCheckoutPayload = (rawPayload) => {
  const payload = rawPayload && typeof rawPayload === "object" ? { ...rawPayload } : {};

  if (typeof payload.data !== "object" || payload.data === null) {
    payload.data = {};
  }

  if (payload.orderInformation && !payload.data.orderInformation) {
    payload.data.orderInformation = payload.orderInformation;
  }

  delete payload.orderInformation;

  return payload;
};

const createCheckoutSession = async (req, res) => {
  try {
    const missingEnv = validateEnvironment();

    if (missingEnv.length > 0) {
      console.error("Missing CyberSource environment variables:", missingEnv);

      return res.status(500).json({
        error: "CyberSource environment variables are not fully configured.",
        missing: missingEnv,
      });
    }

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

    const response = await axios.post(url, rawBody, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    const captureContext = response.data;

    if (!captureContext) {
      return res.status(500).json({
        error: "CyberSource returned a successful response, but no Capture Context token was generated.",
        responseHeaders: response.headers,
        rawResponse: response.data,
      });
    }

    return res.json(captureContext);
  } catch (error) {
    console.error("CyberSource checkout error:", error.response?.data || error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data?.message || "CyberSource request failed",
        details: error.response.data,
      });
    }

    return res.status(500).json({
      error: error.message,
    });
  }
};

// ============================================================
// PAYMENT RESULT
// ============================================================

const verifyPaymentResult = async (req, res) => {
  try {
    const { completeResponse } = req.body;

    if (!completeResponse) {
      return res.status(400).json({
        error: "completeResponse JWT is required",
      });
    }

    const decoded = decodeJwtPayload(completeResponse);

    if (!decoded) {
      return res.status(400).json({
        error: "Unable to decode payment result JWT",
      });
    }

    console.log("Decoded payment result:", {
      id: decoded.id,
      status: decoded.status,
      reason: decoded.reason,
    });

    return res.status(200).json({
      success: true,
      decoded,
    });
  } catch (error) {
    console.error("Payment result error:", error.message);

    return res.status(500).json({
      error: "Failed to process payment result",
    });
  }
};

// ============================================================
// RECURRING BILLING
// ============================================================

const activateRecurringBilling = async (req, res) => {
  try {
    console.log("===== RECURRING BILLING REQUEST =====");

    // --------------------------------------------------------
    // 1. Validate environment
    // --------------------------------------------------------

    const missingEnv = validateEnvironment();

    if (missingEnv.length > 0) {
      console.error("Missing environment variables:", missingEnv);

      return res.status(500).json({
        error: "CyberSource environment variables are not fully configured.",
        missing: missingEnv,
      });
    }

    // --------------------------------------------------------
    // 2. Validate incoming JWT
    // --------------------------------------------------------

    const result = req.body?.result;

    console.log("Has result:", !!result);
    console.log("Result length:", typeof result === "string" ? result.length : 0);

    if (!result) {
      return res.status(400).json({
        error: "Payment result JWT is required.",
      });
    }

    const decoded = decodeJwtPayload(result);

    if (!decoded) {
      return res.status(400).json({
        error: "Unable to decode payment result JWT.",
      });
    }

    // IMPORTANT:
    // Don't log the complete JWT or sensitive payment data.
    console.log("Decoded payment result:", {
      id: decoded.id,
      status: decoded.status,
      reason: decoded.reason,
    });

    // --------------------------------------------------------
    // 3. Get transaction ID
    // --------------------------------------------------------

    const transactionId = decoded?.id;

    if (!transactionId) {
      return res.status(400).json({
        error: "Transaction ID is missing from the decoded result.",
      });
    }

    // --------------------------------------------------------
    // 4. Build subscription request
    // --------------------------------------------------------

    const subscriptionData = {
      clientReferenceInformation: {
        code: `subscription_${Date.now()}`,
      },

      subscriptionInformation: {
        planId: "7896588237846374604803",
        name: "Daily 20 Test",
        startDate: new Date().toISOString(),
      },
    };

    // IMPORTANT:
    // This exact body is used both for signing and
    // for the actual HTTP request.
    const rawBody = JSON.stringify(subscriptionData);

    // --------------------------------------------------------
    // 5. Build CyberSource resource path
    // --------------------------------------------------------

    const finalResourcePath = `${subscriptionResourcePath}/${transactionId}`;

    const url = `https://${normalizedHost}${finalResourcePath}`;

    console.log("CyberSource recurring request:", {
      host: normalizedHost,
      resourcePath: finalResourcePath,
      transactionId,
      url,
      merchantId: MERCHANT_ID,
      apiKeyId: API_KEY_ID,
      subscriptionResourcePath,
    });

    // --------------------------------------------------------
    // 6. Generate CyberSource HTTP Signature
    // --------------------------------------------------------

    const headers = createHeaders(MERCHANT_ID, normalizedHost, "post", finalResourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

    // Don't expose authorization/signature in logs.
    console.log("Generated CyberSource headers:", {
      host: headers.host,
      date: headers.date,
      digest: headers.digest,
      requestTarget: headers["(request-target)"],
      hasAuthorization: !!headers.Authorization,
    });

    // --------------------------------------------------------
    // 7. Make CyberSource request
    // --------------------------------------------------------

    const response = await axios.post(url, rawBody, {
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },

      timeout: 10000,
    });

    // --------------------------------------------------------
    // 8. Log successful response
    // --------------------------------------------------------

    console.log("CyberSource recurring billing response:", {
      status: response.status,
      data: response.data,
    });

    console.log("===== RECURRING BILLING SUCCESS =====");

    return res.status(200).json({
      success: true,
      response: response.data,
    });
  } catch (error) {
    // --------------------------------------------------------
    // IMPORTANT DEBUGGING INFORMATION
    // --------------------------------------------------------

    console.error("===== RECURRING BILLING ERROR =====");

    console.error("Message:", error.message);

    console.error("Code:", error.code);

    console.error("HTTP status:", error.response?.status);

    console.error("CyberSource response:", JSON.stringify(error.response?.data || null, null, 2));

    console.error("CyberSource response headers:", JSON.stringify(error.response?.headers || null, null, 2));

    console.error("Stack:", error.stack);

    console.error("====================================");

    // --------------------------------------------------------
    // Return CyberSource's actual HTTP status
    // --------------------------------------------------------

    const status = error.response?.status || 500;

    return res.status(status).json({
      error: "Failed to process recurring billing.",

      // Useful during deployment debugging.
      status,

      code: error.code || null,

      details: error.response?.data || null,

      message: error.response?.data?.message || error.message,
    });
  }
};

// ============================================================
// ROUTES
// ============================================================

app.post("/activate-recurring-billing", activateRecurringBilling);

app.post("/checkout-session", createCheckoutSession);

// Uncomment if needed.
// app.post("/verify-payment", verifyPaymentResult);

// ============================================================
// START SERVER
// ============================================================

console.log(`Backend server started at ${new Date().toISOString()}`);

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
