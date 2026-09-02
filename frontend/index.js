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
        totalAmount: "50.00",
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
};

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

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("CyberSource SDK failed to load."));

    document.head.appendChild(script);
  });
};

const startWithVAS = async (captureContext) => {
  let checkout;

  try {
    const client = await window.VAS.UnifiedCheckout(captureContext);

    checkout = await client.createCheckout({
      autoProcessing: false,
    });

    checkout.on("ready", (paymentData) => {
      console.log("Checkout ready:", paymentData);
    });

    checkout.on("mounted", async (eventData) => {
      try {
        const transientToken = eventData?.transientToken || eventData?.token;

        if (!transientToken) {
          throw new Error("No transient token found in completion event.");
        }

        console.log("Transient Token obtained:", transientToken);

        const response = await axios.post("https://unified-checkout-backend.vercel.app/payment", {
          amount: "50.00",
          transientToken,
        });

        if (response.status === 200) {
          console.log("Payment Processing Success:", response.data);

          checkout.destroy();
        } else {
          console.error("Payment Processing Failed:", response.data);
        }
      } catch (err) {
        console.error("Backend payment dispatch failed:", err);
      }
    });

    await checkout.mount({
      paymentSelection: "#buttonPaymentListContainer",
      paymentScreen: "#embeddedPaymentContainer",
    });
  } catch (error) {
    console.error("Unified Checkout payment failed:", error);

    if (error?.name === "UnifiedCheckoutError") {
      console.error("CyberSource error details:", {
        reason: error.reason,
        message: error.message,
        code: error.code,
      });
    }

    throw error;
  }
};


const getSessionContext = async (event) => {
  event.preventDefault();

  proceedToPaymentButton.innerHTML = "Loading Checkout, Please Wait...";
  proceedToPaymentButton.setAttribute("disabled", "true");

  try {
    const response = await axios.post("https://unified-checkout-backend.vercel.app/checkout-session", paymentPayload);

    const captureContext = response.data?.captureContext;

    if (!captureContext) {
      throw new Error("The backend did not return a capture context.");
    }

    const decoded = decodeJwtPayload(captureContext);
    const contextData = decoded?.ctx?.[0]?.data;

    if (!contextData || !contextData.clientLibrary) {
      throw new Error("clientLibrary is missing from decoded capture context.");
    }

    await loadCyberSourceSdk(contextData.clientLibrary, contextData.clientLibraryIntegrity);

    if (window.VAS && typeof window.VAS.UnifiedCheckout === "function") {
      await startWithVAS(captureContext);
      return;
    }

    throw new Error("CyberSource SDK loaded, but window.VAS is unavailable.");
  } catch (error) {
    console.error(error);
    alert("Unable to initialize payment. Check console for details.");
  } finally {
    proceedToPaymentButton.innerHTML = "Proceed to Payment";
    proceedToPaymentButton.removeAttribute("disabled");
  }
};

if (!proceedToPaymentButton) {
  console.error("Could not find #proceedToPayment button.");
} else {
  proceedToPaymentButton.addEventListener("click", getSessionContext);
}
