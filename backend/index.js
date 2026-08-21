import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createHeaders } from "cybersource-auth";
import { decodeJwt } from "jose";

dotenv.config();

const app = express();

/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "https://unified-checkout-frontend.vercel.app";

const HOST = process.env.CYBERSOURCE_HOST;
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;

const RESOURCE_PATH = "/uc/v1/sessions";

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function normalizeHost(host) {
  if (!host) {
    return "";
  }

  return host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function normalizeCheckoutPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? { ...rawPayload } : {};

  if (typeof payload.data !== "object" || payload.data === null) {
    payload.data = {};
  }

  /*
   * If orderInformation was sent at the top level,
   * move it under data.orderInformation.
   */
  if (payload.orderInformation && !payload.data.orderInformation) {
    payload.data.orderInformation = payload.orderInformation;
  }

  delete payload.orderInformation;

  return payload;
}

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

/*
|--------------------------------------------------------------------------
| Health check
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Unified Checkout backend is running.",
  });
});

/*
|--------------------------------------------------------------------------
| Create CyberSource Capture Context
|--------------------------------------------------------------------------
*/

const createCheckoutSession = async (req, res) => {
  try {
    /*
     * Validate environment configuration.
     */
    if (!HOST || !MERCHANT_ID || !API_KEY_ID || !SHARED_SECRET) {
      console.error("Missing CyberSource environment variables.");

      return res.status(500).json({
        error: "CyberSource environment variables are not fully configured.",
      });
    }

    const normalizedHost = normalizeHost(HOST);

    if (!normalizedHost) {
      return res.status(500).json({
        error: "CYBERSOURCE_HOST is invalid.",
      });
    }

    const url = `https://${normalizedHost}${RESOURCE_PATH}`;

    /*
     * Support either:
     *
     * {
     *   payload: {...}
     * }
     *
     * or directly:
     *
     * {
     *   targetOrigins: [...]
     * }
     */
    const rawPayload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : req.body;

    const payload = normalizeCheckoutPayload(rawPayload);

    /*
     * Validate request.
     */
    const validationErrors = validateCheckoutPayload(payload);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid checkout-session payload.",
        validationErrors,
      });
    }

    const rawBody = JSON.stringify(payload);

    /*
     * Generate CyberSource authentication headers.
     */
    const headers = createHeaders(MERCHANT_ID, normalizedHost, "post", RESOURCE_PATH, rawBody, API_KEY_ID, SHARED_SECRET);

    /*
     * Call CyberSource Unified Checkout Sessions API.
     */
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: rawBody,
      signal: AbortSignal.timeout(10000),
    });

    const responseText = await response.text();

    const data = safeParseJson(responseText);

    /*
     * CyberSource error.
     */
    if (!response.ok) {
      console.error("CyberSource checkout-session error:", {
        status: response.status,
        data,
      });

      return res.status(response.status).json({
        error: data.message || `CyberSource request failed (${response.status})`,
        details: data.details || data,
      });
    }

    /*
     * Extract Capture Context.
     */
    const captureContext = extractCaptureContext(response, data, responseText);

    if (!captureContext) {
      console.error("CyberSource response did not contain Capture Context.", {
        status: response.status,
        data,
        responseText,
      });

      return res.status(500).json({
        error: "CyberSource returned a successful response, but no Capture Context token was generated.",
      });
    }

    /*
     * Return Capture Context to frontend.
     */
    return res.status(200).json({
      captureContext,
    });
  } catch (error) {
    console.error("createCheckoutSession error:", error);

    return res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Verify / Inspect Complete Mandate Result
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| decodeJwt() ONLY decodes the JWT.
| It does NOT cryptographically verify the JWT.
|
| We are intentionally keeping this endpoint in "decode"
| mode until the appropriate CyberSource verification key/
| mechanism is configured.
|
|--------------------------------------------------------------------------
*/

const verifyPaymentResult = async (req, res) => {
  try {
    const { completeResponse } = req.body;

    if (!completeResponse || typeof completeResponse !== "string") {
      return res.status(400).json({
        error: "completeResponse JWT is required.",
      });
    }

    /*
     * Decode the Complete Mandate result.
     */
    const decoded = decodeJwt(completeResponse);

    console.log("Complete Mandate result:", decoded);

    /*
     * Extract useful payment information.
     */
    const status = decoded.status;
    const outcome = decoded.outcome;

    const amount = decoded.details?.orderInformation?.amountDetails?.authorizedAmount;

    const currency = decoded.details?.orderInformation?.amountDetails?.currency;

    const transactionId = decoded.details?.processorInformation?.transactionId;

    const reconciliationId = decoded.reconciliationId;

    /*
     * IMPORTANT:
     *
     * This is NOT yet a trusted payment decision.
     *
     * decodeJwt() does not verify the JWT signature.
     */
    return res.status(200).json({
      success: true,

      payment: {
        status,
        outcome,
        amount,
        currency,
        transactionId,
        reconciliationId,
      },

      /*
       * Useful while debugging.
       *
       * Remove this in production.
       */
      decoded,
    });
  } catch (error) {
    console.error("Payment result decoding failed:", error);

    return res.status(400).json({
      error: "Invalid Complete Mandate JWT.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
*/

app.post("/checkout-session", createCheckoutSession);

app.post("/verify-payment", verifyPaymentResult);

/*
|--------------------------------------------------------------------------
| Local development
|--------------------------------------------------------------------------
|
| Vercel imports `app` directly.
| We only call app.listen() when running locally.
|--------------------------------------------------------------------------
*/

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

/*
|--------------------------------------------------------------------------
| Vercel export
|--------------------------------------------------------------------------
*/

export default app;
