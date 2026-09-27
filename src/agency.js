import { readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";

export const agencyIndex = JSON.parse(readFileSync(new URL("../catalog/agency-index.json", import.meta.url), "utf8"));
const indexByPath = new Map(agencyIndex.agents.map(item => [item.path, item]));

export function parseAgency(markdown, path) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error(`Agency prompt missing frontmatter: ${path}`);
  const property = key => match[1].match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1]?.replace(/^["']|["']$/g, "").trim() ?? "";
  return { path, title: property("name") || path.split("/").pop().replace(/\.md$/, "").replaceAll("-", " "),
    description: property("description"), emoji: property("emoji") || "✦", division: path.split("/")[0], prompt: markdown };
}

export function gitBlobSha(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function loadVerified(root, path) {
  const item = indexByPath.get(path);
  if (!item) throw new Error("Unrecognized Agency catalog path");
  const base = realpathSync(root), source = realpathSync(resolve(base, path));
  if (!source.startsWith(base + sep)) throw new Error("Agency source escaped source directory");
  const bytes = readFileSync(source);
  if (gitBlobSha(bytes) !== item.sha) throw new Error(`Agency source hash mismatch: ${path}`);
  return { ...parseAgency(bytes.toString("utf8"), path), sourceCommit: agencyIndex.commit, sourceSha: item.sha };
}

export function loadBundledAgency(path) {
  return loadVerified(new URL("../vendor/agency/", import.meta.url), path);
}

export function importAgencyCheckout(store, root, paths = agencyIndex.agents.map(item => item.path)) {
  let imported = 0;
  for (const path of paths) { store.importPersona(loadVerified(root, path)); imported++; }
  return imported;
}
