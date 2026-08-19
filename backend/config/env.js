require("dotenv").config();

const env = {
  port: process.env.PORT || 3000,
  cybersource: {
    host: process.env.CYBERSOURCE_HOST,
    merchantId: process.env.CYBERSOURCE_MERCHANT_ID,
    apiKeyId: process.env.CYBERSOURCE_API_KEY_ID,
    sharedSecret: process.env.CYBERSOURCE_API_SECRET_KEY,
    resourcePath: "/uc/v1/sessions",
  },
};

module.exports = env;
