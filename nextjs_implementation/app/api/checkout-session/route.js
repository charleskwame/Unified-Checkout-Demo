import { createCaptureContext, normalizeCheckoutPayload, validateCheckoutPayload } from "@/lib/checkout";

export async function POST(request) {
  try {
    const body = await request.json();
    const payload = normalizeCheckoutPayload(body?.payload && typeof body.payload === "object" ? body.payload : body);
    const validationErrors = validateCheckoutPayload(payload);
    if (validationErrors.length) return Response.json({ error: "Invalid checkout-session payload.", validationErrors }, { status: 400 });
    return Response.json(await createCaptureContext(payload));
  } catch (error) {
    const details = error.response?.data;
    return Response.json(
      { error: details?.message || error.message || "CyberSource request failed", ...(details ? { details } : {}) },
      { status: error.status || error.response?.status || 500 },
    );
  }
}
