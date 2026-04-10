---
'@fetchkit/chaos-fetch': major
---

Fixed

- native fetch(request, init) override semantics preserved in createClient
- throttle middleware fixed/hardened
- scope rateLimit cache fixed
- built-in middleware registration made idempotent to avoid repeated global re-registration on each createClient call
- README synced with actual implementation
- TypeScript 6 moduleResolution deprecation warning silenced
- Node stream path hardened, body corruption prevented
- removed stale error listener
- corrected route matching doc
