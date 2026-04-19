# chaos-fetch

## 1.1.0

### Minor Changes

- 3fc12b6: Added
  - OpenTelemetry support
  - Local observibility stack

  Changed
  - CI/dev scripts tweaked

## 1.0.0

### Major Changes

- 9a15225: Fixed
  - native fetch(request, init) override semantics preserved in createClient
  - throttle middleware fixed/hardened
  - scope rateLimit cache fixed
  - built-in middleware registration made idempotent to avoid repeated global re-registration on each createClient call
  - README synced with actual implementation
  - TypeScript 6 moduleResolution deprecation warning silenced
  - Node stream path hardened, body corruption prevented
  - removed stale error listener
  - corrected route matching doc

## 0.8.0

### Minor Changes

- f06fc4b: Fixed
  - Added lru-cache as an explicit runtime dependency
  - Preserved stateful route middleware behavior across requests by caching resolved route middleware chains (fixes failNth and other stateful middleware reset behavior)

  Changed
  - Exported public middleware types (Context, Middleware) from the package entrypoint for easier custom middleware authoring
  - Documentation improvements

## 0.7.2

### Patch Changes

- bbc2eac: Added
  - Discord section to readme

## 0.7.1

### Patch Changes

- ace2549: Added
  - Discord release announcement

## 0.7.0

### Minor Changes

- 0c1f909: Added
  - relative url handling, where available
  - mock() middleware import

  Changed
  - global and routes made optional in config

  Fixed
  - documentation

## 0.6.0

### Minor Changes

- b39105e: Fixed
  - build process

## 0.5.0

### Minor Changes

- 7a5b458: Added
  - mock() middleware

## 0.4.0

### Minor Changes

- 3e88f34: Added
  - throttle middleware
  - github CI
  - precommit hook
  - eslint
  - badges to readme

  Changed
  - route matching logic

  Fixed
  - lint errors

## 0.3.1

### Patch Changes

- 458dc8b: Fixed
  - rateLimit test

## 0.3.0

### Minor Changes

- 15ad76d: Changed
  - prepublish script fixed
  - publish script deleted

## 0.2.2

### Patch Changes

- f379793: Changed
  - test fixed to run during npx publish

## 0.2.1

### Patch Changes

- ef84470: Changed
  - package.json package name fixed

## 0.2.0

### Minor Changes

- 14a6196: Initial release
