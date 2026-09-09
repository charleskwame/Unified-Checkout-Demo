import { useEffect, useRef, useState } from "react";

const apiBaseUrl = (import.meta.env.VITE_CHECKOUT_API_URL || "https://unified-checkout-backend.vercel.app").replace(/\/$/, "");

const paymentPayload = {
  targetOrigins: ["https://reactjsimplementation.vercel.app/"],
  clientVersion: "1.0",
  allowedCardNetworks: ["VISA", "MASTERCARD"],
  allowedPaymentTypes: [
    "PANENTRY",
    "GOOGLEPAY",
    "CLICKTOPAY",
    "APPLEPAY",
    "PAZE",
    "CHECK",
    "TMS_TOKEN",
    "AFTERPAY",
    "IDEAL",
    "MULTIBANCO",
    "PRZELEWY24",
    "MYBANK",
    "KONBINI",
    "DRAGONPAY",
    "BANCONTACT",
    "TINKPAYBYBANK",
    "PAYPAL",
    "VENMO",
    "AFFIRM",
  ],
  country: "US",
  locale: "en_US",
  completeMandate: { type: "CAPTURE" },
  data: {
    orderInformation: {
      amountDetails: {
        totalAmount: "50.00",
        currency: "USD",
      },
    },
  },
};

function decodeJwtPayload(token) {
  if (typeof token !== "string") throw new Error("Capture context is missing.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid capture context format.");

  const base64 = parts[1]
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
  return JSON.parse(atob(base64));
}

function loadCyberSourceSdk(clientLibrary, integrity) {
  if (window.VAS?.UnifiedCheckout) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = clientLibrary;
    script.async = false;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
    }
    script.onload = resolve;
    script.onerror = () => reject(new Error("CyberSource SDK failed to load."));
    document.head.appendChild(script);
  });
}

async function postJson(path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}.`);
  return data;
}

export default function App() {
  const [processing, setProcessing] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const clientRef = useRef(null);
  const checkoutRef = useRef(null);

  useEffect(
    () => () => {
      try {
        checkoutRef.current?.destroy();
      } catch (destroyError) {
        console.warn("Could not destroy checkout:", destroyError);
      }
      try {
        clientRef.current?.destroy();
      } catch (destroyError) {
        console.warn("Could not destroy CyberSource client:", destroyError);
      }
    },
    [],
  );

  const startCheckout = async () => {
    setProcessing(true);
    setOpen(true);
    setStatus("Loading checkout, please wait...");
    setError("");

    try {
      const captureContext = await postJson("/checkout-session", paymentPayload);
      const contextData = decodeJwtPayload(captureContext)?.ctx?.[0]?.data;
      if (!contextData?.clientLibrary) throw new Error("Capture context does not contain client library details.");

      await loadCyberSourceSdk(contextData.clientLibrary, contextData.clientLibraryIntegrity);
      if (!window.VAS?.UnifiedCheckout) throw new Error("CyberSource Unified Checkout SDK is unavailable.");

      clientRef.current = await window.VAS.UnifiedCheckout(captureContext);
      checkoutRef.current = await clientRef.current.createCheckout({ autoProcessing: true });
      const result = await checkoutRef.current.mount({
        paymentSelection: "#buttonPaymentListContainer",
        paymentScreen: "#embeddedPaymentContainer",
      });
      if (!result) throw new Error("Unified Checkout returned no payment result.");

      const verified = await postJson("/verify-payment", { completeResponse: result });
      setStatus(verified.decoded?.status === "AUTHORIZED" ? `Payment authorized. Payment ID: ${verified.decoded.id}` : "Payment response received.");
    } catch (checkoutError) {
      console.error("Unified Checkout payment failed:", checkoutError);
      setError(checkoutError.message || "Unable to initialize payment.");
      setStatus("");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <main className="checkout-shell">
      <section className="checkout-card" aria-busy={processing}>
        <p className="eyebrow">Unified Checkout Demo</p>
        <div className="order-summary">
          <h1>Order Summary</h1>
          <p className="item-name">1x BMX Racing Bike</p>
          <div className="price-row">
            <span>USD</span>
            <strong>$50.00</strong>
          </div>
        </div>
        <button className="proceed-button" type="button" disabled={processing} onClick={startCheckout}>
          {processing ? "Loading Checkout, Please Wait..." : "Proceed to Payment"}
        </button>
        <p className={`status${error ? " error" : ""}`} role={error ? "alert" : "status"}>
          {error || status}
        </p>
      </section>
      <aside className={`checkout-sidebar${open ? " open" : ""}`} aria-label="Payment checkout">
        <h2>Complete Payment</h2>
        <div id="buttonPaymentListContainer" />
        <div id="embeddedPaymentContainer" />
      </aside>
    </main>
  );
}
