const proceedToPaymentButton = document.getElementById("proceedToPayment");

const BACKEND_URL = "https://unified-checkout-backend.vercel.app";

const paymentPayload = {
  targetOrigins: ["https://unified-checkout-frontend.vercel.app"],

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

  completeMandate: {
    type: "CAPTURE",
  },

  data: {
    orderInformation: {
      amountDetails: {
        totalAmount: "50.00",
        currency: "USD",
      },
    },
  },
};


const loadCyberSourceSdk = (clientLibrary, integrity) => {
  return new Promise((resolve, reject) => {
    if (!clientLibrary) {
      reject(new Error("CyberSource clientLibrary URL is missing."));
      return;
    }

  
    if (window.VAS && typeof window.VAS.UnifiedCheckout === "function") {
      resolve();
      return;
    }

    const existingScript = document.querySelector(`script[src="${clientLibrary}"]`);

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("CyberSource SDK failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");

    script.type = "text/javascript";
    script.async = false;
    script.src = clientLibrary;

    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
    }

    script.onload = () => {
      console.log("CyberSource SDK loaded.");

      if (!window.VAS || typeof window.VAS.UnifiedCheckout !== "function") {
        reject(new Error("CyberSource SDK loaded but VAS.UnifiedCheckout is unavailable."));
        return;
      }

      resolve();
    };

    script.onerror = () => {
      reject(new Error("CyberSource SDK failed to load."));
    };

    document.head.appendChild(script);
  });
};

const startWithVAS = async (captureContext) => {
  let client = null;
  let checkout = null;

  try {
    console.log("Initializing CyberSource Unified Checkout...");

    client = await window.VAS.UnifiedCheckout(captureContext);

    console.log("Unified Checkout client initialized.");

    checkout = await client.createCheckout({
      autoProcessing: false,
    });

    console.log("Checkout created with autoProcessing:false");

 
    checkout.on("ready", (data) => {
      console.log("[Unified Checkout] ready:", data);
    });

    checkout.on("mounted", (data) => {
      console.log("[Unified Checkout] mounted:", data);
    });

    checkout.on("paymentMethodSelected", (data) => {
      console.log("[Unified Checkout] payment method selected:", data);
    });

    checkout.on("paymentMethodCancelled", (data) => {
      console.log("[Unified Checkout] payment method cancelled:", data);
    });

    checkout.on("error", (error) => {
      console.error("[Unified Checkout] ERROR:", error);
    });

    console.log("Mounting Unified Checkout...");


    const transientToken = await checkout.mount({
      paymentSelection: "#buttonPaymentListContainer",

      paymentScreen: "#embeddedPaymentContainer",
    });

    console.log("Transient token received.");

    if (!transientToken || typeof transientToken !== "string") {
      throw new Error("Unified Checkout did not return a transient token.");
    }

 
    console.log("Sending transient token to backend...");

    const response = await axios.post(
      `${BACKEND_URL}/payment`,
      {
        amount: "50.00",
        currency: "USD",
        transientToken,
      },
      {
        // headers: {
        //   "Content-Type": "application/json",
        // },

        timeout: 30000,
      },
    );

    console.log("Backend payment response:", response.data);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Payment backend returned HTTP ${response.status}`);
    }

 
    console.log("PAYMENT SUCCESS:", response.data);

    return response.data;
  } catch (error) {
    console.error("Unified Checkout failed:", error);

    if (error?.response) {
      console.error("Backend status:", error.response.status);

      console.error("Backend response:", error.response.data);
    }

    if (error?.name === "UnifiedCheckoutError") {
      console.error("CyberSource UnifiedCheckoutError:", {
        reason: error.reason,
        message: error.message,
        code: error.code,
      });
    }

    throw error;
  } finally {
    try {
      checkout?.destroy();
    } catch (e) {
      console.warn("Checkout destroy failed:", e);
    }

    try {
      client?.destroy();
    } catch (e) {
      console.warn("Client destroy failed:", e);
    }
  }
};


const getSessionContext = async (event) => {
  event.preventDefault();

  if (!proceedToPaymentButton) {
    return;
  }

  proceedToPaymentButton.disabled = true;
  proceedToPaymentButton.innerHTML = "Loading Checkout...";

  try {
    console.log("Requesting Capture Context...");

    const response = await axios.post(`${BACKEND_URL}/checkout-session`, paymentPayload, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });

    console.log("Checkout session response:", response.data);

    const captureContext = response.data?.captureContext;

    if (!captureContext) {
      throw new Error("Backend did not return a Capture Context.");
    }

   
    const parts = captureContext.split(".");

    if (parts.length !== 3) {
      throw new Error("Invalid Capture Context JWT.");
    }

    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    while (base64.length % 4) {
      base64 += "=";
    }

    const decoded = JSON.parse(atob(base64));

    const contextData = decoded?.ctx?.[0]?.data;

    if (!contextData) {
      throw new Error("Capture Context does not contain ctx[0].data.");
    }

    const clientLibrary = contextData.clientLibrary;

    const clientLibraryIntegrity = contextData.clientLibraryIntegrity;

    if (!clientLibrary) {
      throw new Error("clientLibrary is missing from Capture Context.");
    }

    console.log("Loading CyberSource SDK:", clientLibrary);

    await loadCyberSourceSdk(clientLibrary, clientLibraryIntegrity);

    if (!window.VAS || typeof window.VAS.UnifiedCheckout !== "function") {
      throw new Error("VAS.UnifiedCheckout is unavailable.");
    }

    console.log("Starting Unified Checkout...");

    const result = await startWithVAS(captureContext);

    console.log("Payment result:", result);

    alert("Payment completed successfully.");
  } catch (error) {
    console.error("Payment initialization failed:", error);

    if (error?.response) {
      console.error("Server status:", error.response.status);

      console.error("Server error:", error.response.data);
    }

    alert(error?.response?.data?.error || error?.message || "Unable to process payment.");
  } finally {
    proceedToPaymentButton.disabled = false;
    proceedToPaymentButton.innerHTML = "Proceed to Payment";
  }
};


if (!proceedToPaymentButton) {
  console.error("Could not find #proceedToPayment");
} else {
  proceedToPaymentButton.addEventListener("click", getSessionContext);
}

