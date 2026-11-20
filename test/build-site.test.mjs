import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildSite } from "../scripts/build-site.mjs";
import { NOW, PAST, makeData, makeViewer, meta } from "./helpers.mjs";

const listed = async (dir) => (await readdir(dir)).sort();

test("publishes exactly three files per valid share plus the shared assets", async () => {
  const { root, dataDir } = await makeData({
    ValidShare0000000000001: { "meta.json": meta({ data: "data.2.enc" }), "data.2.enc": "cipher2", "data.1.enc": "old", "extra.txt": "x" },
    ExpiredShare00000000001: { "meta.json": meta({ expiresAt: PAST }), "data.1.enc": "cipher" },
    BrokenJsonShare00000001: { "meta.json": "{not json", "data.1.enc": "cipher" },
  });
  const viewerDir = await makeViewer(root);
  const outDir = join(root, "_site");

  const result = await buildSite({ dataDir, viewerDir, outDir, nowMs: NOW });
  assert.deepEqual(result, { published: 1 });
  assert.deepEqual(await listed(outDir), [".nojekyll", "404.html", "assets", "d", "index.html"]);
  assert.deepEqual(await listed(join(outDir, "d")), ["ValidShare0000000000001"]);
  assert.deepEqual(await listed(join(outDir, "d", "ValidShare0000000000001")), ["data.2.enc", "index.html", "meta.json"]);
  assert.equal(await readFile(join(outDir, "d", "ValidShare0000000000001", "index.html"), "utf8"), "<!-- viewer -->");
  assert.equal(await readFile(join(outDir, "d", "ValidShare0000000000001", "data.2.enc"), "utf8"), "cipher2");
  assert.deepEqual(await listed(join(outDir, "assets")), ["decrypt.mjs"]);
  assert.equal(await readFile(join(outDir, "index.html"), "utf8"), "<!-- gone -->");
  assert.equal(await readFile(join(outDir, "404.html"), "utf8"), "<!-- gone -->");
});

test("starts from a clean output directory", async () => {
  const { root, dataDir } = await makeData({});
  const viewerDir = await makeViewer(root);
  const outDir = join(root, "_site");
  await mkdir(join(outDir, "d", "StaleShare0000000000001"), { recursive: true });
  await writeFile(join(outDir, "d", "StaleShare0000000000001", "data.1.enc"), "stale");

  assert.deepEqual(await buildSite({ dataDir, viewerDir, outDir, nowMs: NOW }), { published: 0 });
  assert.deepEqual(await listed(join(outDir, "d")), []);
});

test("does not modify the data directory", async () => {
  const { root, dataDir } = await makeData({
    ExpiredShare00000000001: { "meta.json": meta({ expiresAt: PAST }), "data.1.enc": "cipher" },
  });
  await buildSite({ dataDir, viewerDir: await makeViewer(root), outDir: join(root, "_site"), nowMs: NOW });
  assert.deepEqual(await listed(dataDir), [".gitkeep", "ExpiredShare00000000001"]);
});
