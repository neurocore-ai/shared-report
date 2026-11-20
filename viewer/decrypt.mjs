// Viewer-side half of the share format. Runs in the browser and in Node (tests) —
// only globalThis.crypto.subtle, atob and TextEncoder/TextDecoder are used.
//
//   key   : PBKDF2-HMAC-SHA256, 600,000 iterations, 16-byte salt -> AES-256
//   data  : IV(12) || ciphertext || tag(16), AES-256-GCM, AAD "shared-report:v1:<shareId>"
//   meta  : { v:1, rev, iter, salt, data:"data.<n>.enc", expiresAt, publishedAt }
//
// meta.json is not signed. validateMeta() therefore accepts only the exact v1 contract,
// so a malformed file cannot make the page fetch another path or burn CPU on a huge iteration count.
// The expiry check is a courtesy for the reader, not access control: removal from the site is.

const ITERATIONS = 600000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DATA_NAME = /^data\.\d{1,9}\.enc$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function fromBase64(text) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function isoToMs(value) {
  if (typeof value !== "string") return NaN;
  return Date.parse(value);
}

// Returns { rev, iter, salt, data, expiresAt(ms), publishedAt(ms) } or null.
export function validateMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  if (meta.v !== 1 || meta.iter !== ITERATIONS) return null;
  if (!Number.isInteger(meta.rev) || meta.rev < 1) return null;
  if (typeof meta.data !== "string" || !DATA_NAME.test(meta.data)) return null;
  if (typeof meta.salt !== "string" || !BASE64.test(meta.salt)) return null;
  let saltLength;
  try {
    saltLength = fromBase64(meta.salt).length;
  } catch {
    return null;
  }
  if (saltLength !== SALT_BYTES) return null;
  const expiresAt = isoToMs(meta.expiresAt);
  const publishedAt = isoToMs(meta.publishedAt);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(publishedAt)) return null;
  return { rev: meta.rev, iter: meta.iter, salt: meta.salt, data: meta.data, expiresAt, publishedAt };
}

export function isExpired(meta, nowMs) {
  return nowMs >= meta.expiresAt;
}

// meta must be the value returned by validateMeta(). Throws when the password is wrong,
// the data was altered, or the data belongs to another share.
export async function decryptDocument(dataBytes, password, meta, shareId) {
  if (dataBytes.byteLength <= IV_BYTES + TAG_BYTES) throw new Error("data too short");
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(meta.salt), iterations: meta.iter },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: dataBytes.slice(0, IV_BYTES), additionalData: encoder.encode(`shared-report:v1:${shareId}`) },
    key,
    dataBytes.slice(IV_BYTES),
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(plain);
}
