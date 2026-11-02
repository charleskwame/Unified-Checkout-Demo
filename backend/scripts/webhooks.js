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
        error: jwtError.response?.data || signatureError.response?.data || jwtError.message,
      };
    }
  }
};

const [command, argument] = process.argv.slice(2);

const fs = require("fs");
const ENV_PATH = path.join(__dirname, "..", ".env");
const WEBHOOK_URL = argument || "https://unified-checkout-backend.vercel.app/webhook/cybersource";

const upsertEnv = (key, value) => {
  const content = fs.readFileSync(ENV_PATH, "utf8");
  const line = `${key} = ${value}`;
  const pattern = new RegExp(`^${key} *=.*$`, "m");

  fs.writeFileSync(ENV_PATH, pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`);
};

const mask = (value) => (value ? `${value.slice(0, 4)}…${value.slice(-4)}` : "");

const createSubscription = async () => {
  // 1. Generate the egress symmetric key EBC2 uses to sign notifications.
  const keyResult = await call("POST", "/kms/egress/v2/keys-sym", {
    clientRequestAction: "CREATE",
    keyInformation: { provider: "nrtd", tenant: MERCHANT_ID, keyType: "sharedSecret", organizationId: MERCHANT_ID },
  });

  if (keyResult.status !== 201 && keyResult.status !== 200) {
    console.log(`key generation failed: status ${keyResult.status}`);
    console.log(JSON.stringify(keyResult.data ?? keyResult.error, null, 2));
    return;
  }

  const keyInformation = keyResult.data?.keyInformation || {};

  // 2. Create the subscription using the new key.
  const subscription = await call("POST", "/notification-subscriptions/v2/webhooks", {
    name: "Unified Checkout (api)",
    description: "Unified Checkout transaction results",
    organizationId: MERCHANT_ID,
    products: [{ productId: "unifiedCheckout", eventTypes: ["uc.orders.transactionresults"] }],
    webhookUrl: WEBHOOK_URL,
    healthCheckUrl: WEBHOOK_URL,
    notificationScope: "SELF",
    retryPolicy: {
      algorithm: "ARITHMETIC",
      firstRetry: 1,
      interval: 1,
      numberOfRetries: 3,
      deactivateFlag: "false",
      repeatSequenceCount: 0,
      repeatSequenceWaitTime: 0,
    },
    securityPolicy: { securityType: "key" },
  });

  console.log(`key status ${keyResult.status}, keyId ${keyInformation.keyId}, expires ${keyInformation.expirationDate}`);
  console.log(`subscription status ${subscription.status}`);
  console.log(JSON.stringify(subscription.data ?? subscription.error, null, 2));

  if (subscription.status !== 201 || !keyInformation.key) {
    return;
  }

  upsertEnv("CYBERSOURCE_WEBHOOK_SIGNING_KEY", keyInformation.key);
  upsertEnv("CYBERSOURCE_WEBHOOK_KEY_ID", keyInformation.keyId || "");
  upsertEnv("CYBERSOURCE_WEBHOOK_ID", subscription.data?.webhookId || "");

  console.log(`\nwritten to .env: CYBERSOURCE_WEBHOOK_SIGNING_KEY=${mask(keyInformation.key)} (copy this value into Vercel)`);
};

(async () => {
  let result;

  if (command === "create") {
    await createSubscription();
    return;
  }

  if (command === "list" || !command) {
    result = await call("GET", `/notification-subscriptions/v2/webhooks?organizationId=${encodeURIComponent(MERCHANT_ID)}`);
  } else if (command === "products") {
    result = await call("GET", `/notification-subscriptions/v2/products/${encodeURIComponent(MERCHANT_ID)}`);
  } else if (command === "test") {
    // Sends a sample notification to the subscription's webhook URL.
    result = await call("POST", `/notification-subscriptions/v1/webhooks/${encodeURIComponent(argument)}`, {});
  } else if (command === "delete") {
    result = await call("DELETE", `/notification-subscriptions/v2/webhooks/${encodeURIComponent(argument)}`);
  } else {
    console.log("Usage: node scripts/webhooks.js [list|products|create [url]|test <webhookId>|delete <webhookId>]");
    process.exit(1);
  }

  console.log(`status ${result.status}`);
  console.log(JSON.stringify(result.data ?? result.error, null, 2));
})();
