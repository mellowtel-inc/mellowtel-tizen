# Changelog

All notable changes to `mellowtel-tizen` are documented here. This project adheres to
[Semantic Versioning](https://semver.org/).

## [0.1.0] — Initial release

First working SDK for Samsung Tizen TV Web apps, porting the Mellowtel Electron architecture to the
Tizen Web Runtime.

### Added
- **Public facade** (`Mellowtel`): `initBackground`, `start`, `stop`, `optIn`, `optOut`,
  `getOptInStatus`, `showConsentDialog`, `getNodeId`, `getStats`.
- **Storage** (`TizenStorage`): `localStorage` primary with a `tizen.filesystem` fallback for
  values >2MB.
- **Identity**: stable `mllwtl_<publicKey>_<rand10>` node id, persisted across restarts; preserves
  the random tail across key changes.
- **Consent**: opt-out-by-default state + a TV-remote-navigable consent modal.
- **WebSocket client**: singleton connection to `wss://ws.mellow.tel`, app-level ping/pong liveness,
  bounded exponential-backoff reconnect, 15-minute health check, voluntary-disconnect sentinel.
- **Approval kill-switch**: GET `api.mellow.tel/approval` (real contract), 30-minute cache,
  fail-closed.
- **Rate limiter**: daily (`MAX_DAILY_RATE = 15000`) + hourly (burst headroom) counters with
  auto-reset.
- **Job pipeline**: `DataRequest.fromJson` (real `recordID` schema), `JobExecutor`, Option A
  (`ParserJob`: fetch + DOMParser), Option C (`IframeRenderer` + 2-iframe `IframePool`),
  `HtmlProcessor` (selector strip + Turndown), `ResultUploader` (real `request.mellow.tel` POST +
  presigned-S3 path), batch handling.
- **Speed test**: 1MB timed download, 24h cache, conservative fallback.
- **Hardening**: reconnect gate (halts on opt-out / local-disable / approval-denied),
  `disconnect_device` command support, per-job timeouts, fail-safe error handling throughout.
- **Build**: Rollup UMD + ESM + rolled-up `.d.ts`; deps (turndown, uuid) inlined.
- **Tests**: 41 Jest unit tests across storage, identity, consent, rate-limiter, data-request,
  html-processor, approval, request-counter, message-handler.
- **Docs**: comprehensive README (script + npm install) and this changelog.
- **Distribution**: CDN `<script>` (jsDelivr), and `npm install github:mellowtel-inc/mellowtel-tizen` (self-builds via `prepare`).

### Wire protocol
- Matches the live Mellowtel Electron/browser SDKs: `device_id`, `recordID`, `/approval` GET params,
  and the `request.mellow.tel` result body — so a Tizen TV registers and delivers results through the
  existing backend pipeline.

### Known limitations
- No screenshots (advertised as `screenshots=false`).
- No header rewriting (no `declarativeNetRequest` on Tizen); JS pages use same-origin `srcdoc`.
- Background execution depends on TV firmware/app policy.

### Open items (pending backend confirmation)
- Exact `platform` token, `MAX_DAILY_RATE`, capability-advertisement mechanism, and whether Cereal
  (server-defined parsers) is required for Tizen.
