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

const { isConfigured: mleIsConfigured, isJwe, decryptNotification } = require("./responseMle");

// Verifies the v-c-signature header to confirm the notification came from CyberSource.
// Signature format: "t=<timestamp>;keyId=<uuid>;sig=<base64>"
// HMAC-SHA256 over "<timestamp>.<raw_body>" using the webhook shared secret.
const verifyWebhookSignature = (signatureHeader, rawBody) => {
  const WEBHOOK_SECRET = process.env.CYBERSOURCE_WEBHOOK_SECRET;

  // When no secret is configured the webhook subscription uses "No Auth" in EBC2,
  // so CyberSource sends no signature header. Skip verification in that case.
  if (!WEBHOOK_SECRET) {
    return true;
  }

  if (!signatureHeader) {
    console.warn("[CyberSource Webhook] v-c-signature header is missing — expected because CYBERSOURCE_WEBHOOK_SECRET is set.");
    return false;
  }

  const parts = Object.fromEntries(
    signatureHeader.split(";").map((part) => {
      const eqIdx = part.indexOf("=");
      return [part.slice(0, eqIdx).trim(), part.slice(eqIdx + 1).trim()];
    }),
  );

  const { t: timestamp, sig } = parts;

  if (!timestamp || !sig) {
    console.warn("[CyberSource Webhook] v-c-signature header is malformed:", signatureHeader);
    return false;
  }

  // Reject notifications older than 5 minutes to block replay attacks.
  const ageMs = Date.now() - Number(timestamp);

  if (ageMs > 5 * 60 * 1000) {
    console.warn("[CyberSource Webhook] Notification rejected: timestamp is too old.", { ageMs });
    return false;
  }

  const message = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", WEBHOOK_SECRET).update(message, "utf8").digest("base64");

  // Constant-time comparison to prevent timing attacks.
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
};

const handleCybersourceWebhook = async (req, res) => {
  try {
    // Verify the signature before processing anything.
    const signatureHeader = req.headers["v-c-signature"];
    const rawBody = JSON.stringify(req.body);

    if (!verifyWebhookSignature(signatureHeader, rawBody)) {
      console.warn("[CyberSource Webhook] Signature verification failed — rejecting request.");
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    // CyberSource Unified Checkout webhook body shape:
    // { organizationId, webhookId, productId, eventType, eventDate, payload: <JWE string or plain object> }
    const { webhookId, eventType, eventDate, organizationId, productId, payload: rawPayload } = req.body || {};

    // For Unified Checkout, the payload may arrive as a compact JWE string (MLE enabled)
    // or as a plain object (sandbox / MLE disabled). Decrypt when needed.
    let payload = rawPayload;

    if (isJwe(rawPayload)) {
      if (!mleIsConfigured()) {
        console.error("[CyberSource Webhook] Received an encrypted payload but MLE is not configured.");
        return res.status(500).json({ error: "MLE decryption is not configured." });
      }

      payload = decryptNotification(rawPayload);
    }

    // Unified Checkout nests transaction data under payload.transactionResult.
    // Top-level payload.transactionResult.{id,status,outcome} are the summary fields;
    // payload.transactionResult.details contains the full CyberSource payment response.
    const txResult = payload?.transactionResult || {};
    const details = txResult.details || {};

    const transactionId = txResult.id || details.id || null;
    const status = txResult.status || txResult.outcome || null;
    const orderCode = details.clientReferenceInformation?.code || null;
    const amount = details.orderInformation?.amountDetails?.totalAmount || null;
    const currency = details.orderInformation?.amountDetails?.currency || null;
    const cardBrand = details.paymentAccountInformation?.card?.brandName || details.paymentInformation?.card?.type || null;
    const processorResponseCode = details.processorInformation?.responseCode || null;
    const riskScore = details.riskInformation?.score?.result || null;

    console.log("[CyberSource Webhook] Notification received:", {
      webhookId,
      eventType,
      eventDate,
      organizationId,
      productId,
      transactionId,
      status,
    });

    if (eventType === "uc.orders.transactionresults") {
      console.log("[CyberSource Webhook] Transaction result:", {
        transactionId,
        status,
        orderCode,
        amount,
        currency,
        cardBrand,
        processorResponseCode,
        riskScore,
      });
    }

    // Respond immediately with 200 OK so CyberSource knows delivery succeeded
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("[CyberSource Webhook Error]:", error);
    return res.status(500).json({ error: "Failed to process webhook event" });
  }
};

const handleCybersourceHealthCheck = (req, res) => {
  // CyberSource pings the healthCheckUrl to confirm the endpoint is reachable
  return res.status(200).json({ status: "healthy" });
};

app.post("/checkout-session", createCheckoutSession);

app.post("/verify-payment", verifyPaymentResult);

app.get("/webhook/cybersource", handleCybersourceHealthCheck);
app.head("/webhook/cybersource", handleCybersourceHealthCheck);
app.post("/webhook/cybersource", handleCybersourceWebhook);

// Vercel imports the Express app in production; listen locally for development only.
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

