// Removes share folders that must no longer exist: expired ones and ones that fail the v1 contract.
// Invalid folders are deleted rather than kept — a folder without a readable expiry would otherwise stay forever.
//
//   node scripts/purge.mjs --data <dir containing share folders> [--now <ISO time>]
//
// Output is counts only. Share ids must not reach the workflow log of this public repository.
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateMeta, isExpired } from "../viewer/decrypt.mjs";

const SHARE_ID = /^[A-Za-z0-9]{6,64}$/;

// A share is publishable when its folder name is a share id, meta.json passes the contract,
// it has not expired, and the data file meta.json points to exists.
// Returns { meta, files: [names to publish] } or null.
export async function inspectShare(dataDir, name, nowMs) {
  if (!SHARE_ID.test(name)) return null;
  let meta;
  try {
    meta = validateMeta(JSON.parse(await readFile(join(dataDir, name, "meta.json"), "utf8")));
  } catch {
    return null;
  }
  if (!meta || isExpired(meta, nowMs)) return null;
  try {
    if (!(await stat(join(dataDir, name, meta.data))).isFile()) return null;
  } catch {
    return null;
  }
  return { meta, files: ["meta.json", meta.data] };
}

// Share folders directly under dataDir. Plain files (.gitkeep) are not shares.
export async function listShareFolders(dataDir) {
  let entries;
  try {
    entries = await readdir(dataDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

export async function purge(dataDir, nowMs) {
  let removed = 0;
  let kept = 0;
  for (const name of await listShareFolders(dataDir)) {
    if (await inspectShare(dataDir, name, nowMs)) {
      kept++;
    } else {
      await rm(join(dataDir, name), { recursive: true, force: true });
      removed++;
    }
  }
  return { removed, kept };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataDir = arg("--data");
  if (!dataDir) {
    console.error("usage: node scripts/purge.mjs --data <dir> [--now <ISO time>]");
    process.exit(2);
  }
  const now = arg("--now") ? Date.parse(arg("--now")) : Date.now();
  if (!Number.isFinite(now)) {
    console.error("--now must be an ISO time");
    process.exit(2);
  }
  console.log(JSON.stringify(await purge(dataDir, now)));
}
