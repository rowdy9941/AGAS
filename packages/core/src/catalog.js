export const initialCatalog = Object.freeze({
  runtimes: [
    { id: "hermes", name: "Hermes", command: "hermes", versionArgs: ["--version"], interfaces: ["cli"], distribution: "external", capabilities: ["reasoning", "tools"] },
    { id: "openclaw", name: "OpenClaw", command: "openclaw", versionArgs: ["--version"], interfaces: ["cli"], distribution: "external", capabilities: ["reasoning", "tools"] },
    { id: "codex", name: "Codex", command: "codex", versionArgs: ["--version"], interfaces: ["cli", "desktop"], distribution: "external", capabilities: ["reasoning", "code", "tools", "sandbox"] },
    { id: "claude-code", name: "Claude Code", command: "claude", versionArgs: ["--version"], interfaces: ["cli"], distribution: "external", capabilities: ["reasoning", "code", "tools"] },
    { id: "opencode", name: "OpenCode", command: "opencode", versionArgs: ["--version"], interfaces: ["cli", "desktop", "tui"], distribution: "external", capabilities: ["reasoning", "code", "tools"] },
  ],
  agents: [
    { id: "architect", personaId: "software-architect", mode: "on-demand" },
    { id: "frontend", personaId: "frontend-developer", mode: "on-demand" },
    { id: "security", personaId: "security-reviewer", mode: "on-demand" },
    { id: "reality", personaId: "reality-checker", mode: "on-demand" },
  ],
  personas: [
    { id: "software-architect", name: "Software Architect", compatibleRuntimes: ["hermes", "codex", "claude-code", "opencode"], permissions: ["workspace:read", "plan:write"] },
    { id: "frontend-developer", name: "Frontend Developer", compatibleRuntimes: ["codex", "claude-code", "opencode"], permissions: ["workspace:read", "workspace:write", "process:test"] },
    { id: "security-reviewer", name: "Security Reviewer", compatibleRuntimes: ["hermes", "codex", "claude-code"], permissions: ["workspace:read", "security:scan"] },
    { id: "reality-checker", name: "Reality Checker", compatibleRuntimes: ["hermes", "codex", "claude-code", "opencode"], permissions: ["workspace:read", "process:test"] },
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
      runtimePreference: ["codex", "hermes", "opencode", "claude-code"],
      roster: [
        { agentId: "architect", required: true },
        { agentId: "frontend", required: true },
        { agentId: "security", required: true },
        { agentId: "reality", required: true },
      ],
    },
  ],
});
