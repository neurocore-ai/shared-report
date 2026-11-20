// Assembles the GitHub Pages site from the private data checkout.
//
//   node scripts/build-site.mjs --data <dir containing share folders> --out <site dir>
//
// Only an allowlist is copied: per share the viewer page, meta.json and the one data file meta.json points to.
// Anything else in a share folder (old data files, stray files) never reaches the public site.
// Output is a count only — share ids must not reach the workflow log.
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectShare, listShareFolders } from "./purge.mjs";

export async function buildSite({ dataDir, viewerDir, outDir, nowMs }) {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, "d"), { recursive: true });
  await mkdir(join(outDir, "assets"), { recursive: true });

  await copyFile(join(viewerDir, "decrypt.mjs"), join(outDir, "assets", "decrypt.mjs"));
  // Root and unknown paths show the same "expired or not found" page.
  await copyFile(join(viewerDir, "gone.html"), join(outDir, "index.html"));
  await copyFile(join(viewerDir, "gone.html"), join(outDir, "404.html"));
  await writeFile(join(outDir, ".nojekyll"), "");

  let published = 0;
  for (const name of await listShareFolders(dataDir)) {
    const share = await inspectShare(dataDir, name, nowMs);
    if (!share) continue;
    const target = join(outDir, "d", name);
    await mkdir(target, { recursive: true });
    await copyFile(join(viewerDir, "index.html"), join(target, "index.html"));
    for (const file of share.files) await copyFile(join(dataDir, name, file), join(target, file));
    published++;
  }
  return { published };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dataDir = arg("--data");
  const outDir = arg("--out");
  if (!dataDir || !outDir) {
    console.error("usage: node scripts/build-site.mjs --data <dir> --out <dir>");
    process.exit(2);
  }
  const viewerDir = join(dirname(fileURLToPath(import.meta.url)), "..", "viewer");
  console.log(JSON.stringify(await buildSite({ dataDir, viewerDir, outDir, nowMs: Date.now() })));
}
