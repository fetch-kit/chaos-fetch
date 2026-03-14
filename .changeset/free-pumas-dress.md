---
'@fetchkit/chaos-fetch': minor
---

Fixed

- Added lru-cache as an explicit runtime dependency
- Preserved stateful route middleware behavior across requests by caching resolved route middleware chains (fixes failNth and other stateful middleware reset behavior)

Changed

- Exported public middleware types (Context, Middleware) from the package entrypoint for easier custom middleware authoring
- Documentation improvements
