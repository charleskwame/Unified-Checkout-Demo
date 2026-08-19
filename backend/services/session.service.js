const { createHeaders } = require("cybersource-auth");
const env = require("../config/env.js");
const { safeParseJson, extractCaptureContext } = require("../utils/responseParsers.js");

function getCybersourceConfig() {
  return env.cybersource;
}

function hasCybersourceConfig() {
  const { host, merchantId, apiKeyId, sharedSecret } = getCybersourceConfig();
  return Boolean(host && merchantId && apiKeyId && sharedSecret);
}

function buildSessionUrl(host, resourcePath) {
  const normalizedHost = host.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return {
    normalizedHost,
    url: `https://${normalizedHost}${resourcePath}`,
  };
}

async function requestCheckoutSession(payload) {
  const { host, merchantId, apiKeyId, sharedSecret, resourcePath } = getCybersourceConfig();
  const { normalizedHost, url } = buildSessionUrl(host, resourcePath);
  const rawBody = JSON.stringify(payload);

  const headers = createHeaders(merchantId, normalizedHost, "post", resourcePath, rawBody, apiKeyId, sharedSecret);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: rawBody,
    signal: AbortSignal.timeout(10000),
  });

  const responseText = await response.text();
  const data = safeParseJson(responseText);

  return {
    ok: response.ok,
    status: response.status,
    data,
    responseText,
    headers: Object.fromEntries(response.headers.entries()),
    captureContext: extractCaptureContext(response, data, responseText),
  };
}

module.exports = {
  hasCybersourceConfig,
  requestCheckoutSession,
};
