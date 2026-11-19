const PREFIX = "XENO:v1:LATTICE-SIM:";
const PBKDF2_ITERATIONS = 250000;

function toB64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, hash: "SHA-256", iterations },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptXeno(plaintext, passphrase) {
  if (!passphrase) throw new Error("Passphrase is required.");
  const cryptoObj = globalThis.crypto;
  const salt = cryptoObj.getRandomValues(new Uint8Array(16));
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipherBuf = await cryptoObj.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${PREFIX}${toB64Url(salt)}.${toB64Url(iv)}.${toB64Url(new Uint8Array(cipherBuf))}`;
}

export async function decryptXeno(payload, passphrase) {
  if (!passphrase) throw new Error("Passphrase is required.");
  if (!payload.startsWith(PREFIX)) throw new Error("Invalid XenoCrypt header.");
  const parts = payload.slice(PREFIX.length).split(".");
  if (parts.length !== 3) throw new Error("Malformed XenoCrypt payload.");

  const [salt, iv, data] = parts.map(fromB64Url);
  const key = await deriveKey(passphrase, salt);
  const plainBuf = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  return new TextDecoder().decode(plainBuf);
}
