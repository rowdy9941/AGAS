# AGAS local security boundary

AGAS binds to loopback by default and requires a configured `AGAS_BOOTSTRAP_TOKEN` before binding to a non-loopback interface. The development token is for local testing. Browser sessions keep the token in session storage and every data API requires a bearer token. Network exposure still needs TLS, real user authentication and an installation review.

Agency prompt files are imported as **data**, never executed as source code. Runtime discovery searches fixed executable names on PATH; a detected executable is not a ready runtime. Codex/OpenCode Dev tasks run in isolated Git worktrees and are recorded as untrusted until owner review. OpenCode, OpenClaw and Claude non-Dev work use documented tool restrictions and process timeouts; those runtime policies are not an operating-system sandbox. Live provider behavior has not been authenticated on this host. No adapter publishes to external Media accounts, sends broker orders or contacts a Health provider.

AGAS filters private and cross-hub notes before constructing agent prompts. The owner API, SQLite database, run logs, backups and projected vault remain local files without application-level encryption or separate person-specific logins. The vault is a readable projection, not a secret store. Revoking Health coordination consent stops new records and reviews, but retains past local records and snapshots. Back up and share these files according to the sensitivity of the content you enter.

Report security vulnerabilities privately through the repository owner's GitHub security reporting channel.
