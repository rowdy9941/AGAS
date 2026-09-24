export const initialCatalog = Object.freeze({
  runtimes: [
    { id: "agas-sim", name: "AGAS Simulator", builtin: true, version: "1.0.0", interfaces: ["internal"], distribution: "managed", capabilities: ["reasoning", "code", "tools", "simulation"] },
    { id: "hermes", name: "Hermes", command: "hermes", versionArgs: ["--version"], interfaces: ["cli"], distribution: "external", capabilities: ["reasoning", "tools"] },
    { id: "openclaw", name: "OpenClaw", command: "openclaw", versionArgs: ["--version"], interfaces: ["cli"], distribution: "external", capabilities: ["reasoning", "tools"] },
    { id: "codex", name: "Codex", command: "codex", versionArgs: ["--version"], execution: { args: ["exec", "--skip-git-repo-check", "-"], input: "objective" }, interfaces: ["cli", "desktop"], distribution: "external", capabilities: ["reasoning", "code", "tools", "sandbox"] },
    { id: "claude-code", name: "Claude Code", command: "claude", versionArgs: ["--version"], execution: { args: ["-p", "{objective}"], input: "none" }, interfaces: ["cli"], distribution: "external", capabilities: ["reasoning", "code", "tools"] },
    { id: "opencode", name: "OpenCode", command: "opencode", versionArgs: ["--version"], execution: { args: ["run", "{objective}"], input: "none" }, interfaces: ["cli", "desktop", "tui"], distribution: "external", capabilities: ["reasoning", "code", "tools"] },
  ],
  agents: [
    { id: "architect", personaId: "software-architect", mode: "on-demand" },
    { id: "frontend", personaId: "frontend-developer", mode: "on-demand" },
    { id: "security", personaId: "security-reviewer", mode: "on-demand" },
    { id: "reality", personaId: "reality-checker", mode: "on-demand" },
  ],
  personas: [
    { id: "software-architect", name: "Software Architect", description: "Designs boundaries, interfaces, tradeoffs, and delivery plans.", systemPrompt: "Design a coherent system, make tradeoffs explicit, and produce verifiable architecture decisions.", tags: ["architecture", "engineering"], compatibleRuntimes: ["hermes", "codex", "claude-code", "opencode", "agas-sim"], permissions: ["workspace:read", "plan:write"], version: "1.0.0", provenance: { sourceId: "agas-agency-starter", sourceVersion: "1.0.0", license: "MIT" } },
    { id: "frontend-developer", name: "Frontend Developer", description: "Builds accessible, responsive product interfaces.", systemPrompt: "Implement accessible interfaces and verify complete user flows in a browser.", tags: ["frontend", "accessibility"], compatibleRuntimes: ["codex", "claude-code", "opencode", "agas-sim"], permissions: ["workspace:read", "workspace:write", "process:test"], version: "1.0.0", provenance: { sourceId: "agas-agency-starter", sourceVersion: "1.0.0", license: "MIT" } },
    { id: "backend-engineer", name: "Backend Engineer", description: "Builds APIs, durable services, and data boundaries.", systemPrompt: "Implement reliable backend behavior with explicit validation, persistence, and tests.", tags: ["backend", "api", "database"], compatibleRuntimes: ["codex", "claude-code", "opencode", "agas-sim"], permissions: ["workspace:read", "workspace:write", "process:test"], version: "1.0.0", provenance: { sourceId: "agas-agency-starter", sourceVersion: "1.0.0", license: "MIT" } },
    { id: "security-reviewer", name: "Security Reviewer", description: "Finds trust-boundary, credential, and supply-chain risks.", systemPrompt: "Review threat boundaries and report concrete, reproducible security findings.", tags: ["security", "review"], compatibleRuntimes: ["hermes", "codex", "claude-code", "agas-sim"], permissions: ["workspace:read", "security:scan"], version: "1.0.0", provenance: { sourceId: "agas-agency-starter", sourceVersion: "1.0.0", license: "MIT" } },
    { id: "reality-checker", name: "Reality Checker", description: "Tests claims against running behavior and acceptance criteria.", systemPrompt: "Verify the whole story and reject unsupported completion claims.", tags: ["verification", "quality"], compatibleRuntimes: ["hermes", "codex", "claude-code", "opencode", "agas-sim"], permissions: ["workspace:read", "process:test"], version: "1.0.0", provenance: { sourceId: "agas-agency-starter", sourceVersion: "1.0.0", license: "MIT" } },
    { id: "qa-engineer", name: "QA Engineer", description: "Designs automated evaluation and regression coverage.", systemPrompt: "Turn requirements into risk-based automated tests and reproducible evidence.", tags: ["testing", "quality"], compatibleRuntimes: ["codex", "claude-code", "opencode", "agas-sim"], permissions: ["workspace:read", "workspace:write", "process:test"], version: "1.0.0", provenance: { sourceId: "agas-agency-starter", sourceVersion: "1.0.0", license: "MIT" } },
    { id: "devops-engineer", name: "DevOps Engineer", description: "Builds repeatable delivery, deployment, and observability workflows.", systemPrompt: "Create recoverable, least-privilege delivery automation with operational evidence.", tags: ["devops", "ci", "operations"], compatibleRuntimes: ["codex", "claude-code", "opencode", "agas-sim"], permissions: ["workspace:read", "workspace:write", "process:test"], version: "1.0.0", provenance: { sourceId: "agas-agency-starter", sourceVersion: "1.0.0", license: "MIT" } },
    { id: "research-analyst", name: "Research Analyst", description: "Collects evidence, tracks provenance, and synthesizes findings.", systemPrompt: "Research from authoritative sources, preserve provenance, and separate evidence from inference.", tags: ["research", "evidence"], compatibleRuntimes: ["hermes", "codex", "claude-code", "opencode", "agas-sim"], permissions: ["workspace:read", "research:read"], version: "1.0.0", provenance: { sourceId: "agas-agency-starter", sourceVersion: "1.0.0", license: "MIT" } },
  ],
  skills: [],
  tools: [],
  mcpServers: [],
  plugins: [],
  workflows: [
    { id: "phase-delivery", name: "Phase delivery", stages: ["plan", "implement", "verify", "review"] },
  ],
  models: [],
  hubs: [
    {
      id: "engineering",
      name: "Engineering Hub",
      runtimePreference: ["codex", "hermes", "opencode", "claude-code", "agas-sim"],
      roster: [
        { agentId: "architect", required: true },
        { agentId: "frontend", required: true },
        { agentId: "security", required: true },
        { agentId: "reality", required: true },
      ],
    },
  ],
});
