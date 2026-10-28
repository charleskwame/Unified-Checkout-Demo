const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const forge = require("node-forge");

// Response MLE: CyberSource encrypts notification/response bodies as a JWE
// (RSA-OAEP-256 + A256GCM) using the public certificate registered in EBC2.
// Decrypting requires the matching private key, which lives in the .p12 file.
const P12_PATH = process.env.CYBERSOURCE_RESPONSE_MLE_P12_PATH;
const P12_BASE64 = process.env.CYBERSOURCE_RESPONSE_MLE_P12_BASE64;
const P12_PASSWORD = process.env.CYBERSOURCE_RESPONSE_MLE_P12_PASSWORD || "";
const PRIVATE_KEY = process.env.CYBERSOURCE_RESPONSE_MLE_PRIVATE_KEY;
const PRIVATE_KEY_BASE64 = process.env.CYBERSOURCE_RESPONSE_MLE_PRIVATE_KEY_BASE64;

const GCM_KEY_LENGTHS = { A128GCM: 16, A192GCM: 24, A256GCM: 32 };

let cachedPrivateKey = null;

const isConfigured = () => Boolean(P12_PATH || P12_BASE64 || PRIVATE_KEY || PRIVATE_KEY_BASE64);

const isJwe = (value) => typeof value === "string" && value.trim().split(".").length === 5;

const normalizePem = (value) => String(value).replace(/\\n/g, "\n").trim();

const privateKeyPemFromP12 = (buffer, password) => {
  const asn1 = forge.asn1.fromDer(buffer.toString("binary"));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);

  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ];

  const keyBag = keyBags.find((bag) => bag?.key);

  if (!keyBag) {
    throw new Error("The p12 file does not contain a private key.");
  }

  return forge.pki.privateKeyToPem(keyBag.key);
};

const loadPrivateKeyPem = () => {
  if (PRIVATE_KEY) {
    return normalizePem(PRIVATE_KEY);
  }

  if (PRIVATE_KEY_BASE64) {
    return Buffer.from(PRIVATE_KEY_BASE64, "base64").toString("utf8");
  }

  // Files are resolved next to this module so the path works from Vercel too.
  const p12Buffer = P12_BASE64 ? Buffer.from(P12_BASE64, "base64") : fs.readFileSync(path.resolve(__dirname, P12_PATH));

  return privateKeyPemFromP12(p12Buffer, P12_PASSWORD);
};

const getPrivateKey = () => {
  if (!cachedPrivateKey) {
    cachedPrivateKey = crypto.createPrivateKey(loadPrivateKeyPem());
  }

  return cachedPrivateKey;
};

const decryptJwe = (jwe) => {
  const [encodedHeader, encodedKey, encodedIv, encodedCiphertext, encodedTag] = String(jwe).trim().split(".");

  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));

  if (header.alg !== "RSA-OAEP-256" && header.alg !== "RSA-OAEP") {
    throw new Error(`Unsupported JWE key algorithm: ${header.alg}`);
  }

  const keyLength = GCM_KEY_LENGTHS[header.enc];

  if (!keyLength) {
    throw new Error(`Unsupported JWE content encryption: ${header.enc}`);
  }

  const contentKey = crypto.privateDecrypt(
    {
      key: getPrivateKey(),
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: header.alg === "RSA-OAEP" ? "sha1" : "sha256",
    },
    Buffer.from(encodedKey, "base64url"),
  );

  if (contentKey.length !== keyLength) {
    throw new Error("Decrypted content encryption key has an unexpected length.");
  }

  const decipher = crypto.createDecipheriv(`aes-${keyLength * 8}-gcm`, contentKey, Buffer.from(encodedIv, "base64url"));

  // The encoded header is the additional authenticated data for compact JWE.
  decipher.setAAD(Buffer.from(encodedHeader, "ascii"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));

  const plaintext = Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]);

  return plaintext.toString("utf8");
};

// Returns the decrypted notification object, or throws when it cannot be read.
const decryptNotification = (jwe) => {
  if (!isConfigured()) {
    throw new Error("Response MLE is not configured; set CYBERSOURCE_RESPONSE_MLE_P12_PATH (or _P12_BASE64) and _P12_PASSWORD.");
  }

  return JSON.parse(decryptJwe(jwe));
};

module.exports = { isConfigured, isJwe, decryptNotification };
