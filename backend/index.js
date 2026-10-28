const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { createHeaders } = require("cybersource-auth");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const axios = require("axios");
const { isConfigured: isResponseMleConfigured, isJwe, decryptNotification } = require("./responseMle");

const app = express();
// Only the deployed checkout clients and local Vite development server may call this API.
const allowedOrigins = [
  "https://unified-checkout-frontend.vercel.app",
  "https://reactjsimplementation.vercel.app",
  "http://localhost:5173",
  // Unified Checkout rejects http origins, so local dev runs the Vite server over HTTPS.
  "https://localhost:5173",
  "https://127.0.0.1:5173",
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

// Response MLE notifications can arrive as a raw JWE instead of JSON.
app.use(express.text({ type: ["text/plain", "application/jwt", "application/jwe", "application/octet-stream"], limit: "1mb" }));

// These values are used to authenticate server-to-server requests to CyberSource.
const HOST = process.env.CYBERSOURCE_HOST;
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;
const resourcePath = "/uc/v1/sessions";

// Webhook endpoint configured in EBC2. EBC2 calls the same URL with GET for the
// health check and with POST for transaction notifications. Verification uses the
// symmetric egress key (base64) shown/downloaded when the webhook is created.
const WEBHOOK_PATH = "/webhook/cybersource";
const WEBHOOK_SIGNING_KEY = process.env.CYBERSOURCE_WEBHOOK_SIGNING_KEY;
// Optional replay protection window; EBC2 timestamps are epoch milliseconds.
const WEBHOOK_MAX_SKEW_MS = Number(process.env.CYBERSOURCE_WEBHOOK_MAX_SKEW_MS || 0);

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

const normalizeTransactionStatus = (transaction) => {
  // Transaction Details has no single top-level status, so flatten the pieces clients care about.
  const applications = Array.isArray(transaction?.applicationInformation?.applications) ? transaction.applicationInformation.applications : [];

  const authResult = applications.find((application) => application?.name === "ics_auth");
  const declined = applications.some((application) => application?.rFlag && application.rFlag !== "SOK");
  const authorized = declined ? false : authResult ? authResult.rFlag === "SOK" : applications.some((application) => application?.rFlag === "SOK");

  const reportedStatus = transaction?.applicationInformation?.status;

  let status = null;

  if (declined) {
    status = "DECLINED";
  } else if (reportedStatus) {
    status = String(reportedStatus).toUpperCase();
  } else if (authorized) {
    status = "AUTHORIZED";
  }

  return {
    status,
    authorized,
    paymentId: transaction?.id || null,
    orderCode: transaction?.clientReferenceInformation?.code || null,
    amount: transaction?.orderInformation?.amountDetails?.totalAmount || null,
    currency: transaction?.orderInformation?.amountDetails?.currency || null,
    submittedAtUtc: transaction?.submitTimeUTC || null,
  };
};

const verifyPaymentResult = async (req, res) => {
  let requestedTransactionId = null;
  let requestedOrderCode = null;
  let decodedStatus = null;

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
    let transactionId = decoded.id;
    const orderCode = decoded.details?.clientReferenceInformation?.code || null;

    requestedTransactionId = transactionId || null;
    requestedOrderCode = orderCode;
    decodedStatus = decoded.status || null;

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
    const transactionBasePath = basePath.replace(/\/+$/, "");

    const fetchTransaction = async (id) => {
      const transactionResourcePath = `${transactionBasePath}/${encodeURIComponent(id)}`;
      const token = createBearerToken(MERCHANT_ID, API_KEY_ID, normalizedHost, "get", transactionResourcePath, SHARED_SECRET);

      return axios.get(`https://${normalizedHost}${transactionResourcePath}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/hal+json" },
        timeout: 10000,
      });
    };

    const findTransactionIdByOrderCode = async (code) => {
      // Transaction Details can lag behind the payment, so fall back to searching by order reference.
      const searchPath = "/tss/v2/searches";
      const rawBody = JSON.stringify({ query: `clientReferenceInformation.code:"${code}"`, offset: 0, limit: 1 });
      const headers = createHeaders(MERCHANT_ID, normalizedHost, "post", searchPath, rawBody, API_KEY_ID, SHARED_SECRET);

      const response = await axios.post(`https://${normalizedHost}${searchPath}`, rawBody, { headers, timeout: 10000 });

      return response.data?._embedded?.transactionSummaries?.[0]?.id || null;
    };

    let response;

    try {
      response = await fetchTransaction(transactionId);
    } catch (error) {
      if (error.response?.status !== 404 || !orderCode) {
        throw error;
      }

      const resolvedTransactionId = await findTransactionIdByOrderCode(orderCode);

      if (!resolvedTransactionId) {
        throw error;
      }

      transactionId = resolvedTransactionId;
      response = await fetchTransaction(resolvedTransactionId);
    }

    const transaction = response.data;

    // Return the full CyberSource response plus a normalized summary for the checkout clients.
    return res.status(response.status).json({
      ...transaction,
      ...normalizeTransactionStatus(transaction),
    });
  } catch (error) {
    console.error("Payment result error:", error.response?.status, error.response?.data || error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: error.response.data?.message || "CyberSource request failed",
        status: error.response.status,
        requestedTransactionId,
        orderCode: requestedOrderCode,
        jwtStatus: decodedStatus,
        details: error.response.data || error.response.statusText,
      });
    }

    return res.status(500).json({
      error: "Failed to process payment result",
    });
  }
};

const parseWebhookSignature = (signatureHeader) => {
  // EBC2 sends `v-c-signature: t=<epoch-ms>;keyId=<uuid>;sig=<base64 HMAC-SHA256>`.
  if (typeof signatureHeader !== "string" || signatureHeader.trim().length === 0) {
    return null;
  }

  const fields = signatureHeader.split(";").reduce((acc, part) => {
    const separator = part.indexOf("=");

    if (separator > 0) {
      acc[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
    }

    return acc;
  }, {});

  if (!fields.t || !fields.sig) {
    return null;
  }

  return { timestamp: fields.t, keyId: fields.keyId || null, signature: fields.sig };
};

const verifyWebhookSignature = (signatureHeader, payload) => {
  const parsed = parseWebhookSignature(signatureHeader);

  if (!parsed) {
    return { valid: false, reason: "Missing or malformed v-c-signature header." };
  }

  // The signed value is `<timestamp>.<JSON payload>`; the HMAC key is the base64
  // egress key decoded to bytes.
  const signedValue = `${parsed.timestamp}.${JSON.stringify(payload)}`;

  const expected = crypto.createHmac("sha256", Buffer.from(WEBHOOK_SIGNING_KEY, "base64")).update(signedValue, "utf8").digest("base64");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(parsed.signature);

  if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
    return { valid: false, reason: "Signature does not match the notification payload." };
  }

  if (WEBHOOK_MAX_SKEW_MS > 0) {
    const timestamp = Number(parsed.timestamp);

    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > WEBHOOK_MAX_SKEW_MS) {
      return { valid: false, reason: "Notification timestamp is outside the accepted window." };
    }
  }

  return { valid: true, keyId: parsed.keyId };
};

const summarizeWebhookTransaction = (transactionResult) => {
  // The UC transaction result nests the status differently per flow, so be tolerant.
  const status =
    transactionResult?.status ||
    transactionResult?.responseStatus?.status ||
    transactionResult?.decisionStatus ||
    transactionResult?.transactionStatus ||
    null;

  return {
    transactionId: transactionResult?.id || transactionResult?.requestID || null,
    orderCode: transactionResult?.clientReferenceInformation?.code || null,
    status: status ? String(status).toUpperCase() : null,
    decision: transactionResult?.decision || transactionResult?.responseStatus?.decision || null,
    amount: transactionResult?.orderInformation?.amountDetails?.totalAmount || null,
    currency: transactionResult?.orderInformation?.amountDetails?.currency || null,
    submittedAtUtc: transactionResult?.submitTimeUtc || null,
  };
};

const cyberSourceWebhookHealthCheck = (req, res) => {
  // EBC2 treats any 2xx answer as a healthy endpoint.
  return res.status(200).json({ status: "ok", endpoint: WEBHOOK_PATH });
};

const receiveCyberSourceWebhook = (req, res) => {
  // EBC2 retries when the endpoint is slow or returns 4xx/5xx, so keep this fast.
  const rawBody = typeof req.body === "string" ? req.body.trim() : "";

  let notification = req.body && typeof req.body === "object" ? req.body : {};
  let wasEncrypted = false;

  // Response MLE sends either `{ encData: "<JWE>" }` or the bare JWE as the body.
  const encryptedPayload = notification.encData || (isJwe(rawBody) ? rawBody : null);

  if (encryptedPayload) {
    if (!isResponseMleConfigured()) {
      console.warn("[webhook] Received an encrypted notification but Response MLE is not configured.");
      return res.status(200).json({ status: "ignored", reason: "Encrypted payload requires Response MLE decryption." });
    }

    try {
      notification = decryptNotification(encryptedPayload);
      wasEncrypted = true;
    } catch (error) {
      console.error("[webhook] Failed to decrypt notification:", error.message);
      return res.status(400).json({ status: "rejected", error: "Unable to decrypt the notification payload." });
    }
  }

  const eventType = notification.eventType || null;
  const webhookId = notification.webhookId || null;

  if (wasEncrypted) {
    // An encrypted body has no plaintext payload to sign; a successful decryption
    // with the merchant private key is the authenticity check.
    console.log(`[webhook] Decrypted Response MLE payload (webhookId=${webhookId}); v-c-signature check skipped.`);
  } else if (WEBHOOK_SIGNING_KEY) {
    const verification = verifyWebhookSignature(req.get("v-c-signature"), notification.payload);

    if (!verification.valid) {
      console.warn(`[webhook] Rejected notification (webhookId=${webhookId}): ${verification.reason}`);
      return res.status(401).json({ status: "rejected", error: verification.reason });
    }
  } else {
    console.warn("[webhook] CYBERSOURCE_WEBHOOK_SIGNING_KEY is not set; accepting unverified notification.");
  }

  const transactionResult = notification.payload?.transactionResult || notification.payload || {};

  console.log(`[webhook] ${eventType || "unknown event"} (webhookId=${webhookId})`, JSON.stringify(summarizeWebhookTransaction(transactionResult)));

  return res.status(200).json({ status: "received", eventType, webhookId });
};

app.post("/checkout-session", createCheckoutSession);

app.post("/verify-payment", verifyPaymentResult);

// EBC2 webhook endpoint: GET is the health check, POST delivers notifications.
app.get(WEBHOOK_PATH, cyberSourceWebhookHealthCheck);

app.post(WEBHOOK_PATH, receiveCyberSourceWebhook);

// Vercel imports the Express app in production; listen locally for development only.
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
