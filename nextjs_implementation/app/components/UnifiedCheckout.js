"use client";

import { useEffect, useRef, useState } from "react";

const decodeJwtPayload = (token) => {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3) throw new Error("Invalid JWT format.");
  const base64 = parts[1]
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(parts[1].length / 4) * 4, "=");
  return JSON.parse(atob(base64));
};

const loadCyberSourceSdk = (url, integrity) =>
  new Promise((resolve, reject) => {
    if (window.VAS) return resolve();
    const script = document.createElement("script");
    script.src = url;
    script.async = false;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
    }
    script.onload = resolve;
    script.onerror = () => reject(new Error("CyberSource SDK failed to load."));
    document.head.appendChild(script);
  });

export default function UnifiedCheckout() {
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const checkoutRef = useRef(null);
  const clientRef = useRef(null);

  useEffect(
    () => () => {
      try {
        checkoutRef.current?.destroy();
      } catch {}
      try {
        clientRef.current?.destroy();
      } catch {}
    },
    [],
  );

  const startCheckout = async (event) => {
    event.preventDefault();
    setProcessing(true);
    setOpen(true);
    setError("");
    setStatus("Loading checkout, please wait...");
    try {
      const payload = {
        targetOrigins: [window.location.origin],
        clientVersion: "1.0",
        country: "US",
        locale: "en_US",
        completeMandate: { type: "CAPTURE" },
        data: { orderInformation: { amountDetails: { totalAmount: "50.00", currency: "USD" } } },
      };
      const sessionResponse = await fetch("/api/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const captureContext = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(captureContext.error || "Could not create checkout session.");
      const contextData = decodeJwtPayload(captureContext)?.ctx?.[0]?.data;
      if (!contextData?.clientLibrary) throw new Error("Capture context does not contain client library details.");
      await loadCyberSourceSdk(contextData.clientLibrary, contextData.clientLibraryIntegrity);
      if (!window.VAS?.UnifiedCheckout) throw new Error("CyberSource Unified Checkout SDK is unavailable.");
      clientRef.current = await window.VAS.UnifiedCheckout(captureContext);
      checkoutRef.current = await clientRef.current.createCheckout({ autoProcessing: true });
      const result = await checkoutRef.current.mount({ paymentSelection: "#buttonPaymentListContainer", paymentScreen: "#embeddedPaymentContainer" });
      if (!result) throw new Error("Unified Checkout returned no payment result.");
      const verifyResponse = await fetch("/api/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completeResponse: result }),
      });
      const verified = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(verified.error || "Payment verification failed.");
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
