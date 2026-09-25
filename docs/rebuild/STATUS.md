# AGAS rebuild — implementation checkpoint

Approved by Raghunath on 25 September 2026. Work is on `rebuild/agas-foundations`; main remains the reviewed prototype.

The original logo is `brand/AGAS_Logo.jpg`. Preserve it unchanged. UI identity is **AGAS — Accessible General AI System, BY RAGHUNATH.D**.

The foundation lock selects AionUI, its pinned AionCore v0.2.2, real Paperclip, and the Agency catalog. `node scripts/foundations.mjs fetch` materializes their exact commits in one checkout. Canonical AGAS changes are maintained as checked patches under `integrations/`; generated native icons come from the original logo. Release packages must bundle the core applications; users must not need these development clones at runtime.

This is a recoverable source-import build, not a claim of a completed desktop MVP. The repository's original console and simulator remain historical prototype code until replacement gates pass. See `approved-plan.md` for scope and acceptance gates.

Pending: complete/recover AGAS UI patch; build and test desktop; real Paperclip startup and embedding; native runtime sessions and cancellation; catalog-to-hub activation; scoped context/MCP handoffs; durable missions and evidence verification; clean-machine installer. No real agent outcome is verified by a simulator.
