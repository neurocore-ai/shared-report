import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateMeta, isExpired, decryptDocument } from "../viewer/decrypt.mjs";

// The same vector is committed in the service repository (lib/fixtures/share-vector.json).
// If the encryption format changes, both sides must fail until the vector is regenerated.
const vector = JSON.parse(await readFile(new URL("./fixtures/share-vector.json", import.meta.url), "utf8"));
const data = new Uint8Array(Buffer.from(vector.dataB64, "base64"));
const meta = {
  v: 1,
  rev: 1,
  iter: vector.iter,
  salt: vector.salt,
  data: "data.1.enc",
  expiresAt: "2026-12-20T14:59:59.000Z",
  publishedAt: "2026-11-20T03:00:00.000Z",
};

test("decrypts the vector produced by the service", async () => {
  assert.equal(await decryptDocument(data, vector.password, validateMeta(meta), vector.shareId), vector.plaintext);
});

test("rejects a wrong password", async () => {
  await assert.rejects(decryptDocument(data, "wrong-password", validateMeta(meta), vector.shareId));
});

test("rejects data bound to another share id", async () => {
  await assert.rejects(decryptDocument(data, vector.password, validateMeta(meta), "AnotherShareId00000001"));
});

test("rejects tampered data", async () => {
  const tampered = new Uint8Array(data);
  tampered[20] ^= 1;
  await assert.rejects(decryptDocument(tampered, vector.password, validateMeta(meta), vector.shareId));
});

test("validateMeta accepts a well-formed meta and returns only known fields", () => {
  const v = validateMeta({ ...meta, extra: "ignored" });
  assert.deepEqual(Object.keys(v).sort(), ["data", "expiresAt", "iter", "publishedAt", "rev", "salt"]);
  assert.equal(v.rev, 1);
  assert.equal(v.expiresAt, Date.parse("2026-12-20T14:59:59.000Z"));
  assert.equal(v.publishedAt, Date.parse("2026-11-20T03:00:00.000Z"));
});

test("validateMeta rejects anything outside the v1 contract", () => {
  const bad = [
    null,
    "string",
    { ...meta, v: 2 },
    { ...meta, iter: 1000 },
    { ...meta, iter: "600000" },
    { ...meta, salt: Buffer.alloc(15).toString("base64") },
    { ...meta, salt: "not base64 !!" },
    { ...meta, data: "../x" },
    { ...meta, data: "data.1.enc/../../secret" },
    { ...meta, data: "meta.json" },
    { ...meta, rev: 0 },
    { ...meta, rev: 1.5 },
    { ...meta, expiresAt: "soon" },
    { ...meta, publishedAt: 12345 },
  ];
  for (const m of bad) assert.equal(validateMeta(m), null, JSON.stringify(m));
});

test("isExpired flips exactly at the expiry time", () => {
  const v = validateMeta(meta);
  assert.equal(isExpired(v, v.expiresAt - 1), false);
  assert.equal(isExpired(v, v.expiresAt), true);
});
