const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { createHeaders } = require("cybersource-auth");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
// Only the deployed checkout clients and local Vite development server may call this API.
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

// These values are used to authenticate server-to-server requests to CyberSource.
const HOST = process.env.CYBERSOURCE_HOST;
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;
const resourcePath = "/uc/v1/sessions";

const decodeJwtPayload = (token) => {
  // Payment results are JWTs; decode the payload for verification and API consumers.
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
    console.error("Failed to decode JWT:", error);
    return null;
  }
};

const createBearerToken = (merchantId, keyId, host, httpMethod, requestPath, sharedSecret) => {
  // CyberSource JWT (symmetric key) v2: the shared secret, base64-decoded, signs an HS256 token
  // that is sent as `Authorization: Bearer <token>`. The API key ID must be in the JWT header
  // as `kid`, otherwise the Transaction Details gateway rejects the request with 400 bad_request.
  const iat = Math.floor(Date.now() / 1000);

  const payload = {
    iat,
    exp: iat + 120,
    "request-method": httpMethod.toLowerCase(),
    "request-resource-path": requestPath,
    "request-host": host,
    iss: merchantId,
    jti: crypto.randomUUID(),
    "v-c-jwt-version": "2",
    "v-c-merchant-id": merchantId,
  };

  return jwt.sign(payload, Buffer.from(sharedSecret, "base64"), {
    algorithm: "HS256",
    header: { alg: "HS256", typ: "JWT", kid: keyId },
  });
};

const createCheckoutSession = async (req, res) => {
  try {
    // Fail early when the server cannot create an authenticated CyberSource request.
    if (!HOST || !MERCHANT_ID || !API_KEY_ID || !SHARED_SECRET) {
      return res.status(500).json({
        error: "CyberSource environment variables are not fully configured.",
      });
    }

    const normalizedHost = HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const url = `https://${normalizedHost}${resourcePath}`;

    // Accept either the frontend's wrapped payload or a direct checkout payload.
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

    // CyberSource signs the exact request path and body, so create headers after normalization.
    const headers = createHeaders(MERCHANT_ID, normalizedHost, "post", resourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

    const response = await axios.post(url, payload, { headers, timeout: 10000 });

    const captureContext = response.data;

    if (!captureContext) {
      return res.status(500).json({
        error: "CyberSource returned a 200 response, but no Capture Context token was generated.",
        responseHeaders: response.headers,
        rawResponse: response.data,
      });
    }

    return res.json(captureContext);
  } catch (error) {
    console.error("CyberSource API Error:", error.response?.data || error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data?.message || "CyberSource request failed",
        details: error.response.data,
      });
    }

    return res.status(500).json({ error: error.message });
  }
};

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
  // Keep the CyberSource request shape consistent when callers use the legacy orderInformation location.
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

const verifyPaymentResult = async (req, res) => {
  try {
    // The frontend sends the SDK's signed completion response for server-side decoding.
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

    // Transaction Details keys off the request ID returned by the payment, which is the JWT's `id`.
    const transactionId = decoded.id;

    if (!transactionId) {
      return res.status(400).json({
        error: "Transaction ID is missing from the payment result JWT",
      });
    }

    // Fail early when the server cannot create an authenticated CyberSource request.
    if (!HOST || !MERCHANT_ID || !API_KEY_ID || !SHARED_SECRET) {
      return res.status(500).json({
        error: "CyberSource environment variables are not fully configured.",
      });
    }

    const normalizedHost = HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const basePath = process.env.PAYMENTVERIFY_RESOURCE_PATH || "/tss/v2/transactions";
    const transactionResourcePath = `${basePath.replace(/\/+$/, "")}/${encodeURIComponent(transactionId)}`;
    const url = `https://${normalizedHost}${transactionResourcePath}`;

    // Transaction Details uses a GET with no request body, authenticated with a JWT bearer token.
    const token = createBearerToken(MERCHANT_ID, API_KEY_ID, normalizedHost, "get", transactionResourcePath, SHARED_SECRET);

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/hal+json" },
      timeout: 10000,
    });

    // Return the full CyberSource response for now.
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Payment result error:", error.response?.status, error.response?.data || error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data?.message || "CyberSource request failed",
        status: error.response.status,
        details: error.response.data || error.response.statusText,
      });
    }

    return res.status(500).json({
      error: "Failed to process payment result",
    });
  }
};

app.post("/checkout-session", createCheckoutSession);

app.post("/verify-payment", verifyPaymentResult);

// Vercel imports the Express app in production; listen locally for development only.
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
