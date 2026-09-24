# Security policy

## Supported version

Security fixes are provided for the latest `1.x` release. Report suspected
vulnerabilities privately through GitHub Security Advisories for this repository.
Do not include credentials, customer data, or exploit details in a public issue.

## Security defaults

- The service binds to loopback unless an explicit administrator token is set.
- API tokens are SHA-256 hashed at rest and authorized by role and workspace.
- Runtime execution defaults to the offline simulator; local CLI execution is
  opt-in, shell-free, time/output bounded, and workspace constrained.
- MCP records accept only `env:` or `vault:` secret references.
- Mission implementation tasks require explicit administrator approval.
- The Docker service runs as a non-root user with a read-only filesystem and
  `no-new-privileges`.

See [docs/threat-model.md](docs/threat-model.md) for boundaries and residual
risks.
