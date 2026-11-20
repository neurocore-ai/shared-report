import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { purge } from "../scripts/purge.mjs";
import { NOW, PAST, makeData, meta } from "./helpers.mjs";

const run = promisify(execFile);
const listed = async (dir) => (await readdir(dir)).sort();

function fixture() {
  return makeData({
    ValidShare0000000000001: { "meta.json": meta(), "data.1.enc": "cipher" },
    ExpiredShare00000000001: { "meta.json": meta({ expiresAt: PAST }), "data.1.enc": "cipher" },
    NoMetaShare000000000001: { "data.1.enc": "cipher" },
    BrokenJsonShare00000001: { "meta.json": "{not json", "data.1.enc": "cipher" },
    BadContractShare0000001: { "meta.json": meta({ iter: 1000 }), "data.1.enc": "cipher" },
    NoDataShare000000000001: { "meta.json": meta({ data: "data.2.enc" }), "data.1.enc": "cipher" },
    "bad name!": { "meta.json": meta(), "data.1.enc": "cipher" },
  });
}

test("removes expired and invalid folders, keeps valid ones untouched", async () => {
  const { dataDir } = await fixture();
  const result = await purge(dataDir, NOW);
  assert.deepEqual(result, { removed: 6, kept: 1 });
  assert.deepEqual(await listed(dataDir), [".gitkeep", "ValidShare0000000000001"]);
  assert.deepEqual(await listed(join(dataDir, "ValidShare0000000000001")), ["data.1.enc", "meta.json"]);
  assert.equal(await readFile(join(dataDir, "ValidShare0000000000001", "data.1.enc"), "utf8"), "cipher");
});

test("a share expires exactly at its expiry time", async () => {
  const at = Date.parse("2026-12-20T14:59:59.000Z");
  const before = await makeData({ ValidShare0000000000001: { "meta.json": meta(), "data.1.enc": "c" } });
  assert.deepEqual(await purge(before.dataDir, at - 1), { removed: 0, kept: 1 });
  assert.deepEqual(await purge(before.dataDir, at), { removed: 1, kept: 0 });
});

test("a missing data directory is treated as empty", async () => {
  assert.deepEqual(await purge("/nonexistent/shared-report/d", NOW), { removed: 0, kept: 0 });
});

test("the CLI prints counts only — no share ids reach the public workflow log", async () => {
  const { dataDir } = await fixture();
  const { stdout, stderr } = await run(process.execPath, ["scripts/purge.mjs", "--data", dataDir, "--now", new Date(NOW).toISOString()]);
  assert.deepEqual(JSON.parse(stdout), { removed: 6, kept: 1 });
  for (const id of ["ValidShare0000000000001", "ExpiredShare00000000001", "NoMetaShare000000000001"]) {
    assert.equal((stdout + stderr).includes(id), false);
  }
});
