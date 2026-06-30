# Mellowtel Tizen — Demo App

A complete, runnable Tizen TV Web app that integrates `mellowtel-tizen`. Use it as the smoke test.

## What it shows
- First-run **consent dialog** (TV-remote navigable).
- Live **request counters** (today + total) from `getStats()`.
- An **opt in / opt out** toggle and a button to re-open the consent dialog.
- The stable **node id** at the bottom.

## Remote controls
- **LEFT / RIGHT** — move focus between buttons
- **ENTER** — activate the focused button
- **RETURN / BACK** — exit the app (or decline the consent dialog when it's open)

## Run it

1. Set your key in [main.js](./main.js): replace `DEMO_PUBLIC_KEY`.
2. Refresh the bundled SDK if you changed the SDK source:
   ```bash
   cd .. && npm run build && cp dist/mellowtel-tizen.umd.js demo/js/mellowtel-tizen.umd.js
   ```
3. Build & deploy with the **VS Code Tizen extension** (Build Web Application → Run) or the CLI:
   ```bash
   tizen build-web
   tizen package -t wgt -s <your-cert-profile> -- .buildResult
   tizen install -n MellowtelDemo.wgt -t <emulator-or-device>
   tizen run -p MellowtelD.demo -t <emulator-or-device>
   ```
4. Open the Web Inspector console and watch for `[WS] connection established` and incoming jobs.

> The `js/mellowtel-tizen.umd.js` file is a copy of the built UMD bundle so the app runs without a
> bundler. Re-copy it after rebuilding the SDK.

See the top-level [INTEGRATION.md](../INTEGRATION.md) for the full guide and troubleshooting.
