import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { invariant } from "../../core/src/errors.js";

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "record";
}

function frontmatter(metadata) {
  const lines = Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

function parseFrontmatter(markdown) {
  invariant(typeof markdown === "string" && markdown.startsWith("---\n"), "INVALID_VAULT_DOCUMENT", "Vault document must start with YAML front matter");
  const end = markdown.indexOf("\n---\n", 4);
  invariant(end > 4, "INVALID_VAULT_DOCUMENT", "Vault front matter is not terminated");
  const metadata = {};
  for (const line of markdown.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    invariant(separator > 0, "INVALID_VAULT_FRONTMATTER", `Invalid front matter line: ${line}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    try { metadata[key] = JSON.parse(value); } catch { metadata[key] = value; }
  }
  return { metadata, body: markdown.slice(end + 5).trimStart() };
}

export class VaultProjector {
  constructor({ rootPath = "./data/vault", contextFabric, memory }) {
    this.rootPath = resolve(rootPath);
    this.contextFabric = contextFabric;
    this.memory = memory;
  }

  async project({ workspaceId, principalId }) {
    invariant(typeof workspaceId === "string" && workspaceId, "WORKSPACE_REQUIRED", "workspaceId is required");
    const root = join(this.rootPath, "AGAS", safeName(workspaceId));
    const artifacts = this.contextFabric.listArtifacts({ workspaceId });
    const handoffs = this.contextFabric.listHandoffs({ workspaceId });
    const memories = this.memory.search({ workspaceId, principalId });
    const files = [];

    const write = async (relative, content) => {
      const target = resolve(root, relative);
      invariant(target === root || target.startsWith(`${root}${sep}`), "VAULT_PATH_DENIED", "Vault output escaped its workspace root", 403);
      await atomicWrite(target, content);
      files.push(target.slice(this.rootPath.length + 1));
    };

    await write("index.md", `${frontmatter({ canonical_id: `urn:agas:workspace:${workspaceId}`, type: "workspace-index", workspace_id: workspaceId, version: 1 })}# AGAS workspace: ${workspaceId}\n\n- Artifacts: ${artifacts.length}\n- Handoffs: ${handoffs.length}\n- Memories: ${memories.length}\n`);
    for (const artifact of artifacts) {
      await write(join("Artifacts", `${safeName(artifact.canonicalId)}.md`), `${frontmatter({ canonical_id: artifact.canonicalId, type: "artifact", artifact_type: artifact.type, workspace_id: artifact.workspaceId, version: artifact.version, media_type: artifact.mediaType, provenance: artifact.provenance })}# ${artifact.name}\n\n${artifact.content}\n`);
    }
    for (const handoff of handoffs) {
      await write(join("Handoffs", `${safeName(handoff.canonicalId)}.md`), `${frontmatter({ canonical_id: handoff.canonicalId, type: "handoff", workspace_id: handoff.workspaceId, version: handoff.version, status: handoff.status, from_runtime: handoff.fromRuntimeId, to_runtime: handoff.toRuntimeId })}# Handoff: ${handoff.fromAgentId} → ${handoff.toAgentId}\n\n${handoff.summary}\n\n## Evidence\n${handoff.artifactIds.map((id) => `- ${id}`).join("\n")}\n`);
    }
    for (const memory of memories) {
      await write(join("Memories", `${safeName(memory.canonicalId)}.md`), `${frontmatter({ canonical_id: memory.canonicalId, type: "memory", memory_type: memory.type, workspace_id: memory.workspaceId, version: 1, visibility: memory.visibility, provenance: memory.provenance })}# Memory\n\n${memory.content}\n`);
    }
    return { root, files, counts: { artifacts: artifacts.length, handoffs: handoffs.length, memories: memories.length } };
  }

  importMarkdown(markdown, { principalId, workspaceId }) {
    const { metadata, body } = parseFrontmatter(markdown);
    invariant(metadata.type === "artifact", "UNSUPPORTED_VAULT_IMPORT", "Only artifact documents can be imported into authoritative state");
    invariant(typeof metadata.canonical_id === "string" && metadata.canonical_id.startsWith("urn:agas:artifact:"), "INVALID_CANONICAL_ID", "Artifact canonical_id is invalid");
    invariant(typeof metadata.workspace_id === "string" && metadata.workspace_id, "WORKSPACE_REQUIRED", "workspace_id is required");
    invariant(metadata.workspace_id === workspaceId, "VAULT_WORKSPACE_MISMATCH", "Vault document workspace does not match the authorized workspace", 403);
    const heading = body.match(/^#\s+(.+)$/m)?.[1] ?? "Imported artifact";
    const content = body.replace(/^#\s+.+\n+/, "");
    return this.contextFabric.upsertArtifact({
      canonicalId: metadata.canonical_id, workspaceId: metadata.workspace_id, principalId,
      name: heading, type: metadata.artifact_type ?? "document", mediaType: metadata.media_type ?? "text/markdown",
      content, provenance: { source: "obsidian-vault", previous: metadata.provenance ?? null, importedBy: principalId, importedAt: new Date().toISOString() },
    });
  }
}

export { parseFrontmatter };
