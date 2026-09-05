---
'@fetchkit/chaos-fetch': patch
---

Changed

- replaced `@koa/router` with direct `path-to-regexp` route matching

Fixed

- browser and Service Worker bundles no longer require Node.js `http` and `url` modules
