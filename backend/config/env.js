const path = require("path");
const dotenv = require("dotenv");

const envResult = dotenv.config({ path: path.join(__dirname, ".env") });

if (envResult.error) {
  throw new Error(`Failed to load .env file: ${envResult.error.message}`);
}

const requiredEnvVars = ["HOST", "MERCHANT_ID", "API_KEY_ID", "SHARED_SECRET"];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(", ")}`);
}

module.exports = {
  host: process.env.HOST,
  merchantId: process.env.MERCHANT_ID,
  apiKeyId: process.env.API_KEY_ID,
    sharedSecret: process.env.SHARED_SECRET,
    resourcePath: process.env.RESOURCE_PATH,
  port: process.env.PORT
};
