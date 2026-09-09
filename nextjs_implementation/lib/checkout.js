import axios from "axios";
import { createHeaders } from "cybersource-auth";

const resourcePath = "/uc/v1/sessions";

export function normalizeCheckoutPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? { ...rawPayload } : {};
  payload.data = payload.data && typeof payload.data === "object" ? { ...payload.data } : {};
  if (payload.orderInformation && !payload.data.orderInformation) payload.data.orderInformation = payload.orderInformation;
  delete payload.orderInformation;
  return payload;
}

export function validateCheckoutPayload(payload) {
  const errors = [];
  if (!Array.isArray(payload.targetOrigins) || payload.targetOrigins.length === 0) errors.push("targetOrigins must be a non-empty array.");
  if (typeof payload.clientVersion !== "string" || !payload.clientVersion.trim()) errors.push("clientVersion is required.");
  if (typeof payload.country !== "string" || !payload.country.trim()) errors.push("country is required.");
  if (typeof payload.locale !== "string" || !payload.locale.trim()) errors.push("locale is required.");
  const orderInfo = payload.data?.orderInformation;
  if (!orderInfo || typeof orderInfo !== "object" || !orderInfo.amountDetails || typeof orderInfo.amountDetails !== "object") return [...errors, "data.orderInformation.amountDetails is required."];
  if (typeof orderInfo.amountDetails.totalAmount !== "string" || !orderInfo.amountDetails.totalAmount.trim()) errors.push("data.orderInformation.amountDetails.totalAmount is required.");
  if (typeof orderInfo.amountDetails.currency !== "string" || !orderInfo.amountDetails.currency.trim()) errors.push("data.orderInformation.amountDetails.currency is required.");
  return errors;
}

export async function createCaptureContext(payload) {
  const host = process.env.CYBERSOURCE_HOST?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const merchantId = process.env.CYBERSOURCE_MERCHANT_ID;
  const keyId = process.env.CYBERSOURCE_API_KEY_ID;
  const secret = process.env.CYBERSOURCE_API_SECRET_KEY;
  if (!host || !merchantId || !keyId || !secret) throw Object.assign(new Error("CyberSource environment variables are not fully configured."), { status: 500 });
  const rawBody = JSON.stringify(payload);
  const headers = createHeaders(merchantId, host, "post", resourcePath, rawBody, keyId, secret);
  const response = await axios.post(`https://${host}${resourcePath}`, payload, { headers, timeout: 10000 });
  if (!response.data) throw Object.assign(new Error("CyberSource returned no Capture Context token."), { status: 502 });
  return response.data;
}

export function decodeJwtPayload(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch { return null; }
}