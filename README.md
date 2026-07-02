<div align="center"><strong>Mellowtel Tizen</strong></div>
<div align="center">Monetize your Samsung Tizen TV app.<br />Open-Source, Consensual, Transparent.</div>
<br />
<div align="center">
<a href="https://www.mellowtel.com/">Website</a>
<span> · </span>
<a href="https://github.com/mellowtel-inc/mellowtel-tizen">GitHub</a>
<span> · </span>
<a href="https://discord.gg/GC8vwpDWC9">Discord</a>
</div>

<br/>

<div align="center">

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?logo=typescript&logoColor=white)
![Tizen](https://img.shields.io/badge/Tizen-6.0%2B-%230B5FFF.svg?logo=tizen&logoColor=white)
![Samsung TV](https://img.shields.io/badge/Samsung-TV-1428A0.svg?logo=samsung&logoColor=white)
![License: LGPL v3](https://img.shields.io/badge/License-LGPL_v3-blue.svg)

</div>

---

# Introduction ℹ️

With Mellowtel's open-source library, your users can decide if they want to support you by sharing a
fraction of their unused internet bandwidth. Trusted partners — from startups to non-profits — access
the internet to retrieve publicly available data, and you get paid for it.

# Key Features 🎯

- **Easy to use** — add it to your TV app with a `<script>` tag (or npm) and a few lines of code.
- **Open-source** — every line is auditable.
- **Consensual & opt-out by default** — users are opted out until they explicitly opt in, and can opt
  out anytime.
- **Non-intrusive & private** — no personal data is collected; only public pages requested by the
  network are fetched. It runs invisibly (background `fetch` / hidden off-screen iframe — no tabs, no
  UI) and only while your app is in the foreground.
- **Resource-friendly** — speed-gated, daily/hourly rate-limited, and capped to ≤2 hidden iframes to
  respect TV memory.

# Getting started 🚀

You need a **publishable key** from Mellowtel. Then pick one of two install methods — most Tizen TV
apps are plain HTML/JS, so **the script tag is the fastest.**

## Install — Option 1: script tag (no build tools)

Add the SDK from the CDN (jsDelivr serves it straight from this repo):

```html
<script src="https://cdn.jsdelivr.net/gh/mellowtel-inc/mellowtel-tizen@main/browser/mellowtel-tizen.umd.js"></script>
```

For production, prefer **bundling it locally** so your app has no runtime dependency on a CDN —
download [`browser/mellowtel-tizen.umd.js`](./browser/mellowtel-tizen.umd.js) into your app and
reference it:

```html
<script src="js/mellowtel-tizen.umd.js"></script>
```

Either way, a global `Mellowtel` becomes available.

## Install — Option 2: npm

```bash
npm install github:mellowtel-inc/mellowtel-tizen
```

The package builds itself on install (`prepare` script), so `dist/` is ready automatically.

```js
import Mellowtel from "mellowtel-tizen";
```

If your TV app has **no bundler**, install the package and copy the prebuilt file into your app:

```bash
npm install github:mellowtel-inc/mellowtel-tizen
cp node_modules/mellowtel-tizen/browser/mellowtel-tizen.umd.js js/
```

## Declare the required privilege

The SDK makes cross-origin requests and a WebSocket connection, so your app's `config.xml` **must**
include:

```xml
<tizen:privilege name="http://tizen.org/privilege/internet"/>
```

# Quickstart

```js
// with the <script> tag:  var Mellowtel = window.Mellowtel;
// with a bundler:         import Mellowtel from "mellowtel-tizen";

var mellowtel = new Mellowtel("YOUR_PUBLIC_KEY", { logLevel: "debug" }); // logs on while testing

mellowtel.initBackground()            // load identity + config (no network). auto-starts if opted in
  .then(function () {
    return mellowtel.showConsentDialog();   // TV-remote-navigable modal; opt-out by default
  })
  .then(function (optedIn) {
    if (optedIn) return mellowtel.start();  // connect + start sharing
  });
```

Prefer your own consent UI? Skip `showConsentDialog()` and call `mellowtel.optIn()` /
`mellowtel.optOut()` from your settings screen, then `mellowtel.start()`.

With `logLevel: "debug"`, watch the Web Inspector console for `[WS] connection established` — that
means the SDK connected and your app is a live node.

# API

| Method | Description |
|---|---|
| `new Mellowtel(publicKey, options?)` | `options`: `{ disableLogs?: boolean; logLevel?: "debug"\|"info"\|"warn"\|"error"\|"silent" }`. Logs off by default. |
| `initBackground()` → `Promise<void>` | Load + persist node identity and key. No network. Auto-starts if the user already opted in. |
| `showConsentDialog(options?)` → `Promise<boolean>` | Show the TV consent modal once; persists the choice. Returns the opt-in result. |
| `start()` / `stop()` → `Promise` | Connect (gated on opt-in) / disconnect. |
| `optIn()` / `optOut()` → `Promise<void>` | Set consent from your own UI. |
| `getOptInStatus()` → `Promise<boolean \| undefined>` | `undefined` = not decided yet. |
| `getNodeId()` → `string` | Stable `mllwtl_<key>_<rand>` node id. |
| `getStats()` → `Promise<{ total, daily, dailyHistory }>` | Contribution stats. |

# Building & running on a Samsung TV

Tizen apps must be **signed** to install:

| Target | Certificate |
|---|---|
| **TV emulator** | A standard **Tizen** certificate (Certificate Manager default) works. |
| **Real Samsung TV** | A **Samsung** certificate (Samsung account) with the **TV's DUID** registered. The generic Tizen certificate will not install on a retail TV. |

Build/run with Tizen Studio or the VS Code Tizen extension. CLI example:

```bash
tizen package -t wgt -s <your-cert-profile> -- .
tizen install -n "<YourApp>.wgt" -s <serial>   # serial from `sdb devices`
tizen run -p <your-app-id> -s <serial>
```

# How it works & what leaves the device

While your app is running and the user is opted in, the SDK connects to `wss://ws.mellow.tel`,
receives jobs to fetch **public** web pages, does so via a background `fetch` or a **hidden off-screen
iframe** (never a tab or visible UI), converts the result to Markdown, and uploads it.

- **To the server:** an anonymous node id, SDK version, platform, measured speed, capability flags.
- **In results:** the fetched **public page's** HTML/Markdown for the requested URL. Never the user's
  browsing data, cookies, or identity.

# Limitations (v1)

- **No screenshots** — advertised as `screenshots=false`.
- **No header rewriting** — Tizen has no `declarativeNetRequest`, so JS-rendered pages are handled by
  fetching the HTML and running it in a same-origin `srcdoc` iframe rather than framing third-party
  origins directly.
- **Foreground execution** — if Tizen suspends your app in the background, the connection pauses and
  resumes when the app is active again.

# Development

```bash
npm install
npm run build      # UMD + ESM + .d.ts into dist/, plus browser/ (CDN file)
npm test           # Jest (jsdom)
npm run typecheck
npm run lint
```

> When you change the SDK source, re-run `npm run build` and commit the refreshed
> `browser/mellowtel-tizen.umd.js` (that's the file the CDN serves).

# Support

Questions? Reach us on [Discord](https://discord.gg/GC8vwpDWC9). Ask the Mellowtel team for your
publishable key.

# License 📜

GNU Lesser General Public License v3.0 (LGPL-3.0).
