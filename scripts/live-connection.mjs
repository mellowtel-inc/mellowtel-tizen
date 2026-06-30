/**
 * Live connection harness — drives the REAL built SDK against wss://ws.mellow.tel
 * in a clean Node environment (no browser, no extensions) so you can verify the
 * SDK's own connection code actually registers and receives jobs.
 *
 * This exercises the SAME modules that run on Tizen: WebSocketClient (ping/pong,
 * reconnect), MessageHandler (job parsing/routing), the gates, and the parser
 * path. Only the iframe renderer (Option C) needs a real browser, so JS-render
 * jobs won't fully complete here — but connection + job receipt + the Option A
 * (fetch+DOMParser) path do.
 *
 * Usage:
 *   node scripts/live-connection.mjs <PUBLIC_KEY> [seconds]
 *   node scripts/live-connection.mjs intgr-DjKu4Hccr6 30
 */
import { JSDOM } from "jsdom";
import WS from "ws";

// --- shim browser globals BEFORE importing the SDK ---
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "http://localhost/",
});
globalThis.window = globalThis;
globalThis.document = dom.window.document;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.WebSocket = WS; // node ws stands in for the browser WebSocket
// fetch + crypto + URLSearchParams are already global in Node 18+/22.

// in-memory localStorage shim (persists for the life of the process)
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
  clear: () => {
    for (const k of Object.keys(store)) delete store[k];
  },
};

const publicKey = process.argv[2] || "intgr-DjKu4Hccr6";
const seconds = parseInt(process.argv[3] || "30", 10);

const { Mellowtel } = await import("../dist/mellowtel-tizen.esm.js");

console.log(`\n=== Mellowtel live connection test ===`);
console.log(`publicKey: ${publicKey}`);
console.log(`duration : ${seconds}s\n`);

const m = new Mellowtel(publicKey, { logLevel: "debug" });
await m.initBackground();
console.log("nodeId   :", m.getNodeId());

// opt in programmatically (no dialog in node) and start
await m.optIn();
const started = await m.start();
console.log("start()  :", started, "\n");

let jobs = 0;
const baseline = (await m.getStats()).total;

const timer = setInterval(async () => {
  const stats = await m.getStats();
  jobs = stats.total - baseline;
}, 2000);

setTimeout(async () => {
  clearInterval(timer);
  const stats = await m.getStats();
  console.log(`\n=== summary after ${seconds}s ===`);
  console.log("jobs completed this run:", stats.total - baseline);
  console.log("daily/total:", stats.daily, "/", stats.total);
  await m.stop();
  console.log("stopped. exiting.");
  process.exit(0);
}, seconds * 1000);
