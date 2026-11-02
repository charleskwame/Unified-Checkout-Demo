// Transaction Details / search helper.
// Usage: node scripts/transaction.js search "clientReferenceInformation.code:uc-*"
//        node scripts/transaction.js details <transactionId>
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const axios = require("axios");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const HOST = (process.env.CYBERSOURCE_HOST || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;

const bearer = (method, requestPath) => {
  const iat = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      iat,
      exp: iat + 120,
      "request-method": method.toLowerCase(),
      "request-resource-path": requestPath,
      "request-host": HOST,
      iss: MERCHANT_ID,
      jti: crypto.randomUUID(),
      "v-c-jwt-version": "2",
      "v-c-merchant-id": MERCHANT_ID,
    },
    Buffer.from(SHARED_SECRET, "base64"),
    { algorithm: "HS256", header: { alg: "HS256", typ: "JWT", kid: API_KEY_ID } },
  );
};

const get = async (requestPath) => {
  const response = await axios.get(`https://${HOST}${requestPath}`, {
    headers: { Authorization: `Bearer ${bearer("get", requestPath)}`, Accept: "application/hal+json" },
    timeout: 20000,
  });

  return response.data;
};

const [command, argument] = process.argv.slice(2);

(async () => {
  try {
    if (command === "search") {
      const requestPath = "/tss/v2/searches";
      const body = { query: argument || "id:*", offset: 0, limit: 10, sort: "submitTimeUtc:desc" };
      const rawBody = JSON.stringify(body);
      const response = await axios.post(`https://${HOST}${requestPath}`, rawBody, {
        headers: { Authorization: `Bearer ${bearer("post", requestPath)}`, "Content-Type": "application/json", Accept: "application/json" },
        timeout: 20000,
      });

      const summaries = response.data?._embedded?.transactionSummaries || [];
      console.log(`status ${response.status}, transactions: ${summaries.length}`);
      for (const item of summaries) {
        console.log(`${item.submitTimeUtc}  |  ${item.id}  |  ${item.applicationInformation?.status || ""}`);
      }
      return;
    }

    if (command === "details") {
      const t = await get(`/tss/v2/transactions/${encodeURIComponent(argument)}`);
      console.log("id:", t.id);
      console.log("clientReferenceInformation:", JSON.stringify(t.clientReferenceInformation));
      console.log("applicationInformation.status:", t.applicationInformation?.status);
      console.log("applications:", JSON.stringify((t.applicationInformation?.applications || []).map((a) => `${a.name}:${a.rFlag}`)));
      console.log("commerceIndicator:", t.processingInformation?.commerceIndicator, t.processingInformation?.commerceIndicatorLabel);
      console.log("amount:", JSON.stringify(t.orderInformation?.amountDetails));
      console.log("links:", JSON.stringify(Object.keys(t._links || {})));
      return;
    }

    console.log("Usage: node scripts/transaction.js search <query> | details <id>");
    process.exit(1);
  } catch (error) {
    console.log("status:", error.response?.status);
    console.log("payload:", JSON.stringify(error.response?.data || error.message));
  }
})();
