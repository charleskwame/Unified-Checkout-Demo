const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const axios = require("axios");
const { createHeaders } = require("cybersource-auth");

const HOST = (process.env.CYBERSOURCE_HOST || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;

const resourcePath = "/tss/v2/searches";
const query = process.argv[2] || "id:7936218169216527604007";
const body = { query, offset: 0, limit: 10, sort: "submitTimeUtc:desc" };
const rawBody = JSON.stringify(body);

(async () => {
  const headers = createHeaders(MERCHANT_ID, HOST, "post", resourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

  try {
    const response = await axios.post(`https://${HOST}${resourcePath}`, rawBody, {
      headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
      timeout: 20000,
    });

    const summaries = response.data?._embedded?.transactionSummaries || [];
    console.log(`status ${response.status}, transactions: ${summaries.length}`);

    for (const item of summaries) {
      console.log(
        [
          item.submitTimeUtc,
          item.id,
          item.merchantReferenceCode || "",
          item.applicationInformation?.status || item.status || "",
          item.orderInformation?.amountDetails?.totalAmount || "",
        ].join("  |  "),
      );
    }
  } catch (error) {
    console.log("status:", error.response?.status);
    console.log("payload:", JSON.stringify(error.response?.data || error.message));
  }
})();
