const express = require("express");
const http = require("http");
const cors = require("cors");
require("dotenv").config();
const { createHeaders } = require("cybersource-auth");

const HOST = process.env.CYBERSOURCE_HOST;
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;
const resourcePath = "/uc/v1/sessions";

const app = express();
app.use(cors({ origin: ["*"] }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

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
    console.log("CyberSource response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || `CyberSource request failed (${response.status})`,
        details: data.details || data,
      });
    }

    const captureContext = extractCaptureContext(response, data, responseText);

    if (!captureContext) {
      console.warn("No captureContext token found in response object:", data);
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

app.post("/checkout-session", createCheckoutSession);

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

server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
