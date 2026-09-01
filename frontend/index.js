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

  completeMandate: {
    type: "CAPTURE",
  },

  data: {
    orderInformation: {
      amountDetails: {
        totalAmount: "300.00",
        currency: "USD",
      },
    },
  },
};

const decodeJwtPayload = (jwt) => {
  try {
    if (!jwt || typeof jwt !== "string") {
      throw new Error("JWT is empty or invalid."); 
    }

    const parts = jwt.split(".");

    if (parts.length !== 3) {
      throw new Error("Invalid JWT format.");
    }

    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");

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

const loadCyberSourceSdk = (clientLibrary, integrity) => {
  return new Promise((resolve, reject) => {
    if (!clientLibrary) {
      reject(new Error("CyberSource clientLibrary URL is missing."));
      return;
    }

    if (typeof window.Accept === "function" || window.VAS) {

      resolve();

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
      resolve();
    };

    script.onerror = (error) => {
      reject(new Error("CyberSource SDK failed to load."));
    };

    document.head.appendChild(script);
  });
}

const startWithVAS = async (captureContext) => {
  let client = null;
  let checkout = null;

  try {
    client = await window.VAS.UnifiedCheckout(captureContext);
    checkout = await client.createCheckout({
      autoProcessing: true,
    });

    const result = await checkout.mount({
      paymentSelection: "#buttonPaymentListContainer",
      paymentScreen: "#embeddedPaymentContainer",
    });

    console.log(result)

    if (result) {
      const response = await axios.post("https://unified-checkout-backend.vercel.app/verify-payment", { completeResponse: result });

      if (response.data?.decoded?.status === "AUTHORIZED") {
        alert("Your payment was successful. Your payment id is: " + response.data.decoded.id + " This is a test transaction. Thank you");
      }
    } else {
      throw new Error("Unified Checkout returned no payment result.");
    }
  } catch (error) {
    console.error("Unified Checkout payment failed:", error);

    if (error?.name === "UnifiedCheckoutError") {
      console.error("CyberSource error:", {
        reason: error.reason,
        message: error.message,
        code: error.code,
      });
    }

    throw error;
  } finally {
    if (checkout) {
      try {
        checkout.destroy();
      } catch (error) {
        console.warn("Could not destroy checkout:", error);
      }
    }

    if (client) {
      try {
        client.destroy();
      } catch (error) {
        console.warn("Could not destroy CyberSource client:", error);
      }
    }
  }
};

const getSessionContext = async (event) => {
  let isProcessing = true;
  proceedToPaymentButton.innerHTML = `${isProcessing ? "Loading Checkout, Please Wait..." : "Proceed to Payment"}`
  proceedToPaymentButton.setAttribute("disabled", isProcessing)
  event.preventDefault();  
  try {
    const response = await axios.post("https://unified-checkout-backend.vercel.app/checkout-session", paymentPayload);

    const captureContext = response.data?.captureContext;

    if (!captureContext) {
      throw new Error("The backend did not return a capture context.");
    }

    const decoded = decodeJwtPayload(captureContext);

    if (!decoded) {
      throw new Error("Could not decode capture context.");
    }

    const contextData = decoded?.ctx?.[0]?.data;

    if (!contextData) {
      throw new Error("Capture context does not contain ctx[0].data.");
    }

    const clientLibrary = contextData.clientLibrary;

    const integrity = contextData.clientLibraryIntegrity;

    if (!clientLibrary) {
      throw new Error("clientLibrary is missing from capture context.");
    }

    await loadCyberSourceSdk(clientLibrary, integrity);

    if (window.VAS && typeof window.VAS.UnifiedCheckout === "function") {
      await startWithVAS(captureContext);
      isProcessing = false;
      proceedToPaymentButton.innerHTML = `${isProcessing ? "Loading Checkout, Please Wait..." : "Proceed to Payment"}`;
      proceedToPaymentButton.removeAttribute("disabled");
      return;
    }

    throw new Error("CyberSource SDK loaded, but neither " + "VAS.UnifiedCheckout() nor Accept() is available.");
  } catch (error) {
    console.error(error);

    const backendError = error?.response?.data;

    if (backendError) {
      console.error("Backend error:", backendError);
    }

    alert("Unable to initialize payment. " + "Please check the browser console for details.");
  }
  isProcessing = false;
  proceedToPaymentButton.innerHTML = `${isProcessing ? "Loading Checkout, Please Wait..." : "Proceed to Payment"}`;
  proceedToPaymentButton.removeAttribute("disabled");
}

if (!proceedToPaymentButton) {
  console.error("Could not find #proceedToPayment button.");
} else {
  proceedToPaymentButton.addEventListener("click", getSessionContext);
}
