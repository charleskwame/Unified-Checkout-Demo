// const proceedToPaymentButton = document.getElementById("proceedToPayment");

// const paymentPayload = {
//   targetOrigins: ["https://unified-checkout-frontend.vercel.app"],
//   clientVersion: "1.0",
//   allowedCardNetworks: ["VISA", "MASTERCARD"],
//   allowedPaymentTypes: [
//     "PANENTRY",
//     "GOOGLEPAY",
//     "CLICKTOPAY",
//     "APPLEPAY",
//     "PAZE",
//     "CHECK",
//     "TMS_TOKEN",
//     "AFTERPAY",
//     "IDEAL",
//     "MULTIBANCO",
//     "PRZELEWY24",
//     "MYBANK",
//     "KONBINI",
//     "DRAGONPAY",
//     "BANCONTACT",
//     "TINKPAYBYBANK",
//     "PAYPAL",
//     "VENMO",
//     "AFFIRM",
//   ],
//   country: "US",
//   locale: "en_US",
//   completeMandate: {
//     type: "CAPTURE",
//   },
//   data: {
//     orderInformation: {
//       amountDetails: {
//         totalAmount: "50.00",
//         currency: "USD",
//       },
//     },
//   },
// };

// const decodeJwtPayload = (jwt) => {
//   try {
//     if (!jwt || typeof jwt !== "string") {
//       throw new Error("JWT is empty or invalid.");
//     }

//     const parts = jwt.split(".");
//     if (parts.length !== 3) {
//       throw new Error("Invalid JWT format.");
//     }

//     let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
//     while (base64.length % 4) {
//       base64 += "=";
//     }

//     const json = atob(base64);
//     return JSON.parse(json);
//   } catch (error) {
//     console.error("Failed to decode JWT:", error);
//     return null;
//   }
// };

// const loadCyberSourceSdk = (clientLibrary, integrity) => {
//   return new Promise((resolve, reject) => {
//     if (!clientLibrary) {
//       reject(new Error("CyberSource clientLibrary URL is missing."));
//       return;
//     }

//     if (typeof window.Accept === "function" || window.VAS) {
//       resolve();
//       return;
//     }

//     const script = document.createElement("script");
//     script.type = "text/javascript";
//     script.async = false;
//     script.src = clientLibrary;

//     if (integrity) {
//       script.integrity = integrity;
//       script.crossOrigin = "anonymous";
//     }

//     script.onload = () => resolve();
//     script.onerror = () => reject(new Error("CyberSource SDK failed to load."));

//     document.head.appendChild(script);
//   });
// };

// const startWithVAS = async (captureContext) => {
//   let checkout;

//   try {
//     const client = await window.VAS.UnifiedCheckout(captureContext);

//     checkout = await client.createCheckout({
//       autoProcessing: false,
//     });

//     checkout.on("ready", (paymentData) => {
//       console.log("Checkout ready:", paymentData);
//     });

//     checkout.on("mounted", async (eventData) => {
//       try {
//         const transientToken = eventData?.transientToken || eventData?.token;

//         if (!transientToken) {
//           throw new Error("No transient token found in completion event.");
//         }

//         console.log("Transient Token obtained:", transientToken);

//         const response = await axios.post("https://unified-checkout-backend.vercel.app/payment", {
//           amount: "50.00",
//           transientToken,
//         });

//         if (response.status === 200) {
//           console.log("Payment Processing Success:", response.data);

//           checkout.destroy();
//         } else {
//           console.error("Payment Processing Failed:", response.data);
//         }
//       } catch (err) {
//         console.error("Backend payment dispatch failed:", err);
//       }
//     });

//     await checkout.mount({
//       paymentSelection: "#buttonPaymentListContainer",
//       paymentScreen: "#embeddedPaymentContainer",
//     });
//   } catch (error) {
//     console.error("Unified Checkout payment failed:", error);

//     if (error?.name === "UnifiedCheckoutError") {
//       console.error("CyberSource error details:", {
//         reason: error.reason,
//         message: error.message,
//         code: error.code,
//       });
//     }

//     throw error;
//   }
// };


// const getSessionContext = async (event) => {
//   event.preventDefault();

//   proceedToPaymentButton.innerHTML = "Loading Checkout, Please Wait...";
//   proceedToPaymentButton.setAttribute("disabled", "true");

//   try {
//     const response = await axios.post("https://unified-checkout-backend.vercel.app/checkout-session", paymentPayload);

//     const captureContext = response.data?.captureContext;

//     if (!captureContext) {
//       throw new Error("The backend did not return a capture context.");
//     }

//     const decoded = decodeJwtPayload(captureContext);
//     const contextData = decoded?.ctx?.[0]?.data;

//     if (!contextData || !contextData.clientLibrary) {
//       throw new Error("clientLibrary is missing from decoded capture context.");
//     }

//     await loadCyberSourceSdk(contextData.clientLibrary, contextData.clientLibraryIntegrity);

//     if (window.VAS && typeof window.VAS.UnifiedCheckout === "function") {
//       await startWithVAS(captureContext);
//       return;
//     }

//     throw new Error("CyberSource SDK loaded, but window.VAS is unavailable.");
//   } catch (error) {
//     console.error(error);
//     alert("Unable to initialize payment. Check console for details.");
//   } finally {
//     proceedToPaymentButton.innerHTML = "Proceed to Payment";
//     proceedToPaymentButton.removeAttribute("disabled");
//   }
// };

// if (!proceedToPaymentButton) {
//   console.error("Could not find #proceedToPayment button.");
// } else {
//   proceedToPaymentButton.addEventListener("click", getSessionContext);
// }



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
        headers: {
          "Content-Type": "application/json",
        },

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

  const originalText = proceedToPaymentButton.innerHTML;

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

    const jwtParts = captureContext.split(".");

    if (jwtParts.length !== 3) {
      throw new Error("Backend returned an invalid Capture Context JWT.");
    }

    let base64 = jwtParts[1].replace(/-/g, "+").replace(/_/g, "/");

    while (base64.length % 4) {
      base64 += "=";
    }

    const decodedPayload = JSON.parse(atob(base64));

    const clientLibrary = decodedPayload?.ctx?.[0]?.data?.clientLibrary;

    const clientLibraryIntegrity = decodedPayload?.ctx?.[0]?.data?.clientLibraryIntegrity;

    if (!clientLibrary) {
      throw new Error("clientLibrary is missing from Capture Context.");
    }

    console.log("Loading CyberSource SDK...");

    await loadCyberSourceSdk(clientLibrary, clientLibraryIntegrity);

    if (!window.VAS || typeof window.VAS.UnifiedCheckout !== "function") {
      throw new Error("CyberSource SDK loaded but VAS.UnifiedCheckout is unavailable.");
    }

    proceedToPaymentButton.innerHTML = "Complete Payment in Checkout";

    const result = await startWithVAS(captureContext);

    console.log("Final payment result:", result);

    alert("Payment completed successfully.");
  } catch (error) {
    console.error("Payment initialization failed:", error);

    let message = "Unable to process payment.";

    if (error?.response?.data) {
      message = error.response.data.error || error.response.data.message || message;

      console.error("Server error:", error.response.data);
    } else if (error?.message) {
      message = error.message;
    }

    alert(message);
  } finally {
    proceedToPaymentButton.innerHTML = originalText;

    proceedToPaymentButton.disabled = false;
  }
};

if (!proceedToPaymentButton) {
  console.error("Could not find #proceedToPayment");
} else {
  proceedToPaymentButton.addEventListener("click", getSessionContext);
}

