import { decodeJwtPayload } from "@/lib/checkout";

export async function POST(request) {
  try {
    const { completeResponse } = await request.json();
    if (!completeResponse) return Response.json({ error: "completeResponse JWT is required" }, { status: 400 });
    const decoded = decodeJwtPayload(completeResponse);
    if (!decoded) return Response.json({ error: "Unable to decode payment result JWT" }, { status: 400 });
    return Response.json({ success: true, decoded });
  } catch {
    return Response.json({ error: "Failed to process payment result" }, { status: 500 });
  }
}
