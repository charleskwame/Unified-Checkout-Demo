const proceedToPaymentButton = document.getElementById("proceedToPayment");

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

  data: {
    orderInformation: {
      amountDetails: {
        totalAmount: "21.00",
        currency: "USD",
      },
    },
  },
};

// --------------------------------------------------

// Decode JWT payload

// --------------------------------------------------

function decodeJwtPayload(jwt) {
  try {
    if (!jwt || typeof jwt !== "string") {
      throw new Error("JWT is empty or invalid.");
    }

    const parts = jwt.split(".");

    if (parts.length !== 3) {
      throw new Error("Invalid JWT format.");
    }

    // Convert base64url -> base64
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");

    // Add padding
    while (base64.length % 4) {
      base64 += "=";
    }

    const json = atob(base64);

    return JSON.parse(json);
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    return null;
  }
}

// --------------------------------------------------
// Load CyberSource SDK
// --------------------------------------------------

function loadCyberSourceSdk(clientLibrary, integrity) {
  return new Promise((resolve, reject) => {
    if (!clientLibrary) {
      reject(new Error("CyberSource clientLibrary URL is missing."));
      return;
    }

    console.log("Loading CyberSource SDK:", clientLibrary);

    // Check if SDK is already loaded
    if (typeof window.Accept === "function" || window.VAS) {
      console.log("CyberSource SDK already loaded.");

      resolve();

      return;
    }

    const script = document.createElement("script");

    script.type = "text/javascript";

    // Do not let the browser defer this dynamically inserted script
    script.async = false;

    script.src = clientLibrary;

    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
    }

    script.onload = () => {
      console.log("CyberSource SDK script loaded successfully.");

      console.log("typeof window.Accept:", typeof window.Accept);

      console.log("typeof window.VAS:", typeof window.VAS);

      resolve();
    };

    script.onerror = (error) => {
      console.error("Failed to load CyberSource SDK:", error);

      reject(new Error("CyberSource SDK failed to load."));
    };

    document.head.appendChild(script);
  });
}

// --------------------------------------------------
// Start payment using newer VAS API
// --------------------------------------------------

async function startWithVAS(captureContext) {
  console.log("Using CyberSource VAS.UnifiedCheckout() API");

  let client = null;
  let checkout = null;

  try {
    client = await window.VAS.UnifiedCheckout(captureContext);

    console.log("VAS UnifiedCheckout client created:", client);

    checkout = await client.createCheckout({
      autoProcessing: false,
    });

    console.log("Checkout instance created:", checkout);

    const result = await checkout.mount({
      paymentSelection: "#buttonPaymentListContainer",
      paymentScreen: "#embeddedPaymentContainer",
    });

    console.log("Unified Checkout completed:", result);

    /*
     * `result` is the completed payment result /
     * transient token depending on the configured flow.
     *
     * Send this value to your backend.
     */

    if (result) {
      console.log("Payment result received:", result);

      /*
       * Example:
       *
       * await axios.post(
       *   "https://your-backend.com/payment",
       *   {
       *     transientToken: result
       *   }
       * );
       */

      alert("Payment information collected successfully.");
    }

    return result;
  } catch (error) {
    console.error("VAS Unified Checkout error:", error);

    throw error;
  } finally {
    // Clean up checkout
    if (checkout) {
      try {
        checkout.destroy();
      } catch (error) {
        console.warn("Could not destroy checkout:", error);
      }
    }

    // Clean up client
    if (client) {
      try {
        client.destroy();
      } catch (error) {
        console.warn("Could not destroy CyberSource client:", error);
      }
    }
  }
}

// --------------------------------------------------
// Start payment using older Accept API
// --------------------------------------------------

async function startWithAccept(captureContext) {
  console.log("Using CyberSource Accept() API");

  let accept = null;

  try {
    if (typeof window.Accept !== "function") {
      throw new Error("CyberSource SDK loaded, but window.Accept is not available.");
    }

    /*
     * CyberSource documents this as:
     *
     * const accept = await Accept(captureContext);
     */

    accept = await window.Accept(captureContext);

    console.log("Accept initialized:", accept);

    /*
     * false = embedded checkout
     */
    const unifiedPayments = await accept.unifiedPayments(false);

    console.log("Unified Payments initialized:", unifiedPayments);

    const showArgs = {
      containers: {
        paymentSelection: "#buttonPaymentListContainer",

        paymentScreen: "#embeddedPaymentContainer",
      },
    };

    const transientToken = await unifiedPayments.show(showArgs);

    console.log("Transient token:", transientToken);

    /*
     * Complete the Unified Checkout interaction.
     */
    const completeResponse = await unifiedPayments.complete(transientToken);

    console.log("Complete response:", completeResponse);

    /*
     * IMPORTANT:
     *
     * Do not assume the complete response is
     * necessarily a JWT that should be decoded
     * in the browser.
     *
     * Send it to your backend for processing /
     * verification according to your CyberSource
     * payment flow.
     */

    alert("Payment information collected successfully.");

    return completeResponse;
  } catch (error) {
    console.error("Accept Unified Checkout error:", error);

    throw error;
  }
}

// --------------------------------------------------
// Main payment function
// --------------------------------------------------

async function getSessionContext(event) {
  event.preventDefault();

  console.log("Starting CyberSource payment...");

  try {
    // ------------------------------------------------
    // 1. Get capture context from backend
    // ------------------------------------------------

    const response = await axios.post("https://unified-checkout-backend-oscq4vzbw-charleskwames-projects.vercel.app", paymentPayload);

    console.log("Backend response:", response.data);

    const captureContext = response.data?.captureContext;

    if (!captureContext) {
      throw new Error("The backend did not return a capture context.");
    }

    console.log("Capture context received.");

    // ------------------------------------------------
    // 2. Decode capture context
    // ------------------------------------------------

    const decoded = decodeJwtPayload(captureContext);

    if (!decoded) {
      throw new Error("Could not decode capture context.");
    }

    console.log("Decoded capture context:", decoded);

    // ------------------------------------------------
    // 3. Get SDK information
    // ------------------------------------------------

    const contextData = decoded?.ctx?.[0]?.data;

    if (!contextData) {
      throw new Error("Capture context does not contain ctx[0].data.");
    }

    const clientLibrary = contextData.clientLibrary;

    const integrity = contextData.clientLibraryIntegrity;

    console.log("CyberSource SDK information:", {
      clientLibrary,
      integrityPresent: Boolean(integrity),
    });

    if (!clientLibrary) {
      throw new Error("clientLibrary is missing from capture context.");
    }

    // ------------------------------------------------
    // 4. Load CyberSource JavaScript SDK
    // ------------------------------------------------

    await loadCyberSourceSdk(clientLibrary, integrity);

    // ------------------------------------------------
    // 5. Inspect loaded SDK
    // ------------------------------------------------

    console.log("-----------------------------------");

    console.log("CyberSource SDK inspection:");

    console.log("window.Accept:", window.Accept);

    console.log("typeof window.Accept:", typeof window.Accept);

    console.log("window.VAS:", window.VAS);

    console.log("typeof window.VAS:", typeof window.VAS);

    console.log("-----------------------------------");

    // ------------------------------------------------
    // 6. Select correct CyberSource API
    // ------------------------------------------------

    /*
     * Newer Unified Checkout:
     *
     * VAS.UnifiedCheckout(...)
     */

    if (window.VAS && typeof window.VAS.UnifiedCheckout === "function") {
      console.log("Detected newer CyberSource Unified Checkout API.");

      await startWithVAS(captureContext);

      return;
    }

    /*
     * Older / Digital Accept Unified Checkout:
     *
     * Accept(...)
     */

    if (typeof window.Accept === "function") {
      console.log("Detected CyberSource Accept API.");

      await startWithAccept(captureContext);

      return;
    }

    // ------------------------------------------------
    // 7. Neither API exists
    // ------------------------------------------------

    throw new Error("CyberSource SDK loaded, but neither " + "VAS.UnifiedCheckout() nor Accept() is available.");
  } catch (error) {
    console.error("-----------------------------------");

    console.error("CyberSource payment initialization failed:");

    console.error(error);

    console.error("-----------------------------------");

    const backendError = error?.response?.data;

    if (backendError) {
      console.error("Backend error:", backendError);
    }

    alert("Unable to initialize payment. " + "Please check the browser console for details.");
  }
}

// --------------------------------------------------
// Button listener
// --------------------------------------------------

if (!proceedToPaymentButton) {
  console.error("Could not find #proceedToPayment button.");
} else {
  proceedToPaymentButton.addEventListener("click", getSessionContext);
}
