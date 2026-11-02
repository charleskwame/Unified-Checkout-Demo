const crypto = require("crypto");
const { decryptNotification, isJwe } = require("./responseMle");

const processedWebhookIds = new Map();
const DEFAULT_MAX_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

const parseSignatureHeader = (header) => {
  const parts = {};

  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key && value) parts[key] = value;
  }

  return parts;
};

const parseBody = (body, rawBody) => {
  if (body && typeof body === "object" && !Buffer.isBuffer(body)) return body;

  const text = Buffer.isBuffer(body) ? body.toString("utf8") : String(rawBody ?? body ?? "").trim();
  if (!text) throw new Error("Webhook body is empty.");

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const getJwe = (body) => {
  if (typeof body === "string" && isJwe(body)) return body;
  if (body && typeof body.encData === "string") return body.encData;
  if (body && typeof body.payload === "string" && isJwe(body.payload)) return body.payload;
  return null;
};

const verifySignature = (body, signatureHeader) => {
  const signingKey = process.env.CYBERSOURCE_WEBHOOK_SIGNING_KEY?.trim();
  if (!signingKey) throw new Error("Webhook security is not configured.");

  const { t: timestamp, sig: providedSignature } = parseSignatureHeader(signatureHeader);
  if (!timestamp || !providedSignature || !/^\d+$/.test(timestamp)) {
    throw new Error("Invalid CyberSource webhook signature header.");
  }

  const maxSkewMs = Number(process.env.CYBERSOURCE_WEBHOOK_MAX_SKEW_MS || DEFAULT_MAX_SKEW_MS);
  if (maxSkewMs > 0 && Math.abs(Date.now() - Number(timestamp)) > maxSkewMs) {
    throw new Error("CyberSource webhook signature has expired.");
  }

  const payload = body?.payload === undefined ? body : body.payload;
  const signedContent = `${timestamp}.${JSON.stringify(payload)}`;
  const expectedSignature = crypto.createHmac("sha256", Buffer.from(signingKey, "base64")).update(signedContent).digest("base64");
  const expected = Buffer.from(expectedSignature, "utf8");
  const provided = Buffer.from(providedSignature, "utf8");

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    throw new Error("Invalid CyberSource webhook signature.");
  }
};

const rememberWebhook = (webhookId) => {
  if (!webhookId) return false;

  const now = Date.now();
  const ttl = Number(process.env.CYBERSOURCE_WEBHOOK_DEDUPE_TTL_MS || DEFAULT_DEDUPE_TTL_MS);
  for (const [id, seenAt] of processedWebhookIds) {
    if (now - seenAt > ttl) processedWebhookIds.delete(id);
  }

  if (processedWebhookIds.has(webhookId)) return true;
  processedWebhookIds.set(webhookId, now);
  return false;
};

const healthCheck = (req, res) => res.status(200).json({ status: "ok" });

const handleWebhook = (req, res) => {
  try {
    const body = parseBody(req.body, req.rawBody);
    const jwe = getJwe(body);
    const signatureHeader = req.get("v-c-signature");

    let event;

    if (jwe) {
      event = decryptNotification(jwe);
    } else {
      if (signatureHeader) verifySignature(body, signatureHeader);
      event = body?.payload ?? body;
    }

    if (!event || typeof event !== "object") throw new Error("CyberSource webhook payload is invalid.");

    const webhookId = event.webhookId || body.webhookId || null;
    const duplicate = rememberWebhook(webhookId);

    console.log("CyberSource webhook accepted", {
      webhookId,
      eventType: event.eventType || null,
      encrypted: Boolean(jwe),
      duplicate,
    });

    return res.status(200).json({ received: true, duplicate });
  } catch (error) {
    console.error("CyberSource webhook rejected:", error.message);
    const status = /signature|security|expired/i.test(error.message) ? 401 : 400;
    return res.status(status).json({ error: error.message });
  }
};

module.exports = { handleWebhook, healthCheck, parseBody, parseSignatureHeader, verifySignature, rememberWebhook };
