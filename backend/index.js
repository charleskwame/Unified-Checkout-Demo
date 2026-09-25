const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const CyberSource = require("cybersource-rest-client");

const app = express();
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

const HOST = process.env.CYBERSOURCE_HOST;
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;

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
    console.error("Failed to decode JWT:", error);
    return null;
  }
};

const normalizedHost = HOST ? HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "") : "";

const createCyberSourceConfig = () => ({
  authenticationType: "jwt",
  jwtKeyType: "SHARED_SECRET",
  merchantID: MERCHANT_ID,
  runEnvironment: normalizedHost,
  merchantKeyId: API_KEY_ID,
  merchantsecretKey: SHARED_SECRET,
  enableLog: false,
});

const callCyberSource = (invoke) =>
  new Promise((resolve, reject) => {
    invoke((error, data, response) => {
      if (error) {
        const sdkError = new Error(typeof error === "string" ? error : error.message || "CyberSource SDK request failed");
        sdkError.status = response?.statusCode || response?.status;
        sdkError.details = error;
        sdkError.response = response;
        reject(sdkError);
        return;
      }

      resolve(data);
    });
  });

const createCheckoutSession = async (req, res) => {
  try {
    if (!HOST || !MERCHANT_ID || !API_KEY_ID || !SHARED_SECRET) {
      return res.status(500).json({
        error: "CyberSource environment variables are not fully configured.",
      });
    }

    const rawPayload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : req.body;
    const payload = normalizeCheckoutPayload(rawPayload);

    const validationErrors = validateCheckoutPayload(payload);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid checkout-session payload.",
        validationErrors,
      });
    }

    const captureContextRequest = CyberSource.GenerateUnifiedCheckoutV1CaptureContextRequest.constructFromObject(payload);
    const captureContextApi = new CyberSource.UnifiedCheckoutV1CaptureContextApi(createCyberSourceConfig());
    const captureContext = await callCyberSource((callback) =>
      captureContextApi.generateUnifiedCheckoutV1CaptureContext(captureContextRequest, callback),
    );

    if (!captureContext) {
      return res.status(500).json({
        error: "CyberSource returned a 200 response, but no Capture Context token was generated.",
        rawResponse: captureContext,
      });
    }

    return res.json(captureContext);
  } catch (error) {
    const details = error.details || error.response?.data;
    console.error("CyberSource API Error:", details || error.message);

    if (error.status || error.response) {
      return res.status(error.status || error.response.status).json({
        error: details?.message || error.message || "CyberSource request failed",
        details,
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

    console.log("Decoded payment result:", decoded);

    return res.status(200).json({
      success: true,
      decoded,
    });
  } catch (error) {
    console.error("Payment result error:", error);

    return res.status(500).json({
      error: "Failed to process payment result",
    });
  }
};

const activateRecurringBilling = async (req, res) => {
  try {
    const decoded = decodeJwtPayload(req.body?.result);

    const subscriptionData = {
      clientReferenceInformation: {
        code: `subscription_${Date.now()}`,
      },
      subscriptionInformation: {
        planId: "7896588237846374604803",
        name: "Daily 20 Test",
        startDate: `${new Date().toISOString()}`,
      },
    };

    const transactionId = decoded?.id;

    if (!transactionId) {
      return res.status(400).json({
        error: "Transaction ID is missing from the decoded result",
      });
    }

    const subscriptionRequest = CyberSource.CreateSubscriptionRequest1.constructFromObject(subscriptionData);
    const subscriptionsApi = new CyberSource.SubscriptionsFollowOnsApi(createCyberSourceConfig());
    const subscriptionResponse = await callCyberSource((callback) =>
      subscriptionsApi.createFollowOnSubscription(transactionId, subscriptionRequest, callback),
    );

    return res.status(200).json({
      success: true,
      response: subscriptionResponse,
    });
  } catch (error) {
    const details = error.details || error.response?.data;
    console.error("Recurring billing error:", details || error.message);

    return res.status(error.status || error.response?.status || 500).json({
      error: details?.message || error.message || "Failed to process recurring billing",
      details,
    });
  }
};

app.post("/activate-recurring-billing", activateRecurringBilling);

app.post("/checkout-session", createCheckoutSession);

app.post("/verify-payment", verifyPaymentResult);

console.log(`Backend server started at ${new Date().toISOString()}`);

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

module.exports = app;

// {
//   "metadata": {
//     "ccJti": "c2wjhGwEUZPcWRgN",
//     "ttJti": "1E5RN0D7U0ZA3OONWAMFH1AD2YZZA4BTJWNPLAQOUBF3FD7H5ZEF6AB683C926B9"
//   },
//   "details": {
//     "clientReferenceInformation": {
//       "code": "1790345237572"
//     },
//     "consumerAuthenticationInformation": {
//       "eci": "05",
//       "ecommerceIndicator": "vbv"
//     },
//     "orderInformation": {
//       "amountDetails": {
//         "authorizedAmount": "50.00",
//         "currency": "USD",
//         "totalAmount": "50.00"
//       }
//     },
//     "paymentAccountInformation": {
//       "card": {
//         "type": "001"
//       }
//     },
//     "paymentInformation": {
//       "card": {
//         "type": "001"
//       },
//       "tokenizedCard": {
//         "type": "001"
//       }
//     },
//     "processorInformation": {
//       "approvalCode": "681826",
//       "networkTransactionId": "016153570198200",
//       "responseCode": "00",
//       "retrievalReferenceNumber": "626814091071",
//       "systemTraceAuditNumber": "091071",
//       "transactionId": "016153570198200"
//     },
//     "reconciliationId": "7903452863176907004011",
//     "submitTimeUtc": "2026-09-25T14:08:06Z"
//   },
//   "id": "7903452863176907004011",
//   "message": "Request processed successfully.",
//   "outcome": "AUTHORIZED",
//   "status": "AUTHORIZED"
// }
