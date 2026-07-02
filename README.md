<div align="center"><strong>Mellowtel Tizen</strong></div>
<div align="center">Monetize your Samsung Tizen TV apps.<br />Open-Source, Consensual, Transparent.</div>

---

# Introduction

`mellowtel-tizen` lets Samsung Tizen TV app developers earn revenue by letting **consenting** users
share a small slice of their unused internet bandwidth. Trusted partners use that bandwidth to fetch
publicly-available web data, and you get a share of the revenue.

It is the Tizen port of the [Mellowtel](https://www.mellowtel.com/) SDK family
(`mellowtel-js` for browser extensions, `mellowtel-electron` for desktop). It speaks the **same
backend wire protocol** as those SDKs, so a Tizen TV becomes a first-class node in the same network.

- **Opt-out by default.** Users are never enrolled without an explicit choice.
- **No personal data.** Only public pages requested by the network are fetched; never the user's data.
- **Resource-friendly.** Speed-gated, daily/hourly rate-limited, and capped to ≤2 hidden iframes to
  respect TV memory.
- **Tiny integration.** A few lines in your app entry point.

> ⚠️ **v1 scope:** no screenshots (the node advertises `screenshots=false` so the matchmaker won't
> route screenshot jobs to it). See [Limitations](#limitations).

---

## How it works (30 seconds)

```
 Mellowtel backend  ──ws job──▶  your Tizen app (opted-in)  ──fetch──▶  public web page
        ▲                                  │
        └────────── result POST ───────────┘   → you earn revenue
```

1. Your app embeds the SDK with your publishable key.
2. The user opts in via a TV-remote-friendly consent dialog.
3. The SDK opens one WebSocket to `wss://ws.mellow.tel` (this registers the TV as a node).
4. Jobs arrive; the SDK fetches the page, extracts HTML/Markdown, and POSTs the result back.
5. Rendering uses **fetch + DOMParser** (static pages) or a **same-origin `srcdoc` iframe**
   (JS-rendered pages). No Chrome-extension APIs, no native code.

A full architecture breakdown lives in the workspace guide
`SDK-ARCHITECTURE-AND-TIZEN-PORTING-GUIDE.md`.

---

## Installation — pick the easiest for you

Most Tizen TV apps are plain HTML/JS (no bundler), so **Option 1 is usually the fastest.**

### Option 1 — CDN `<script>` (zero install, nothing to build)
Add one line to your `index.html`. jsDelivr serves the prebuilt file straight from GitHub:

```html
<script src="https://cdn.jsdelivr.net/gh/mellowtel-inc/mellowtel-tizen@main/browser/mellowtel-tizen.umd.js"></script>
```

> Prefer to bundle it locally (recommended for production so the app has no external dependency at
> runtime)? Download that same file into your app and reference it locally:
> ```html
> <script src="js/mellowtel-tizen.umd.js"></script>
> ```
> The ready-to-use file lives in the repo at [`browser/mellowtel-tizen.umd.js`](./browser/mellowtel-tizen.umd.js).

### Option 2 — one-command setup script
From your app's root directory:

```bash
curl -fsSL https://raw.githubusercontent.com/mellowtel-inc/mellowtel-tizen/main/scripts/setup.sh | bash
```
It fetches, builds, and drops `js/mellowtel-tizen.umd.js` into your app.

### Option 3 — npm (for bundler-based projects)
```bash
npm install github:mellowtel-inc/mellowtel-tizen
```
```js
import Mellowtel from "mellowtel-tizen";
```
The package builds itself on install (`prepare` script), so `dist/` is ready automatically.

---

Whichever option you pick, your app's `config.xml` **must** declare the internet privilege:

```xml
<tizen:privilege name="http://tizen.org/privilege/internet"/>
```

See [INTEGRATION.md](./INTEGRATION.md) for the complete, step-by-step guide.

---

## Quick start

```js
import Mellowtel from "mellowtel-tizen";
// or, with the UMD <script>: const Mellowtel = window.Mellowtel;

const mellowtel = new Mellowtel("YOUR_PUBLIC_KEY");

async function bootstrap() {
  // Resolve identity + config. No network, no prompt. Auto-starts if already opted in.
  await mellowtel.initBackground();

  // Prompt once (no-op if the user already decided). OFF by default.
  const optedIn = await mellowtel.showConsentDialog({
    incentive: "Support this app by sharing unused bandwidth. No personal data is ever collected.",
  });

  if (optedIn) {
    await mellowtel.start(); // gates → /approval → connect → receive jobs
  }
}

bootstrap();
```

Let users change their mind later (e.g. from a Settings screen):

```js
await mellowtel.optOut(); // disconnects, stays remembered
await mellowtel.optIn();  // reconnects
const stats = await mellowtel.getStats(); // { total, daily, dailyHistory }
```

---

## API reference

| Method | Returns | Description |
|---|---|---|
| `new Mellowtel(publicKey, options?)` | — | `options`: `{ disableLogs?: boolean; logLevel?: 'debug'\|'info'\|'warn'\|'error'\|'silent' }`. Logs off by default. |
| `initBackground()` | `Promise<void>` | Resolve + persist node identity and key. No network. Auto-starts if previously opted in. |
| `showConsentDialog(options?)` | `Promise<boolean>` | Show the TV consent modal once; persists the choice. Returns the opt-in result. No-op if already decided. |
| `start()` | `Promise<boolean>` | Opt-in gate → speed test → `/approval` kill-switch → connect. Returns whether it started. |
| `stop()` | `Promise<void>` | Disconnect and tear down iframes. Keeps opt-in state. |
| `optIn()` | `Promise<void>` | Mark opted-in and start. |
| `optOut()` | `Promise<void>` | Mark opted-out and stop. |
| `getOptInStatus()` | `Promise<boolean \| undefined>` | `undefined` = not decided yet. |
| `getNodeId()` | `string` | The stable `mllwtl_<key>_<rand>` node id. |
| `getStats()` | `Promise<Stats>` | `{ total, daily, dailyHistory }`. |

---

## Configuration

Defaults live in `src/constants.ts`. Notable values (confirm with the Mellowtel backend team before
production):

| Constant | Default | Notes |
|---|---|---|
| `PLATFORM` | `tizen-tv` | Advertised to the matchmaker. |
| `MAX_DAILY_RATE` | `15000` | Daily job cap (matches Electron). |
| `MAX_HOURLY_RATE` | `937` | `dailyRate / 24 * 1.5` burst headroom. |
| `IFRAME_POOL_MAX` | `2` | TV memory constraint. |
| `SUPPORTS_SCREENSHOTS` | `false` | v1 capability flag. |

---

## Limitations

- **No screenshots in v1.** The node advertises `screenshots=false`.
- **No header rewriting.** Tizen has no `declarativeNetRequest`, so we cannot strip
  `X-Frame-Options`/CSP. JS-rendered pages are handled by fetching the HTML ourselves and running it
  in a same-origin `srcdoc` iframe (Option C) rather than framing third-party origins directly.
- **Background execution depends on the TV.** If the host app is suspended in the background, the
  socket closes. The SDK contributes while the app is foregrounded (or while a permitted background
  category keeps it alive). Validate on real firmware — see INTEGRATION.md.

---

## Development

```bash
npm install
npm run build      # UMD + ESM + .d.ts into dist/
npm test           # Jest (jsdom)
npm run typecheck
npm run lint
```

## License

LGPL-3.0
