import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const NOW = Date.parse("2026-11-20T03:00:00.000Z");
export const FUTURE = "2026-12-20T14:59:59.000Z";
export const PAST = "2026-11-19T14:59:59.000Z";
const SALT = Buffer.alloc(16, 5).toString("base64");

export function meta(over = {}) {
  return { v: 1, rev: 1, iter: 600000, salt: SALT, data: "data.1.enc", expiresAt: FUTURE, publishedAt: "2026-11-01T00:00:00.000Z", ...over };
}

// Creates <root>/d with the given share folders. files: { "<shareId>": { "<name>": content } }
export async function makeData(files) {
  const root = await mkdtemp(join(tmpdir(), "shared-report-"));
  const dataDir = join(root, "d");
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, ".gitkeep"), "");
  for (const [id, entries] of Object.entries(files)) {
    await mkdir(join(dataDir, id), { recursive: true });
    for (const [name, content] of Object.entries(entries)) {
      await writeFile(join(dataDir, id, name), typeof content === "string" ? content : JSON.stringify(content));
    }
  }
  return { root, dataDir };
}

export async function makeViewer(root) {
  const viewerDir = join(root, "viewer");
  await mkdir(viewerDir, { recursive: true });
  await writeFile(join(viewerDir, "index.html"), "<!-- viewer -->");
  await writeFile(join(viewerDir, "gone.html"), "<!-- gone -->");
  await writeFile(join(viewerDir, "decrypt.mjs"), "// decrypt");
  return viewerDir;
}
