# Integrating Mellowtel into a Samsung Tizen TV app

A step-by-step guide to add `mellowtel-tizen` to a Tizen Web Application. Target: ~15 minutes.

---

## 1. Prerequisites

- A Tizen **Web** Application project (Tizen 6.0+).
- [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download) **or** the
  **Tizen extension for VS Code** with a TV emulator/device configured.
- Your Mellowtel **publishable key** (from the Mellowtel dashboard).
- A Samsung developer certificate (required to deploy to a real TV; the emulator can use the default).

---

## 2. Install the SDK

### Option A — npm (bundler-based projects)

```bash
npm install mellowtel-tizen
```

```js
import Mellowtel from "mellowtel-tizen";
```

### Option B — plain `<script>` (no bundler)

Copy `node_modules/mellowtel-tizen/dist/mellowtel-tizen.umd.js` into your app (e.g. `js/`), then:

```html
<script src="js/mellowtel-tizen.umd.js"></script>
<script>
  var Mellowtel = window.Mellowtel;
</script>
```

The UMD bundle has **no runtime dependencies** — Turndown and uuid are bundled in.

---

## 3. Declare the required privilege

Mellowtel fetches cross-origin pages, so the host app must request internet access. Add to
`config.xml`:

```xml
<widget xmlns="http://www.w3.org/ns/widgets"
        xmlns:tizen="http://tizen.org/ns/widgets"
        id="http://yourcompany/yourapp" version="1.0.0">

  <!-- REQUIRED: cross-origin fetch + WebSocket -->
  <tizen:privilege name="http://tizen.org/privilege/internet"/>

  <!-- Recommended: persistent storage for the node id / stats / counters -->
  <!-- localStorage works without a privilege; only add filesystem if you expect
       very large cached values (>2MB), which the SDK offloads to disk. -->
  <!-- <tizen:privilege name="http://tizen.org/privilege/filesystem.write"/> -->

  <!-- Optional: keep running in the background (see step 7). Availability and
       allowed categories vary by Tizen version / device policy. -->
  <!-- <tizen:setting background-support="enable"/> -->

  <content src="index.html"/>
  <tizen:profile name="tv"/>
</widget>
```

> The SDK works cross-origin **only** because of the internet privilege. Without it, fetches to
> third-party domains are blocked and no jobs can complete.

---

## 4. Initialize in your app entry point

In your main script (e.g. `main.js`), after the DOM is ready:

```js
var mellowtel = new Mellowtel("YOUR_PUBLIC_KEY", {
  // disableLogs: false,   // turn logs on while integrating
  // logLevel: "debug",
});

window.onload = async function () {
  // 1. Identity + config (no network). Auto-starts if the user already opted in.
  await mellowtel.initBackground();

  // 2. First-run consent. Place this where it won't interrupt critical UX —
  //    e.g. after onboarding, or behind a "Support this app" settings entry.
  if ((await mellowtel.getOptInStatus()) === undefined) {
    const accepted = await mellowtel.showConsentDialog({
      title: "Support this app",
      incentive:
        "Help keep this app free by sharing a little unused bandwidth. " +
        "We never collect personal data, and you can turn this off anytime.",
      acceptText: "Yes, I'll help",
      declineText: "Not now",
    });
    if (accepted) await mellowtel.start();
  }
};
```

The consent dialog is **TV-remote navigable**: LEFT/RIGHT move focus, ENTER selects, RETURN/BACK
declines. Big text and high contrast for 10-foot viewing.

---

## 5. Add a Settings toggle (recommended)

Give users a permanent way to change their choice:

```js
async function renderMellowtelSetting() {
  const status = await mellowtel.getOptInStatus(); // true | false | undefined
  // ...render a toggle reflecting `status`...
}

async function onToggle(turnOn) {
  if (turnOn) await mellowtel.optIn();
  else await mellowtel.optOut();
}

// Optional: show contribution stats
const stats = await mellowtel.getStats(); // { total, daily, dailyHistory }
```

---

## 6. Build & deploy

### With the VS Code Tizen extension
1. Open the project, sign in with your certificate profile.
2. **Tizen: Build Web Application** → produces a `.wgt`.
3. **Tizen: Run** on the TV emulator or a connected device.

### With the Tizen CLI
```bash
# -s is the device SERIAL (from `sdb devices`), e.g. emulator-26101.
tizen package -t wgt -s <your-cert-profile> -- .
tizen install -n "<YourApp>.wgt" -s <serial>
tizen run -p <your-app-id> -s <serial>
```

### Certificates (emulator vs real Samsung TV)

Tizen apps must be **signed** to install. What you need depends on the target:

| Target | Certificate needed |
|---|---|
| **TV emulator** | A standard **Tizen** certificate profile (author + Tizen public distributor) — the default from Certificate Manager works. |
| **Real Samsung TV** | A **Samsung** certificate (author + distributor) created via Certificate Manager with a Samsung account, **and the TV's DUID** (Device Unique ID) registered in the distributor certificate. The generic Tizen certificate will **not** install on a retail TV. |

To deploy to a physical TV: enable **Developer Mode** on the TV, note its **DUID**, create a Samsung
certificate including that DUID, set it active, then `package`/`install`/`run` with `-s <tv-serial>`
(connect the TV first via `sdb connect <tv-ip>`).

If a teammate already ships Samsung TV apps, the simplest path is to let them build with **their**
certificate profile — no key sharing needed.

---

## 7. Verify it works

With `logLevel: "debug"` enabled, watch the Web Inspector console for:

1. `[mellowtel-tizen] [Mellowtel] initialized, node: mllwtl_...` — identity OK.
2. `[mellowtel-tizen] [WS] connection established` — the node registered with the backend.
3. `[mellowtel-tizen] [MessageHandler] job: <recordID> <url>` — jobs arriving.
4. `[mellowtel-tizen] [Upload] result delivered for <recordID>` — results POSTed.

Restart the app and confirm `getNodeId()` returns the **same** id (identity persists).

---

## 8. Background execution (important caveat)

A node only contributes while the app is running and the socket is open. On many Tizen **TV**
builds, apps are **suspended** when sent to the background, which closes the WebSocket.

- If your app is typically kept in the foreground (e.g. a media app running for long sessions),
  foreground-only operation is fine.
- If you need background operation, enable a permitted `background-support` category in `config.xml`
  and **test on real firmware** — policy varies by Tizen version and device.

The SDK degrades gracefully either way: it simply pauses while suspended and resumes (auto-reconnect
+ 15-minute health check) when foregrounded.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No `[WS] connection established` | Missing internet privilege, or `/approval` denied | Add the privilege; verify the key is approved with Mellowtel |
| Connects but no jobs | Matchmaker has no work for this node's region/capabilities, or low advertised speed | Normal during quiet periods; confirm speed test isn't returning the fallback |
| Jobs arrive but uploads fail | CORS/network to `request.mellow.tel`, or backend rejecting the body | Check the console error from `[Upload]`; confirm internet privilege |
| `node id` changes every launch | Storage not persisting | Ensure the app isn't clearing localStorage; check the Web Inspector Application tab |
| Socket reconnects forever then stops | `/approval` disabled the integration | Expected — the reconnect gate halts the loop intentionally |
| Memory grows over a long session | Iframe leak | The pool caps at 2 and recycles; report with a repro if it persists |

---

## 10. What data leaves the device

- **To `wss://ws.mellow.tel`:** node id (`mllwtl_<key>_<rand>`), SDK version, platform, measured
  download speed, capability flags. No personal data.
- **To `request.mellow.tel`:** the fetched **public page's** HTML/Markdown for the requested URL,
  plus the job's `recordID` and your `orgId`. Never the user's browsing data, cookies, or identity.

That's the whole integration. Questions for the Mellowtel team are tracked at the bottom of
`SDK-ARCHITECTURE-AND-TIZEN-PORTING-GUIDE.md` (platform token, daily-rate, approval contract).
