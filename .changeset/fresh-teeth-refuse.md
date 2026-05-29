---
'@fetchkit/chaos-fetch': patch
---

Added

- trusted publishing workflow (OIDC + npm provenance)
- automated version PR workflow
- Dependabot configuration with grouped update strategy

Changed

- CI workflow hardened (pinned action SHAs, npm ci, Node 24)
- release announce workflow action pinning
- coverage enforcement added (80% thresholds)
