const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const axios = require("axios");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { createHeaders } = require("cybersource-auth");

const HOST = (process.env.CYBERSOURCE_HOST || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;

const createBearerToken = (httpMethod, requestPath) => {
  const iat = Math.floor(Date.now() / 1000);

  const payload = {
    iat,
    exp: iat + 120,
    "request-method": httpMethod.toLowerCase(),
    "request-resource-path": requestPath,
    "request-host": HOST,
    iss: MERCHANT_ID,
    jti: crypto.randomUUID(),
    "v-c-jwt-version": "2",
    "v-c-merchant-id": MERCHANT_ID,
  };

  return jwt.sign(payload, Buffer.from(SHARED_SECRET, "base64"), {
    algorithm: "HS256",
    header: { alg: "HS256", typ: "JWT", kid: API_KEY_ID },
  });
};

const call = async (method, requestPath, body) => {
  const url = `https://${HOST}${requestPath}`;
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  const signatureHeaders = createHeaders(MERCHANT_ID, HOST, method, requestPath, rawBody, API_KEY_ID, SHARED_SECRET);

  try {
    const response = await axios.request({
      method,
      url,
      data: body,
      headers: { ...signatureHeaders, Accept: "application/json", "Content-Type": "application/json" },
      timeout: 20000,
    });

    return { status: response.status, data: response.data };
  } catch (signatureError) {
    const token = createBearerToken(method, requestPath);

    try {
      const response = await axios.request({
        method,
        url,
        data: body,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
        timeout: 20000,
      });

      return { status: response.status, data: response.data };
    } catch (jwtError) {
      return {
        status: jwtError.response?.status || signatureError.response?.status || 0,
        error: {
          httpSignature: signatureError.response?.data || signatureError.message,
          jwt: jwtError.response?.data || jwtError.message,
        },
      };
    }
  }
};

const [command, argument] = process.argv.slice(2);

const DEFAULT_WEBHOOK_ID = "5df62cf3-cbaa-58f7-e063-9e588e0a65b2";
const configuredWebhookId = process.env.CYBERSOURCE_WEBHOOK_ID || DEFAULT_WEBHOOK_ID;

(async () => {
  let result;

  if (command === "list" || !command) {
    result = await call("GET", `/notification-subscriptions/v2/webhooks?organizationId=${encodeURIComponent(MERCHANT_ID)}`);
  } else if (command === "products") {
    result = await call("GET", `/notification-subscriptions/v2/products/${encodeURIComponent(MERCHANT_ID)}`);
  } else if (command === "test") {
    // Sends a sample notification to the subscription's webhook URL.
    result = await call("POST", `/notification-subscriptions/v1/webhooks/${encodeURIComponent(argument || configuredWebhookId)}`, {});
  } else if (command === "delete") {
    result = await call("DELETE", `/notification-subscriptions/v2/webhooks/${encodeURIComponent(argument || configuredWebhookId)}`);
  } else {
    console.log("Usage: node scripts/webhooks.js [list|products|test [webhookId]|delete [webhookId]]");
    process.exit(1);
  }

  console.log(`status ${result.status}`);
  console.log(JSON.stringify(result.data ?? result.error, null, 2));
})();
