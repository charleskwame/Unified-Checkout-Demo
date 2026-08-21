// index.js

const proceedToPaymentButton = document.getElementById("proceedToPayment");

const paymentPayload = {
  targetOrigins: ["https://54b2-154-162-5-218.ngrok-free.app"],

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
    
    
    * `result` is the completed payment result
    
    
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
    // Clean
    // up checkout
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

    const response = await axios.post("https://unified-checkout-demo.onrender.com/checkout-session", paymentPayload);

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


























































































//WORKING COMMON JS VERSION (ONLY THE VERIFICATION PAYMENT IS NOT WORKING)


const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const { createHeaders } = require("cybersource-auth");
const {decodeJwt, jwtVerify} = require("jose")

const app = express();

app.use(
  cors({
    origin: "https://unified-checkout-frontend.vercel.app",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

const HOST = process.env.CYBERSOURCE_HOST;
const MERCHANT_ID = process.env.CYBERSOURCE_MERCHANT_ID;
const API_KEY_ID = process.env.CYBERSOURCE_API_KEY_ID;
const SHARED_SECRET = process.env.CYBERSOURCE_API_SECRET_KEY;
const resourcePath = "/uc/v1/sessions";

const createCheckoutSession = async (req, res) => {
  try {
    if (!HOST || !MERCHANT_ID || !API_KEY_ID || !SHARED_SECRET) {
      return res.status(500).json({
        error: "CyberSource environment variables are not fully configured.",
      });
    }

    const normalizedHost = HOST.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const url = `https://${normalizedHost}${resourcePath}`;

    const rawPayload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : req.body;
    const payload = normalizeCheckoutPayload(rawPayload);

    const validationErrors = validateCheckoutPayload(payload);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid checkout-session payload.",
        validationErrors,
      });
    }

    const rawBody = JSON.stringify(payload);

    const headers = createHeaders(MERCHANT_ID, normalizedHost, "post", resourcePath, rawBody, API_KEY_ID, SHARED_SECRET);

    const response = await fetch(url, {
      method: "POST",
      headers: headers,
      body: rawBody,
      signal: AbortSignal.timeout(10000),
    });

    const responseText = await response.text();
    const data = safeParseJson(responseText);

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || `CyberSource request failed (${response.status})`,
        details: data.details || data,
      });
    }

    const captureContext = extractCaptureContext(response, data, responseText);

    if (!captureContext) {
      return res.status(500).json({
        error: "CyberSource returned a 200 response, but no Capture Context token was generated.",
        responseHeaders: Object.fromEntries(response.headers.entries()),
        rawResponse: data,
        rawText: responseText,
      });
    }

    return res.json({ captureContext });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function validateCheckoutPayload(payload) {
  const errors = [];

  if (!Array.isArray(payload.targetOrigins) || payload.targetOrigins.length === 0) {
    errors.push("targetOrigins must be a non-empty array.");
  }

  if (typeof payload.clientVersion !== "string" || payload.clientVersion.trim().length === 0) {
    errors.push("clientVersion is required.");
  }

  if (!Array.isArray(payload.allowedCardNetworks) || payload.allowedCardNetworks.length === 0) {
    errors.push("allowedCardNetworks must be a non-empty array.");
  }

  if (!Array.isArray(payload.allowedPaymentTypes) || payload.allowedPaymentTypes.length === 0) {
    errors.push("allowedPaymentTypes must be a non-empty array.");
  }

  if (typeof payload.country !== "string" || payload.country.trim().length === 0) {
    errors.push("country is required.");
  }

  if (typeof payload.locale !== "string" || payload.locale.trim().length === 0) {
    errors.push("locale is required.");
  }

  const orderInfo = payload.data?.orderInformation || payload.orderInformation;

  if (typeof orderInfo !== "object" || orderInfo === null || typeof orderInfo.amountDetails !== "object" || orderInfo.amountDetails === null) {
    errors.push("data.orderInformation.amountDetails is required.");
    return errors;
  }

  const amountDetails = orderInfo.amountDetails;

  if (typeof amountDetails.totalAmount !== "string" || amountDetails.totalAmount.trim().length === 0) {
    errors.push("data.orderInformation.amountDetails.totalAmount is required.");
  }

  if (typeof amountDetails.currency !== "string" || amountDetails.currency.trim().length === 0) {
    errors.push("data.orderInformation.amountDetails.currency is required.");
  }

  return errors;
}


function normalizeCheckoutPayload(rawPayload) {
  const payload = rawPayload && typeof rawPayload === "object" ? { ...rawPayload } : {};

  if (typeof payload.data !== "object" || payload.data === null) {
    payload.data = {};
  }

  if (payload.orderInformation && !payload.data.orderInformation) {
    payload.data.orderInformation = payload.orderInformation;
  }

  delete payload.orderInformation;
  return payload;
}

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function extractCaptureContext(response, data, responseText) {
  const value =
    data.captureContext ||
    data.id ||
    data.token ||
    data.keyId ||
    data.data?.captureContext ||
    data.data?.id ||
    data.data?.token ||
    data.data?.keyId ||
    response.headers.get("capture-context") ||
    response.headers.get("v-c-capture-context") ||
    response.headers.get("location");

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof responseText === "string" && responseText.trim().length > 0) {
    return responseText.trim();
  }

  return null;
}

const verifyPaymentResult = async (req, res) => {
  try {
    const { result } = req.body;

    if (!result || typeof result !== "string") {
      return res.status(400).json({
        error: "Payment result JWT is required",
      });
    }

    const { payload, protectedHeader } = await jwtVerify(result, SHARED_SECRET);

    console.log("Verified JWT:", payload);
    console.log("Header:", protectedHeader);

    return res.status(200).json({
      success: true,
      payment: payload,
    });
  } catch (error) {
    console.error("JWT verification failed:", error);

    return res.status(401).json({
      error: "JWT verification failed",
    });
  }
};


app.post("/checkout-session", createCheckoutSession);
app.post("/verify-payment", verifyPaymentResult)

// app.post("/payment-session", processPaymentWithToken);

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
