const { decryptNotification, isJwe } = require("./responseMle");

const processedWebhookIds = new Map();
const DEFAULT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

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

    let event;

    if (jwe) {
      event = decryptNotification(jwe);
    } else {
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
    return res.status(400).json({ error: error.message });
  }
};

module.exports = { handleWebhook, healthCheck, parseBody, rememberWebhook };
