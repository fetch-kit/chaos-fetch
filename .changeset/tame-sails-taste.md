---
'@fetchkit/chaos-fetch': patch
---

Added

- property-based fuzz testing for stateful middleware, rate limiting, routing, middleware composition, throttled streams, telemetry, and global fetch lifecycle

Fixed

- rate-limit windows now reset at the exact boundary
- throttled browser stream cancellation now propagates to the source
- telemetry shutdown removes registered process and browser lifecycle listeners
- repeated global fetch replacement cycles now restore the correct fetch implementation
