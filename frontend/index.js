// import axios, { isCancel, AxiosError } from "axios";
const proceedToPaymentButton = document.getElementById("proceedToPayment");

const paymentPayload = {
  targetOrigins: ["https://localhost:5500", "https://localhost:3000"],
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

const getSessionContext = async (event) => {
  event.preventDefault();
  try {
    const response = await axios.post("http://localhost:3000/checkout-session", paymentPayload);
    const captureContext = response.data?.captureContext;

    if (!captureContext) {
      throw new Error("The backend did not return a capture context.");
    }

    console.log("Capture context received:", captureContext);

    //decoding token
    const decodedToken = (captureContext) => {
      try {
        const parts = captureContext.split(".");
        if (parts.length !== 3) {
          throw new Error("Invalid JWT format");
        }
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        return payload;
      } catch (error) {
        console.error("Error decoding JWT:", error);
        return null;
      }
    };

    const decoded = decodedToken(captureContext);
    console.log("Decoded token:", decoded);

    const contextData = decoded?.ctx?.[0]?.data;
    if (!contextData) {
      throw new Error("Capture context does not contain ctx[0].data.");
    }

    const clientLibrary = contextData.clientLibrary;
    const integrity = contextData.clientLibraryIntegrity;
    console.log("Unified Checkout SDK:", { clientLibrary, integrity });

    const head = window.document.getElementsByTagName("head")[0];
    const script = window.document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.onload = async () => {
      console.log("Accept SDK loaded successfully.");
      const showArgs = {
        containers: {
          paymentSelection: "#buttonPaymentListContainer",
          paymentScreen: "#embeddedPaymentContainer",
        },
      };

      try {
        const accept = await window.Accept(captureContext);
        const up = await accept.unifiedPayments(false);
        const tt = await up.show(showArgs);
        const completeResponse = await up.complete(tt);
        let paymentResponse = decodedToken(completeResponse);
        if (paymentResponse.status === "AUTHORIZED" || paymentResponse.status === "CAPTURED") {
          window.alert("Payment successful! Status: " + paymentResponse.status);
        } else {
          window.alert("Payment failed! Status: " + paymentResponse.status);
        }
      } catch (error) {
        console.error("Error initializing Accept SDK:", error);
      } finally {
      }
    };

    script.src = clientLibrary;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
    }
    head.appendChild(script);
  } catch (error) {
    console.error("Checkout session request failed:", error.response?.data || error);
  }
};

proceedToPaymentButton.addEventListener("click", getSessionContext);
