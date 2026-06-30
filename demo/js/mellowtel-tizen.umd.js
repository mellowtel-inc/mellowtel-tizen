(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.Mellowtel = factory());
})(this, (function () { 'use strict';

    /******************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */
    /* global Reflect, Promise, SuppressedError, Symbol, Iterator */


    function __awaiter(thisArg, _arguments, P, generator) {
        function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
        return new (P || (P = Promise))(function (resolve, reject) {
            function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
            function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
            function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
            step((generator = generator.apply(thisArg, _arguments || [])).next());
        });
    }

    typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
        var e = new Error(message);
        return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
    };

    const LEVEL_WEIGHT = {
        debug: 10,
        info: 20,
        warn: 30,
        error: 40,
        silent: 100,
    };
    /**
     * Leveled, prefixed logger. Off by default in production; the facade flips the
     * level based on constructor options. A single shared instance keeps log
     * configuration global without threading it through every module.
     */
    class Logger {
        static setLevel(level) {
            Logger.level = level;
        }
        /** Convenience used by the facade: disableLogs=true => silent, else debug. */
        static configure(disableLogs, explicit) {
            if (explicit) {
                Logger.level = explicit;
            }
            else {
                Logger.level = disableLogs ? "silent" : "debug";
            }
        }
        static enabled(level) {
            return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[Logger.level];
        }
        static debug(...args) {
            if (Logger.enabled("debug"))
                console.log(Logger.prefix, ...args);
        }
        static log(...args) {
            Logger.debug(...args);
        }
        static info(...args) {
            if (Logger.enabled("info"))
                console.info(Logger.prefix, ...args);
        }
        static warn(...args) {
            if (Logger.enabled("warn"))
                console.warn(Logger.prefix, ...args);
        }
        static error(...args) {
            if (Logger.enabled("error"))
                console.error(Logger.prefix, ...args);
        }
    }
    Logger.level = "silent";
    Logger.prefix = "[mellowtel-tizen]";

    /**
     * Tizen storage adapter.
     *
     * Primary backend is `localStorage` (synchronous, persists across app restarts
     * on Tizen). Values larger than ~2MB are offloaded to the Tizen Filesystem API
     * because some TV WebKit builds throw QuotaExceededError on large localStorage
     * writes. A small marker is kept in localStorage so reads know to go to disk.
     *
     * All values are stored as strings; callers serialize/deserialize JSON.
     * The async API is uniform even though localStorage is sync, so the filesystem
     * fallback is transparent to callers.
     */
    const FS_MARKER_PREFIX = "__mllwtl_fs__:"; // localStorage value pointing at a file
    const FS_DIR = "wgt-private"; // Tizen app-private, persistent virtual root
    const FS_SUBDIR = "mellowtel";
    const LARGE_VALUE_BYTES = 2 * 1024 * 1024; // 2MB threshold
    function hasLocalStorage() {
        try {
            return typeof localStorage !== "undefined" && localStorage !== null;
        }
        catch (_a) {
            return false;
        }
    }
    function hasTizenFs() {
        return (typeof tizen !== "undefined" &&
            !!tizen &&
            typeof tizen.filesystem !== "undefined");
    }
    function byteLength(s) {
        // Cheap UTF-8 byte estimate without TextEncoder (older WebKit).
        let bytes = 0;
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if (c < 0x80)
                bytes += 1;
            else if (c < 0x800)
                bytes += 2;
            else if (c >= 0xd800 && c <= 0xdbff) {
                bytes += 4;
                i++;
            }
            else
                bytes += 3;
        }
        return bytes;
    }
    class TizenStorage {
        /** Read a string value. Resolves a filesystem marker transparently. */
        static get(key) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!hasLocalStorage())
                    return null;
                let raw;
                try {
                    raw = localStorage.getItem(key);
                }
                catch (e) {
                    Logger.error("[TizenStorage] localStorage.getItem failed:", e);
                    return null;
                }
                if (raw === null)
                    return null;
                if (raw.indexOf(FS_MARKER_PREFIX) === 0) {
                    const fileName = raw.slice(FS_MARKER_PREFIX.length);
                    return TizenStorage.readFile(fileName);
                }
                return raw;
            });
        }
        /** Write a string value, offloading large payloads to the filesystem. */
        static set(key, value) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!hasLocalStorage())
                    return;
                if (byteLength(value) >= LARGE_VALUE_BYTES && hasTizenFs()) {
                    const fileName = TizenStorage.fileNameForKey(key);
                    try {
                        yield TizenStorage.writeFile(fileName, value);
                        localStorage.setItem(key, FS_MARKER_PREFIX + fileName);
                        return;
                    }
                    catch (e) {
                        Logger.error("[TizenStorage] filesystem write failed, falling back:", e);
                        // fall through to localStorage attempt
                    }
                }
                try {
                    localStorage.setItem(key, value);
                }
                catch (e) {
                    // Quota exceeded — try the filesystem as a last resort.
                    Logger.error("[TizenStorage] localStorage.setItem failed:", e);
                    if (hasTizenFs()) {
                        const fileName = TizenStorage.fileNameForKey(key);
                        try {
                            yield TizenStorage.writeFile(fileName, value);
                            localStorage.setItem(key, FS_MARKER_PREFIX + fileName);
                        }
                        catch (e2) {
                            Logger.error("[TizenStorage] filesystem fallback also failed:", e2);
                        }
                    }
                }
            });
        }
        /** Remove a value (and any backing file). */
        static remove(key) {
            return __awaiter(this, void 0, void 0, function* () {
                if (!hasLocalStorage())
                    return;
                try {
                    const raw = localStorage.getItem(key);
                    if (raw && raw.indexOf(FS_MARKER_PREFIX) === 0) {
                        yield TizenStorage.deleteFile(raw.slice(FS_MARKER_PREFIX.length));
                    }
                    localStorage.removeItem(key);
                }
                catch (e) {
                    Logger.error("[TizenStorage] remove failed:", e);
                }
            });
        }
        // --- JSON convenience helpers ---
        static getJSON(key) {
            return __awaiter(this, void 0, void 0, function* () {
                const raw = yield TizenStorage.get(key);
                if (raw === null)
                    return null;
                try {
                    return JSON.parse(raw);
                }
                catch (_a) {
                    return null;
                }
            });
        }
        static setJSON(key, value) {
            return __awaiter(this, void 0, void 0, function* () {
                yield TizenStorage.set(key, JSON.stringify(value));
            });
        }
        // --- filesystem internals ---
        static fileNameForKey(key) {
            return key.replace(/[^a-zA-Z0-9_-]/g, "_") + ".dat";
        }
        static resolveDir() {
            return new Promise((resolve, reject) => {
                if (!hasTizenFs() || !tizen || !tizen.filesystem) {
                    reject(new Error("tizen.filesystem unavailable"));
                    return;
                }
                tizen.filesystem.resolve(FS_DIR, (root) => {
                    try {
                        let dir;
                        try {
                            dir = root.resolve(FS_SUBDIR);
                        }
                        catch (_a) {
                            dir = root.createDirectory(FS_SUBDIR);
                        }
                        resolve(dir);
                    }
                    catch (e) {
                        reject(e);
                    }
                }, (e) => reject(e), "rw");
            });
        }
        static writeFile(fileName, data) {
            return __awaiter(this, void 0, void 0, function* () {
                const dir = yield TizenStorage.resolveDir();
                return new Promise((resolve, reject) => {
                    let file;
                    try {
                        try {
                            file = dir.resolve(fileName);
                            // truncate by deleting then recreating
                            dir.deleteFile(file.fullPath || fileName, () => TizenStorage.openAndWrite(dir, fileName, data, resolve, reject), () => TizenStorage.openAndWrite(dir, fileName, data, resolve, reject));
                            return;
                        }
                        catch (_a) {
                            // file does not exist yet — create below
                        }
                        TizenStorage.openAndWrite(dir, fileName, data, resolve, reject);
                    }
                    catch (e) {
                        reject(e);
                    }
                });
            });
        }
        static openAndWrite(dir, fileName, data, resolve, reject) {
            try {
                const file = dir.resolve(fileName);
                file.openStream("w", (stream) => {
                    try {
                        stream.write(data);
                        stream.close();
                        resolve();
                    }
                    catch (e) {
                        reject(e);
                    }
                }, (e) => reject(e), "UTF-8");
            }
            catch (e) {
                reject(e);
            }
        }
        static readFile(fileName) {
            return __awaiter(this, void 0, void 0, function* () {
                let dir;
                try {
                    dir = yield TizenStorage.resolveDir();
                }
                catch (_a) {
                    return null;
                }
                return new Promise((resolve) => {
                    try {
                        const file = dir.resolve(fileName);
                        file.openStream("r", (stream) => {
                            try {
                                const data = stream.read(stream.bytesAvailable);
                                stream.close();
                                resolve(data);
                            }
                            catch (_a) {
                                resolve(null);
                            }
                        }, () => resolve(null), "UTF-8");
                    }
                    catch (_a) {
                        resolve(null);
                    }
                });
            });
        }
        static deleteFile(fileName) {
            return __awaiter(this, void 0, void 0, function* () {
                let dir;
                try {
                    dir = yield TizenStorage.resolveDir();
                }
                catch (_a) {
                    return;
                }
                return new Promise((resolve) => {
                    try {
                        const file = dir.resolve(fileName);
                        dir.deleteFile(file.fullPath || fileName, () => resolve(), () => resolve());
                    }
                    catch (_a) {
                        resolve();
                    }
                });
            });
        }
    }

    /**
     * Centralized configuration. No URLs are hardcoded anywhere else in the SDK.
     *
     * Network field names and endpoints intentionally match the live Mellowtel
     * Electron/browser SDKs so a Tizen node registers and delivers results through
     * the exact same backend pipeline (matchmaker + request.mellow.tel + S3/DynamoDB).
     */
    /** SDK semantic version (sent on the WebSocket connect + /approval). */
    const VERSION = "0.1.0";
    /** Platform token advertised to the matchmaker. Confirm exact value with backend. */
    const PLATFORM = "tizen-tv";
    /** WebSocket endpoint the node connects to (node registration happens on $connect). */
    const WS_URL = "wss://ws.mellow.tel";
    /** Default result endpoint (text results POST here; per-job save_html_endpoint can override). */
    const REQUEST_ENDPOINT = "https://request.mellow.tel/";
    /** Presigned-upload generator for binary results (screenshots/files). */
    const GENERATE_UPLOAD_URL_ENDPOINT = "https://request.mellow.tel/generate-upload-url";
    /** Daily cap on jobs executed by this node. Matches Electron default until backend confirms. */
    const MAX_DAILY_RATE = 15000;
    /** Hourly cap with burst headroom: dailyRate / 24 * 1.5. */
    const MAX_HOURLY_RATE = Math.floor((MAX_DAILY_RATE / 24) * 1.5);
    /** 24h window in ms (rate-limit + speed-test cache). */
    const DAY_MS = 24 * 60 * 60 * 1000;
    /** 1h window in ms. */
    const HOUR_MS = 60 * 60 * 1000;
    // --- WebSocket timing ---
    const PING_INTERVAL_MS = 60 * 1000; // ping every 60s
    const PONG_TIMEOUT_MS = 30 * 1000; // expect pong within 30s
    const HEALTH_CHECK_INTERVAL_MS = 15 * 60 * 1000; // forced reconnect check
    const RECONNECT_BASE_DELAY_MS = 5 * 1000; // exponential backoff base
    const MAX_RECONNECT_ATTEMPTS = 5;
    // --- Job execution timing ---
    const JOB_TIMEOUT_MS = 60 * 1000; // hard per-job timeout
    const IFRAME_ACQUIRE_TIMEOUT_MS = 50 * 1000; // wait for a free iframe
    const IFRAME_POOL_MAX = 2; // TV RAM constraint
    const IFRAME_MAX_USES = 50; // recycle after N uses
    const IFRAME_MAX_AGE_MS = 5 * 60 * 1000; // recycle after 5 min
    // --- Capabilities advertised to the matchmaker (v1) ---
    const SUPPORTS_SCREENSHOTS = false;
    // --- Speed test ---
    const SPEED_TEST_CACHE_MS = DAY_MS;
    const SPEED_TEST_FALLBACK_MBPS = 10; // conservative stub when test fails
    /** Persisted storage keys (local only — never sent to the backend). */
    const STORAGE_KEYS = {
        nodeId: "mllwtl_identifier",
        optIn: "mllwtl_opt_in_status",
        publicKey: "mllwtl_public_key",
        dailyCount: "mllwtl_daily_count",
        dailyResetAt: "mllwtl_daily_reset_at",
        hourlyCount: "mllwtl_hourly_count",
        hourlyResetAt: "mllwtl_hourly_reset_at",
        totalRequests: "mllwtl_total_requests",
        dailyHistory: "mllwtl_daily_requests_history",
        lastSpeedTest: "mllwtl_last_speed_test",
        disabled: "mllwtl_disabled"};

    /**
     * Lowercase alphanumeric random string of the given length. Used for the node
     * id's random tail (mllwtl_<publicKey>_<rand10>), matching the live SDK format.
     * Prefers Web Crypto for unbiased randomness; falls back to Math.random.
     */
    function randomString(length) {
        const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
        let out = "";
        const cryptoObj = typeof crypto !== "undefined" ? crypto : undefined;
        if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
            const bytes = new Uint8Array(length);
            cryptoObj.getRandomValues(bytes);
            for (let i = 0; i < length; i++) {
                out += alphabet[bytes[i] % alphabet.length];
            }
            return out;
        }
        for (let i = 0; i < length; i++) {
            out += alphabet[Math.floor(Math.random() * alphabet.length)];
        }
        return out;
    }

    /**
     * Node identity.
     *
     * Format matches the live Mellowtel SDKs exactly:  mllwtl_<publicKey>_<rand10>
     * - stable across app restarts (persisted under STORAGE_KEYS.nodeId)
     * - the publicKey is embedded IN the id; it is never sent as a separate param
     * - if the stored id was minted for a different publicKey, the 10-char random
     *   tail is preserved and only the key segment is swapped (mirrors Electron's
     *   getOrGenerateIdentifier), so a device keeps a stable tail across key changes.
     *
     * This is the `device_id` sent on the WebSocket connect and /approval calls.
     */
    class IdentityHelpers {
        /** Returns the persisted node id, generating + storing one on first call. */
        static getOrCreateNodeId(publicKey) {
            return __awaiter(this, void 0, void 0, function* () {
                if (IdentityHelpers.cached)
                    return IdentityHelpers.cached;
                const existing = yield TizenStorage.get(STORAGE_KEYS.nodeId);
                if (!existing) {
                    return IdentityHelpers.generate(publicKey);
                }
                if (existing.indexOf(`mllwtl_${publicKey}_`) === 0) {
                    IdentityHelpers.cached = existing;
                    return existing;
                }
                if (existing.indexOf("mllwtl_") === 0) {
                    // keep the random tail, swap the key segment
                    const parts = existing.split("_");
                    const tail = parts.length >= 3 ? parts[2] : randomString(10);
                    return IdentityHelpers.generate(publicKey, tail);
                }
                return IdentityHelpers.generate(publicKey);
            });
        }
        /** Returns the node id if one has been created this session, else null. */
        static getCachedNodeId() {
            return IdentityHelpers.cached;
        }
        static generate(publicKey, tail) {
            return __awaiter(this, void 0, void 0, function* () {
                const rand = tail || randomString(10);
                const id = `mllwtl_${publicKey}_${rand}`;
                yield TizenStorage.set(STORAGE_KEYS.nodeId, id);
                IdentityHelpers.cached = id;
                Logger.debug("[Identity] node id:", id);
                return id;
            });
        }
        /** Test/utility hook to clear the in-memory cache. */
        static _resetCache() {
            IdentityHelpers.cached = null;
        }
    }
    IdentityHelpers.cached = null;

    /**
     * Opt-in state. A single persisted tri-state:
     *   undefined => user has not decided yet (default; SDK fully dormant)
     *   true      => opted in
     *   false     => opted out
     *
     * The entire data-sharing pipeline is gated on this being exactly `true`.
     */
    class ConsentManager {
        /** Returns true/false once decided, or undefined if the user hasn't chosen. */
        static getOptInStatus() {
            return __awaiter(this, void 0, void 0, function* () {
                const raw = yield TizenStorage.get(STORAGE_KEYS.optIn);
                if (raw === null)
                    return undefined;
                return raw === "true";
            });
        }
        static isOptedIn() {
            return __awaiter(this, void 0, void 0, function* () {
                return (yield ConsentManager.getOptInStatus()) === true;
            });
        }
        static optIn() {
            return __awaiter(this, void 0, void 0, function* () {
                yield TizenStorage.set(STORAGE_KEYS.optIn, "true");
                Logger.info("[Consent] user opted in");
            });
        }
        static optOut() {
            return __awaiter(this, void 0, void 0, function* () {
                yield TizenStorage.set(STORAGE_KEYS.optIn, "false");
                Logger.info("[Consent] user opted out");
            });
        }
        /** Has the user made any decision yet? */
        static hasDecided() {
            return __awaiter(this, void 0, void 0, function* () {
                return (yield ConsentManager.getOptInStatus()) !== undefined;
            });
        }
    }

    const RETURN_KEYCODES = [10009, 27]; // Tizen BACK / RETURN, plus Esc on emulator
    function showConsentDialog(options = {}) {
        const incentive = options.incentive ||
            "Help support this app by sharing a small amount of your unused internet bandwidth. We never collect personal data, and you can change this anytime.";
        const title = options.title || "Support this app";
        const acceptText = options.acceptText || "Yes, I'll help";
        const declineText = options.declineText || "Not now";
        return new Promise((resolve) => {
            if (typeof document === "undefined" || !document.body) {
                Logger.warn("[ConsentDialog] no DOM available; defaulting to declined");
                resolve(false);
                return;
            }
            const overlay = document.createElement("div");
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.style.cssText = [
                "position:fixed",
                "inset:0",
                "left:0;top:0;right:0;bottom:0",
                "background:rgba(0,0,0,0.75)",
                "display:flex",
                "align-items:center",
                "justify-content:center",
                "z-index:2147483647",
                "font-family:Arial,Helvetica,sans-serif",
            ].join(";");
            const card = document.createElement("div");
            card.style.cssText = [
                "background:#1c1c1e",
                "color:#fff",
                "max-width:60%",
                "padding:48px",
                "border-radius:16px",
                "text-align:center",
                "box-shadow:0 8px 40px rgba(0,0,0,0.6)",
            ].join(";");
            const h = document.createElement("h1");
            h.textContent = title;
            h.style.cssText = "font-size:42px;margin:0 0 24px 0;";
            const p = document.createElement("p");
            p.textContent = incentive;
            p.style.cssText = "font-size:26px;line-height:1.5;margin:0 0 40px 0;color:#d0d0d2;";
            const row = document.createElement("div");
            row.style.cssText = "display:flex;gap:24px;justify-content:center;";
            const buttons = [];
            let focusIndex = 0;
            function makeButton(label, primary) {
                const b = document.createElement("button");
                b.textContent = label;
                b.style.cssText = [
                    "font-size:28px",
                    "padding:18px 40px",
                    "border:3px solid transparent",
                    "border-radius:12px",
                    "cursor:pointer",
                    primary ? "background:#0a84ff;color:#fff" : "background:#3a3a3c;color:#fff",
                    "outline:none",
                    "min-width:220px",
                ].join(";");
                return b;
            }
            const declineBtn = makeButton(declineText, false);
            const acceptBtn = makeButton(acceptText, true);
            buttons.push(declineBtn, acceptBtn);
            focusIndex = 1; // default focus on accept
            function paintFocus() {
                buttons.forEach((b, i) => {
                    b.style.borderColor = i === focusIndex ? "#ffffff" : "transparent";
                    b.style.transform = i === focusIndex ? "scale(1.06)" : "scale(1.0)";
                });
            }
            let settled = false;
            function cleanup() {
                document.removeEventListener("keydown", onKey, true);
                if (overlay.parentNode)
                    overlay.parentNode.removeChild(overlay);
            }
            function finish(result) {
                if (settled)
                    return;
                settled = true;
                cleanup();
                Logger.info("[ConsentDialog] result:", result);
                resolve(result);
            }
            function onKey(e) {
                const code = e.keyCode;
                if (RETURN_KEYCODES.indexOf(code) !== -1) {
                    e.preventDefault();
                    finish(false);
                    return;
                }
                switch (code) {
                    case 37: // LEFT
                        focusIndex = Math.max(0, focusIndex - 1);
                        paintFocus();
                        e.preventDefault();
                        break;
                    case 39: // RIGHT
                        focusIndex = Math.min(buttons.length - 1, focusIndex + 1);
                        paintFocus();
                        e.preventDefault();
                        break;
                    case 13: // ENTER / OK
                        e.preventDefault();
                        finish(focusIndex === 1);
                        break;
                }
            }
            acceptBtn.addEventListener("click", () => finish(true));
            declineBtn.addEventListener("click", () => finish(false));
            row.appendChild(declineBtn);
            row.appendChild(acceptBtn);
            card.appendChild(h);
            card.appendChild(p);
            card.appendChild(row);
            overlay.appendChild(card);
            document.body.appendChild(overlay);
            document.addEventListener("keydown", onKey, true);
            paintFocus();
        });
    }

    class DataRequest {
        constructor(params) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2;
            this.url = params.url;
            this.orgId = (_a = params.orgId) !== null && _a !== void 0 ? _a : "";
            this.recordID = params.recordID;
            this.waitBeforeScraping = (_b = params.waitBeforeScraping) !== null && _b !== void 0 ? _b : 1;
            this.htmlVisualizer = (_c = params.htmlVisualizer) !== null && _c !== void 0 ? _c : false;
            this.windowSize = (_d = params.windowSize) !== null && _d !== void 0 ? _d : { width: 1024, height: 768 };
            this.saveHtml = (_e = params.saveHtml) !== null && _e !== void 0 ? _e : false;
            this.saveMarkdown = (_f = params.saveMarkdown) !== null && _f !== void 0 ? _f : true;
            this.saveText = (_g = params.saveText) !== null && _g !== void 0 ? _g : false;
            this.saveFile = (_h = params.saveFile) !== null && _h !== void 0 ? _h : false;
            this.htmlTransformer = (_j = params.htmlTransformer) !== null && _j !== void 0 ? _j : "none";
            this.removeCSSselectors = (_k = params.removeCSSselectors) !== null && _k !== void 0 ? _k : "default";
            this.classNamesToBeRemoved = (_l = params.classNamesToBeRemoved) !== null && _l !== void 0 ? _l : [];
            this.fullpageScreenshot = (_m = params.fullpageScreenshot) !== null && _m !== void 0 ? _m : false;
            this.removeImages = (_o = params.removeImages) !== null && _o !== void 0 ? _o : false;
            this.fastLane = (_p = params.fastLane) !== null && _p !== void 0 ? _p : true;
            this.actions = (_q = params.actions) !== null && _q !== void 0 ? _q : [];
            this.method = (_r = params.method) !== null && _r !== void 0 ? _r : "GET_NORMAL";
            this.method_endpoint = (_s = params.method_endpoint) !== null && _s !== void 0 ? _s : "";
            this.method_payload = (_t = params.method_payload) !== null && _t !== void 0 ? _t : "no_payload";
            this.method_headers = (_u = params.method_headers) !== null && _u !== void 0 ? _u : "no_headers";
            this.fetchInstead = (_v = params.fetchInstead) !== null && _v !== void 0 ? _v : false;
            this.htmlContained = (_w = params.htmlContained) !== null && _w !== void 0 ? _w : false;
            this.pascoli = (_x = params.pascoli) !== null && _x !== void 0 ? _x : false;
            this.save_html_endpoint = (_y = params.save_html_endpoint) !== null && _y !== void 0 ? _y : REQUEST_ENDPOINT;
            this.connectionID = (_z = params.connectionID) !== null && _z !== void 0 ? _z : "";
            this.cerealObject = (_0 = params.cerealObject) !== null && _0 !== void 0 ? _0 : "{}";
            this.parser_job = (_1 = params.parser_job) !== null && _1 !== void 0 ? _1 : false;
            this.json = (_2 = params.json) !== null && _2 !== void 0 ? _2 : {};
        }
        /** Parse a "1024px" style size token to a number. */
        static parseSize(size) {
            if (typeof size === "number")
                return size;
            if (typeof size !== "string")
                return NaN;
            const n = parseFloat(size);
            return isNaN(n) ? NaN : n;
        }
        static safeJSONParse(value, fallback) {
            if (value === undefined || value === null)
                return fallback;
            if (typeof value !== "string")
                return value;
            try {
                return JSON.parse(value);
            }
            catch (_a) {
                return fallback;
            }
        }
        /** Build a DataRequest from a raw server message object. */
        static fromJson(json) {
            let parsedHeaders = "no_headers";
            if (json.method_headers && json.method_headers !== "no_headers") {
                parsedHeaders = DataRequest.safeJSONParse(json.method_headers, {});
            }
            const w = DataRequest.parseSize(json.screen_width);
            const h = DataRequest.parseSize(json.screen_height);
            const windowSize = !isNaN(w) && !isNaN(h) ? { width: w, height: h } : { width: 1024, height: 768 };
            return new DataRequest({
                url: json.url,
                orgId: json.orgId,
                recordID: json.recordID,
                waitBeforeScraping: json.waitBeforeScraping,
                htmlVisualizer: json.htmlVisualizer,
                windowSize,
                saveHtml: json.saveHtml,
                saveMarkdown: json.saveMarkdown,
                saveText: json.saveText,
                saveFile: json.saveFile,
                htmlTransformer: json.htmlTransformer,
                removeCSSselectors: json.removeCSSselectors,
                classNamesToBeRemoved: DataRequest.safeJSONParse(json.classNamesToBeRemoved, []),
                fullpageScreenshot: json.fullpageScreenshot,
                removeImages: json.removeImages,
                fastLane: json.fastLane,
                actions: DataRequest.safeJSONParse(json.actions, []),
                method: json.method,
                method_endpoint: json.method_endpoint,
                method_payload: json.method_payload,
                method_headers: parsedHeaders,
                fetchInstead: json.fetchInstead,
                htmlContained: json.htmlContained,
                pascoli: json.pascoli,
                save_html_endpoint: json.save_html_endpoint,
                connectionID: json.connectionID,
                cerealObject: json.cerealObject,
                parser_job: json.parser_job,
                json,
            });
        }
    }

    function extend(destination) {
      for (var i = 1; i < arguments.length; i++) {
        var source = arguments[i];
        for (var key in source) {
          if (Object.prototype.hasOwnProperty.call(source, key)) destination[key] = source[key];
        }
      }
      return destination;
    }
    function repeat(character, count) {
      return Array(count + 1).join(character);
    }
    function trimLeadingNewlines(string) {
      return string.replace(/^\n*/, '');
    }
    function trimTrailingNewlines(string) {
      // avoid match-at-end regexp bottleneck, see #370
      var indexEnd = string.length;
      while (indexEnd > 0 && string[indexEnd - 1] === '\n') indexEnd--;
      return string.substring(0, indexEnd);
    }
    function trimNewlines(string) {
      return trimTrailingNewlines(trimLeadingNewlines(string));
    }
    var blockElements = ['ADDRESS', 'ARTICLE', 'ASIDE', 'AUDIO', 'BLOCKQUOTE', 'BODY', 'CANVAS', 'CENTER', 'DD', 'DIR', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'FRAMESET', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'HR', 'HTML', 'ISINDEX', 'LI', 'MAIN', 'MENU', 'NAV', 'NOFRAMES', 'NOSCRIPT', 'OL', 'OUTPUT', 'P', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL'];
    function isBlock(node) {
      return is(node, blockElements);
    }
    var voidElements = ['AREA', 'BASE', 'BR', 'COL', 'COMMAND', 'EMBED', 'HR', 'IMG', 'INPUT', 'KEYGEN', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR'];
    function isVoid(node) {
      return is(node, voidElements);
    }
    function hasVoid(node) {
      return has(node, voidElements);
    }
    var meaningfulWhenBlankElements = ['A', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TH', 'TD', 'IFRAME', 'SCRIPT', 'AUDIO', 'VIDEO'];
    function isMeaningfulWhenBlank(node) {
      return is(node, meaningfulWhenBlankElements);
    }
    function hasMeaningfulWhenBlank(node) {
      return has(node, meaningfulWhenBlankElements);
    }
    function is(node, tagNames) {
      return tagNames.indexOf(node.nodeName) >= 0;
    }
    function has(node, tagNames) {
      return node.getElementsByTagName && tagNames.some(function (tagName) {
        return node.getElementsByTagName(tagName).length;
      });
    }
    var markdownEscapes = [[/\\/g, '\\\\'], [/\*/g, '\\*'], [/^-/g, '\\-'], [/^\+ /g, '\\+ '], [/^(=+)/g, '\\$1'], [/^(#{1,6}) /g, '\\$1 '], [/`/g, '\\`'], [/^~~~/g, '\\~~~'], [/\[/g, '\\['], [/\]/g, '\\]'], [/^>/g, '\\>'], [/_/g, '\\_'], [/^(\d+)\. /g, '$1\\. ']];
    function escapeMarkdown(string) {
      return markdownEscapes.reduce(function (accumulator, escape) {
        return accumulator.replace(escape[0], escape[1]);
      }, string);
    }

    var rules = {};
    rules.paragraph = {
      filter: 'p',
      replacement: function (content) {
        return '\n\n' + content + '\n\n';
      }
    };
    rules.lineBreak = {
      filter: 'br',
      replacement: function (content, node, options) {
        return options.br + '\n';
      }
    };
    rules.heading = {
      filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      replacement: function (content, node, options) {
        var hLevel = Number(node.nodeName.charAt(1));
        if (options.headingStyle === 'setext' && hLevel < 3) {
          var underline = repeat(hLevel === 1 ? '=' : '-', content.length);
          return '\n\n' + content + '\n' + underline + '\n\n';
        } else {
          return '\n\n' + repeat('#', hLevel) + ' ' + content + '\n\n';
        }
      }
    };
    rules.blockquote = {
      filter: 'blockquote',
      replacement: function (content) {
        content = trimNewlines(content).replace(/^/gm, '> ');
        return '\n\n' + content + '\n\n';
      }
    };
    rules.list = {
      filter: ['ul', 'ol'],
      replacement: function (content, node) {
        var parent = node.parentNode;
        if (parent.nodeName === 'LI' && parent.lastElementChild === node) {
          return '\n' + content;
        } else {
          return '\n\n' + content + '\n\n';
        }
      }
    };
    rules.listItem = {
      filter: 'li',
      replacement: function (content, node, options) {
        var prefix = options.bulletListMarker + '   ';
        var parent = node.parentNode;
        if (parent.nodeName === 'OL') {
          var start = parent.getAttribute('start');
          var index = Array.prototype.indexOf.call(parent.children, node);
          prefix = (start ? Number(start) + index : index + 1) + '.  ';
        }
        var isParagraph = /\n$/.test(content);
        content = trimNewlines(content) + (isParagraph ? '\n' : '');
        content = content.replace(/\n/gm, '\n' + ' '.repeat(prefix.length)); // indent
        return prefix + content + (node.nextSibling ? '\n' : '');
      }
    };
    rules.indentedCodeBlock = {
      filter: function (node, options) {
        return options.codeBlockStyle === 'indented' && node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
      },
      replacement: function (content, node, options) {
        return '\n\n    ' + node.firstChild.textContent.replace(/\n/g, '\n    ') + '\n\n';
      }
    };
    rules.fencedCodeBlock = {
      filter: function (node, options) {
        return options.codeBlockStyle === 'fenced' && node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
      },
      replacement: function (content, node, options) {
        var className = node.firstChild.getAttribute('class') || '';
        var language = (className.match(/language-(\S+)/) || [null, ''])[1];
        var code = node.firstChild.textContent;
        var fenceChar = options.fence.charAt(0);
        var fenceSize = 3;
        var fenceInCodeRegex = new RegExp('^' + fenceChar + '{3,}', 'gm');
        var match;
        while (match = fenceInCodeRegex.exec(code)) {
          if (match[0].length >= fenceSize) {
            fenceSize = match[0].length + 1;
          }
        }
        var fence = repeat(fenceChar, fenceSize);
        return '\n\n' + fence + language + '\n' + code.replace(/\n$/, '') + '\n' + fence + '\n\n';
      }
    };
    rules.horizontalRule = {
      filter: 'hr',
      replacement: function (content, node, options) {
        return '\n\n' + options.hr + '\n\n';
      }
    };
    rules.inlineLink = {
      filter: function (node, options) {
        return options.linkStyle === 'inlined' && node.nodeName === 'A' && node.getAttribute('href');
      },
      replacement: function (content, node) {
        var href = escapeLinkDestination(node.getAttribute('href'));
        var title = escapeLinkTitle(cleanAttribute(node.getAttribute('title')));
        var titlePart = title ? ' "' + title + '"' : '';
        return '[' + content + '](' + href + titlePart + ')';
      }
    };
    rules.referenceLink = {
      filter: function (node, options) {
        return options.linkStyle === 'referenced' && node.nodeName === 'A' && node.getAttribute('href');
      },
      replacement: function (content, node, options) {
        var href = escapeLinkDestination(node.getAttribute('href'));
        var title = cleanAttribute(node.getAttribute('title'));
        if (title) title = ' "' + escapeLinkTitle(title) + '"';
        var replacement;
        var reference;
        switch (options.linkReferenceStyle) {
          case 'collapsed':
            replacement = '[' + content + '][]';
            reference = '[' + content + ']: ' + href + title;
            break;
          case 'shortcut':
            replacement = '[' + content + ']';
            reference = '[' + content + ']: ' + href + title;
            break;
          default:
            var id = this.references.length + 1;
            replacement = '[' + content + '][' + id + ']';
            reference = '[' + id + ']: ' + href + title;
        }
        this.references.push(reference);
        return replacement;
      },
      references: [],
      append: function (options) {
        var references = '';
        if (this.references.length) {
          references = '\n\n' + this.references.join('\n') + '\n\n';
          this.references = []; // Reset references
        }
        return references;
      }
    };
    rules.emphasis = {
      filter: ['em', 'i'],
      replacement: function (content, node, options) {
        if (!content.trim()) return '';
        return options.emDelimiter + content + options.emDelimiter;
      }
    };
    rules.strong = {
      filter: ['strong', 'b'],
      replacement: function (content, node, options) {
        if (!content.trim()) return '';
        return options.strongDelimiter + content + options.strongDelimiter;
      }
    };
    rules.code = {
      filter: function (node) {
        var hasSiblings = node.previousSibling || node.nextSibling;
        var isCodeBlock = node.parentNode.nodeName === 'PRE' && !hasSiblings;
        return node.nodeName === 'CODE' && !isCodeBlock;
      },
      replacement: function (content) {
        if (!content) return '';
        content = content.replace(/\r?\n|\r/g, ' ');
        var extraSpace = /^`|^ .*?[^ ].* $|`$/.test(content) ? ' ' : '';
        var delimiter = '`';
        var matches = content.match(/`+/gm) || [];
        while (matches.indexOf(delimiter) !== -1) delimiter = delimiter + '`';
        return delimiter + extraSpace + content + extraSpace + delimiter;
      }
    };
    rules.image = {
      filter: 'img',
      replacement: function (content, node) {
        var alt = escapeMarkdown(cleanAttribute(node.getAttribute('alt')));
        var src = escapeLinkDestination(node.getAttribute('src') || '');
        var title = cleanAttribute(node.getAttribute('title'));
        var titlePart = title ? ' "' + escapeLinkTitle(title) + '"' : '';
        return src ? '![' + alt + ']' + '(' + src + titlePart + ')' : '';
      }
    };
    function cleanAttribute(attribute) {
      return attribute ? attribute.replace(/(\n+\s*)+/g, '\n') : '';
    }
    function escapeLinkDestination(destination) {
      var escaped = destination.replace(/([<>()])/g, '\\$1');
      return escaped.indexOf(' ') >= 0 ? '<' + escaped + '>' : escaped;
    }
    function escapeLinkTitle(title) {
      return title.replace(/"/g, '\\"');
    }

    /**
     * Manages a collection of rules used to convert HTML to Markdown
     */

    function Rules(options) {
      this.options = options;
      this._keep = [];
      this._remove = [];
      this.blankRule = {
        replacement: options.blankReplacement
      };
      this.keepReplacement = options.keepReplacement;
      this.defaultRule = {
        replacement: options.defaultReplacement
      };
      this.array = [];
      for (var key in options.rules) this.array.push(options.rules[key]);
    }
    Rules.prototype = {
      add: function (key, rule) {
        this.array.unshift(rule);
      },
      keep: function (filter) {
        this._keep.unshift({
          filter: filter,
          replacement: this.keepReplacement
        });
      },
      remove: function (filter) {
        this._remove.unshift({
          filter: filter,
          replacement: function () {
            return '';
          }
        });
      },
      forNode: function (node) {
        if (node.isBlank) return this.blankRule;
        var rule;
        if (rule = findRule(this.array, node, this.options)) return rule;
        if (rule = findRule(this._keep, node, this.options)) return rule;
        if (rule = findRule(this._remove, node, this.options)) return rule;
        return this.defaultRule;
      },
      forEach: function (fn) {
        for (var i = 0; i < this.array.length; i++) fn(this.array[i], i);
      }
    };
    function findRule(rules, node, options) {
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i];
        if (filterValue(rule, node, options)) return rule;
      }
      return undefined;
    }
    function filterValue(rule, node, options) {
      var filter = rule.filter;
      if (typeof filter === 'string') {
        if (filter === node.nodeName.toLowerCase()) return true;
      } else if (Array.isArray(filter)) {
        if (filter.indexOf(node.nodeName.toLowerCase()) > -1) return true;
      } else if (typeof filter === 'function') {
        if (filter.call(rule, node, options)) return true;
      } else {
        throw new TypeError('`filter` needs to be a string, array, or function');
      }
    }

    /**
     * The collapseWhitespace function is adapted from collapse-whitespace
     * by Luc Thevenard.
     *
     * The MIT License (MIT)
     *
     * Copyright (c) 2014 Luc Thevenard <lucthevenard@gmail.com>
     *
     * Permission is hereby granted, free of charge, to any person obtaining a copy
     * of this software and associated documentation files (the "Software"), to deal
     * in the Software without restriction, including without limitation the rights
     * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
     * copies of the Software, and to permit persons to whom the Software is
     * furnished to do so, subject to the following conditions:
     *
     * The above copyright notice and this permission notice shall be included in
     * all copies or substantial portions of the Software.
     *
     * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
     * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
     * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
     * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
     * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
     * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
     * THE SOFTWARE.
     */

    /**
     * collapseWhitespace(options) removes extraneous whitespace from an the given element.
     *
     * @param {Object} options
     */
    function collapseWhitespace(options) {
      var element = options.element;
      var isBlock = options.isBlock;
      var isVoid = options.isVoid;
      var isPre = options.isPre || function (node) {
        return node.nodeName === 'PRE';
      };
      if (!element.firstChild || isPre(element)) return;
      var prevText = null;
      var keepLeadingWs = false;
      var prev = null;
      var node = next(prev, element, isPre);
      while (node !== element) {
        if (node.nodeType === 3 || node.nodeType === 4) {
          // Node.TEXT_NODE or Node.CDATA_SECTION_NODE
          var text = node.data.replace(/[ \r\n\t]+/g, ' ');
          if ((!prevText || / $/.test(prevText.data)) && !keepLeadingWs && text[0] === ' ') {
            text = text.substr(1);
          }

          // `text` might be empty at this point.
          if (!text) {
            node = remove(node);
            continue;
          }
          node.data = text;
          prevText = node;
        } else if (node.nodeType === 1) {
          // Node.ELEMENT_NODE
          if (isBlock(node) || node.nodeName === 'BR') {
            if (prevText) {
              prevText.data = prevText.data.replace(/ $/, '');
            }
            prevText = null;
            keepLeadingWs = false;
          } else if (isVoid(node) || isPre(node)) {
            // Avoid trimming space around non-block, non-BR void elements and inline PRE.
            prevText = null;
            keepLeadingWs = true;
          } else if (prevText) {
            // Drop protection if set previously.
            keepLeadingWs = false;
          }
        } else {
          node = remove(node);
          continue;
        }
        var nextNode = next(prev, node, isPre);
        prev = node;
        node = nextNode;
      }
      if (prevText) {
        prevText.data = prevText.data.replace(/ $/, '');
        if (!prevText.data) {
          remove(prevText);
        }
      }
    }

    /**
     * remove(node) removes the given node from the DOM and returns the
     * next node in the sequence.
     *
     * @param {Node} node
     * @return {Node} node
     */
    function remove(node) {
      var next = node.nextSibling || node.parentNode;
      node.parentNode.removeChild(node);
      return next;
    }

    /**
     * next(prev, current, isPre) returns the next node in the sequence, given the
     * current and previous nodes.
     *
     * @param {Node} prev
     * @param {Node} current
     * @param {Function} isPre
     * @return {Node}
     */
    function next(prev, current, isPre) {
      if (prev && prev.parentNode === current || isPre(current)) {
        return current.nextSibling || current.parentNode;
      }
      return current.firstChild || current.nextSibling || current.parentNode;
    }

    /*
     * Set up window for Node.js
     */

    var root = typeof window !== 'undefined' ? window : {};

    /*
     * Parsing HTML strings
     */

    function canParseHTMLNatively() {
      var Parser = root.DOMParser;
      var canParse = false;

      // Adapted from https://gist.github.com/1129031
      // Firefox/Opera/IE throw errors on unsupported types
      try {
        // WebKit returns null on unsupported types
        if (new Parser().parseFromString('', 'text/html')) {
          canParse = true;
        }
      } catch (e) {}
      return canParse;
    }
    function createHTMLParser() {
      var Parser = function () {};
      {
        if (shouldUseActiveX()) {
          Parser.prototype.parseFromString = function (string) {
            var doc = new window.ActiveXObject('htmlfile');
            doc.designMode = 'on'; // disable on-page scripts
            doc.open();
            doc.write(string);
            doc.close();
            return doc;
          };
        } else {
          Parser.prototype.parseFromString = function (string) {
            var doc = document.implementation.createHTMLDocument('');
            doc.open();
            doc.write(string);
            doc.close();
            return doc;
          };
        }
      }
      return Parser;
    }
    function shouldUseActiveX() {
      var useActiveX = false;
      try {
        document.implementation.createHTMLDocument('').open();
      } catch (e) {
        if (root.ActiveXObject) useActiveX = true;
      }
      return useActiveX;
    }
    var HTMLParser = canParseHTMLNatively() ? root.DOMParser : createHTMLParser();

    function RootNode(input, options) {
      var root;
      if (typeof input === 'string') {
        var doc = htmlParser().parseFromString(
        // DOM parsers arrange elements in the <head> and <body>.
        // Wrapping in a custom element ensures elements are reliably arranged in
        // a single element.
        '<x-turndown id="turndown-root">' + input + '</x-turndown>', 'text/html');
        root = doc.getElementById('turndown-root');
      } else {
        root = input.cloneNode(true);
      }
      collapseWhitespace({
        element: root,
        isBlock: isBlock,
        isVoid: isVoid,
        isPre: options.preformattedCode ? isPreOrCode : null
      });
      return root;
    }
    var _htmlParser;
    function htmlParser() {
      _htmlParser = _htmlParser || new HTMLParser();
      return _htmlParser;
    }
    function isPreOrCode(node) {
      return node.nodeName === 'PRE' || node.nodeName === 'CODE';
    }

    function Node(node, options) {
      node.isBlock = isBlock(node);
      node.isCode = node.nodeName === 'CODE' || node.parentNode.isCode;
      node.isBlank = isBlank(node);
      node.flankingWhitespace = flankingWhitespace(node, options);
      return node;
    }
    function isBlank(node) {
      return !isVoid(node) && !isMeaningfulWhenBlank(node) && /^\s*$/i.test(node.textContent) && !hasVoid(node) && !hasMeaningfulWhenBlank(node);
    }
    function flankingWhitespace(node, options) {
      if (node.isBlock || options.preformattedCode && node.isCode) {
        return {
          leading: '',
          trailing: ''
        };
      }
      var edges = edgeWhitespace(node.textContent);

      // abandon leading ASCII WS if left-flanked by ASCII WS
      if (edges.leadingAscii && isFlankedByWhitespace('left', node, options)) {
        edges.leading = edges.leadingNonAscii;
      }

      // abandon trailing ASCII WS if right-flanked by ASCII WS
      if (edges.trailingAscii && isFlankedByWhitespace('right', node, options)) {
        edges.trailing = edges.trailingNonAscii;
      }
      return {
        leading: edges.leading,
        trailing: edges.trailing
      };
    }
    function edgeWhitespace(string) {
      var m = string.match(/^(([ \t\r\n]*)(\s*))(?:(?=\S)[\s\S]*\S)?((\s*?)([ \t\r\n]*))$/);
      return {
        leading: m[1],
        // whole string for whitespace-only strings
        leadingAscii: m[2],
        leadingNonAscii: m[3],
        trailing: m[4],
        // empty for whitespace-only strings
        trailingNonAscii: m[5],
        trailingAscii: m[6]
      };
    }
    function isFlankedByWhitespace(side, node, options) {
      var sibling;
      var regExp;
      var isFlanked;
      if (side === 'left') {
        sibling = node.previousSibling;
        regExp = / $/;
      } else {
        sibling = node.nextSibling;
        regExp = /^ /;
      }
      if (sibling) {
        if (sibling.nodeType === 3) {
          isFlanked = regExp.test(sibling.nodeValue);
        } else if (options.preformattedCode && sibling.nodeName === 'CODE') {
          isFlanked = false;
        } else if (sibling.nodeType === 1 && !isBlock(sibling)) {
          isFlanked = regExp.test(sibling.textContent);
        }
      }
      return isFlanked;
    }

    var reduce = Array.prototype.reduce;
    function TurndownService(options) {
      if (!(this instanceof TurndownService)) return new TurndownService(options);
      var defaults = {
        rules: rules,
        headingStyle: 'setext',
        hr: '* * *',
        bulletListMarker: '*',
        codeBlockStyle: 'indented',
        fence: '```',
        emDelimiter: '_',
        strongDelimiter: '**',
        linkStyle: 'inlined',
        linkReferenceStyle: 'full',
        br: '  ',
        preformattedCode: false,
        blankReplacement: function (content, node) {
          return node.isBlock ? '\n\n' : '';
        },
        keepReplacement: function (content, node) {
          return node.isBlock ? '\n\n' + node.outerHTML + '\n\n' : node.outerHTML;
        },
        defaultReplacement: function (content, node) {
          return node.isBlock ? '\n\n' + content + '\n\n' : content;
        }
      };
      this.options = extend({}, defaults, options);
      this.rules = new Rules(this.options);
    }
    TurndownService.prototype = {
      /**
       * The entry point for converting a string or DOM node to Markdown
       * @public
       * @param {String|HTMLElement} input The string or DOM node to convert
       * @returns A Markdown representation of the input
       * @type String
       */

      turndown: function (input) {
        if (!canConvert(input)) {
          throw new TypeError(input + ' is not a string, or an element/document/fragment node.');
        }
        if (input === '') return '';
        var output = process.call(this, new RootNode(input, this.options));
        return postProcess.call(this, output);
      },
      /**
       * Add one or more plugins
       * @public
       * @param {Function|Array} plugin The plugin or array of plugins to add
       * @returns The Turndown instance for chaining
       * @type Object
       */

      use: function (plugin) {
        if (Array.isArray(plugin)) {
          for (var i = 0; i < plugin.length; i++) this.use(plugin[i]);
        } else if (typeof plugin === 'function') {
          plugin(this);
        } else {
          throw new TypeError('plugin must be a Function or an Array of Functions');
        }
        return this;
      },
      /**
       * Adds a rule
       * @public
       * @param {String} key The unique key of the rule
       * @param {Object} rule The rule
       * @returns The Turndown instance for chaining
       * @type Object
       */

      addRule: function (key, rule) {
        this.rules.add(key, rule);
        return this;
      },
      /**
       * Keep a node (as HTML) that matches the filter
       * @public
       * @param {String|Array|Function} filter The unique key of the rule
       * @returns The Turndown instance for chaining
       * @type Object
       */

      keep: function (filter) {
        this.rules.keep(filter);
        return this;
      },
      /**
       * Remove a node that matches the filter
       * @public
       * @param {String|Array|Function} filter The unique key of the rule
       * @returns The Turndown instance for chaining
       * @type Object
       */

      remove: function (filter) {
        this.rules.remove(filter);
        return this;
      },
      /**
       * Escapes Markdown syntax
       * @public
       * @param {String} string The string to escape
       * @returns A string with Markdown syntax escaped
       * @type String
       */

      escape: function (string) {
        return escapeMarkdown(string);
      }
    };

    /**
     * Reduces a DOM node down to its Markdown string equivalent
     * @private
     * @param {HTMLElement} parentNode The node to convert
     * @returns A Markdown representation of the node
     * @type String
     */

    function process(parentNode) {
      var self = this;
      return reduce.call(parentNode.childNodes, function (output, node) {
        node = new Node(node, self.options);
        var replacement = '';
        if (node.nodeType === 3) {
          replacement = node.isCode ? node.nodeValue : self.escape(node.nodeValue);
        } else if (node.nodeType === 1) {
          replacement = replacementForNode.call(self, node);
        }
        return join(output, replacement);
      }, '');
    }

    /**
     * Appends strings as each rule requires and trims the output
     * @private
     * @param {String} output The conversion output
     * @returns A trimmed version of the ouput
     * @type String
     */

    function postProcess(output) {
      var self = this;
      this.rules.forEach(function (rule) {
        if (typeof rule.append === 'function') {
          output = join(output, rule.append(self.options));
        }
      });
      return output.replace(/^[\t\r\n]+/, '').replace(/[\t\r\n\s]+$/, '');
    }

    /**
     * Converts an element node to its Markdown equivalent
     * @private
     * @param {HTMLElement} node The node to convert
     * @returns A Markdown representation of the node
     * @type String
     */

    function replacementForNode(node) {
      var rule = this.rules.forNode(node);
      var content = process.call(this, node);
      var whitespace = node.flankingWhitespace;
      if (whitespace.leading || whitespace.trailing) content = content.trim();
      return whitespace.leading + rule.replacement(content, node, this.options) + whitespace.trailing;
    }

    /**
     * Joins replacement to the current output with appropriate number of new lines
     * @private
     * @param {String} output The current conversion output
     * @param {String} replacement The string to append to the output
     * @returns Joined output
     * @type String
     */

    function join(output, replacement) {
      var s1 = trimTrailingNewlines(output);
      var s2 = trimLeadingNewlines(replacement);
      var nls = Math.max(output.length - s1.length, replacement.length - s2.length);
      var separator = '\n\n'.substring(0, nls);
      return s1 + separator + s2;
    }

    /**
     * Determines whether an input can be converted
     * @private
     * @param {String|HTMLElement} input Describe this parameter
     * @returns Describe what it returns
     * @type String|Object|Array|Boolean|Number
     */

    function canConvert(input) {
      return input != null && (typeof input === 'string' || input.nodeType && (input.nodeType === 1 || input.nodeType === 9 || input.nodeType === 11));
    }

    /**
     * HTML cleanup + Markdown conversion, shared by both render strategies.
     *
     * Operates on a Document (from DOMParser for Option A, or a live iframe document
     * for Option C). Strips noise, applies job-specified selector removal, then
     * serializes and converts to Markdown via Turndown — same Turndown settings as
     * the Electron SDK (atx headings, fenced code, `*` bullets).
     */
    const DEFAULT_REMOVE_SELECTORS = [
        "script",
        "style",
        "noscript",
        "svg",
        "nav",
        "footer",
        '[role="alert"]',
        '[role="banner"]',
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[role="region"][aria-label*="skip" i]',
        '[aria-modal="true"]',
    ];
    // Always strip these, even when the job supplies a custom selector list.
    const ALWAYS_REMOVE = ["script", "style", "noscript"];
    class HtmlProcessor {
        static buildTurndown() {
            return new TurndownService({
                headingStyle: "atx",
                codeBlockStyle: "fenced",
                bulletListMarker: "*",
            });
        }
        static removeSelectors(doc, selectors) {
            selectors.forEach((sel) => {
                try {
                    const els = doc.querySelectorAll(sel);
                    for (let i = 0; i < els.length; i++) {
                        const el = els[i];
                        if (el && el.parentNode)
                            el.parentNode.removeChild(el);
                    }
                }
                catch (e) {
                    Logger.debug("[HtmlProcessor] bad selector skipped:", sel, e);
                }
            });
        }
        static removeImages(doc) {
            HtmlProcessor.removeSelectors(doc, ["img", "picture", "source"]);
        }
        static removeClassNames(doc, classNames) {
            const sels = classNames
                .filter((c) => !!c)
                .map((c) => "." + c.replace(/^\./, ""));
            if (sels.length)
                HtmlProcessor.removeSelectors(doc, sels);
        }
        /**
         * Apply the job's cleanup rules to a Document and return HTML + Markdown.
         * The Document is mutated in place.
         */
        static process(doc, req) {
            // Always strip executable/style noise.
            HtmlProcessor.removeSelectors(doc, ALWAYS_REMOVE);
            // removeCSSselectors: "default" | "none" | JSON array string
            const sel = req.removeCSSselectors;
            if (sel === "default") {
                HtmlProcessor.removeSelectors(doc, DEFAULT_REMOVE_SELECTORS);
            }
            else if (sel && sel !== "none" && sel !== "") {
                try {
                    const parsed = JSON.parse(sel);
                    if (Array.isArray(parsed) && parsed.length) {
                        HtmlProcessor.removeSelectors(doc, parsed);
                    }
                }
                catch (e) {
                    Logger.debug("[HtmlProcessor] removeCSSselectors parse failed:", e);
                }
            }
            if (req.classNamesToBeRemoved && req.classNamesToBeRemoved.length) {
                HtmlProcessor.removeClassNames(doc, req.classNamesToBeRemoved);
            }
            if (req.removeImages) {
                HtmlProcessor.removeImages(doc);
            }
            const root = doc.documentElement;
            const html = root ? root.outerHTML : "";
            let markdown = "";
            if (req.saveMarkdown && html) {
                try {
                    markdown = HtmlProcessor.buildTurndown().turndown(html);
                }
                catch (e) {
                    Logger.error("[HtmlProcessor] turndown failed:", e);
                    markdown = "";
                }
            }
            return { html, markdown };
        }
        /** Parse an HTML string into a Document (Option A entry point). */
        static parse(htmlString) {
            return new DOMParser().parseFromString(htmlString, "text/html");
        }
    }

    /**
     * Option A renderer (primary path).
     *
     * Plain `fetch` → `DOMParser` → HtmlProcessor. No JS execution. Used for
     * parser_job, method_endpoint direct requests, and static/SSR pages. Tizen's
     * `http://tizen.org/privilege/internet` privilege relaxes CORS for packaged
     * apps, so cross-origin fetch returns the real body.
     */
    class ParserJob {
        static run(req) {
            return __awaiter(this, void 0, void 0, function* () {
                const target = req.method_endpoint && req.method_endpoint.length
                    ? req.method_endpoint
                    : req.url;
                const init = {
                    method: ParserJob.httpMethod(req),
                    redirect: "follow",
                };
                if (req.method_headers && req.method_headers !== "no_headers") {
                    init.headers = req.method_headers;
                }
                if (req.method_payload && req.method_payload !== "no_payload") {
                    init.body = req.method_payload;
                }
                let statusCode = 0;
                let finalUrl = req.url;
                let html = "";
                let unreachable = false;
                try {
                    const res = yield fetch(target, init);
                    statusCode = res.status;
                    finalUrl = res.url || req.url;
                    html = yield res.text();
                }
                catch (e) {
                    Logger.error("[ParserJob] fetch failed for", target, e);
                    unreachable = true;
                    return { html: "", markdown: "", finalUrl, statusCode, websiteUnreachable: true };
                }
                // parser_job returns raw content; cereal/JSON handling happens upstream.
                if (req.parser_job) {
                    return { html, markdown: "", finalUrl, statusCode, websiteUnreachable: false };
                }
                const doc = HtmlProcessor.parse(html);
                const processed = HtmlProcessor.process(doc, req);
                return {
                    html: processed.html,
                    markdown: processed.markdown,
                    finalUrl,
                    statusCode,
                    websiteUnreachable: unreachable,
                };
            });
        }
        static httpMethod(req) {
            // The wire uses tokens like GET_NORMAL/POST; normalize to real HTTP verbs.
            const m = (req.method || "GET").toUpperCase();
            if (m.indexOf("POST") !== -1)
                return "POST";
            if (m.indexOf("PUT") !== -1)
                return "PUT";
            if (m.indexOf("DELETE") !== -1)
                return "DELETE";
            return "GET";
        }
    }

    class IframePool {
        constructor() {
            this.frames = [];
        }
        static getInstance() {
            if (!IframePool.instance)
                IframePool.instance = new IframePool();
            return IframePool.instance;
        }
        createFrame() {
            const el = document.createElement("iframe");
            // Same-origin sandbox so we can read contentDocument; scripts allowed so the
            // page's JS runs. No allow-top-navigation / allow-popups / allow-modals.
            el.setAttribute("sandbox", "allow-same-origin allow-scripts");
            el.setAttribute("aria-hidden", "true");
            el.style.cssText = [
                "position:fixed",
                "left:-10000px",
                "top:-10000px",
                "width:1024px",
                "height:768px",
                "border:0",
                "visibility:hidden",
                "pointer-events:none",
            ].join(";");
            document.body.appendChild(el);
            const pf = { el, inUse: false, createdAt: Date.now(), uses: 0 };
            this.frames.push(pf);
            Logger.debug("[IframePool] created frame, pool size:", this.frames.length);
            return pf;
        }
        shouldRotate(pf) {
            return (pf.uses >= IFRAME_MAX_USES || Date.now() - pf.createdAt >= IFRAME_MAX_AGE_MS);
        }
        rotate(pf) {
            Logger.debug("[IframePool] rotating frame (uses:", pf.uses, ")");
            this.destroy(pf);
            return this.createFrame();
        }
        destroy(pf) {
            try {
                if (pf.el.parentNode)
                    pf.el.parentNode.removeChild(pf.el);
            }
            catch (e) {
                Logger.debug("[IframePool] destroy error:", e);
            }
            const idx = this.frames.indexOf(pf);
            if (idx !== -1)
                this.frames.splice(idx, 1);
        }
        /** Acquire a free frame, waiting up to 50s. Throws on timeout. */
        acquire() {
            return __awaiter(this, void 0, void 0, function* () {
                if (typeof document === "undefined" || !document.body) {
                    throw new Error("[IframePool] no DOM available");
                }
                const start = Date.now();
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    let pf = this.frames.find((f) => !f.inUse);
                    if (!pf && this.frames.length < IFRAME_POOL_MAX) {
                        pf = this.createFrame();
                    }
                    if (pf) {
                        if (this.shouldRotate(pf))
                            pf = this.rotate(pf);
                        pf.inUse = true;
                        pf.uses++;
                        return pf.el;
                    }
                    if (Date.now() - start > IFRAME_ACQUIRE_TIMEOUT_MS) {
                        throw new Error("[IframePool] acquire timed out (no free frame in 50s)");
                    }
                    yield new Promise((r) => setTimeout(r, 100));
                }
            });
        }
        /** Release a frame back to the pool, clearing its content first. */
        release(el) {
            const pf = this.frames.find((f) => f.el === el);
            if (!pf)
                return;
            this.clearFrame(pf);
            pf.inUse = false;
        }
        clearFrame(pf) {
            try {
                // Reset to blank so the previous page's timers/DOM are released.
                pf.el.removeAttribute("srcdoc");
                pf.el.src = "about:blank";
            }
            catch (e) {
                Logger.debug("[IframePool] clear error:", e);
            }
        }
        /** Tear down all frames (used on stop/opt-out). */
        shutdown() {
            this.frames.slice().forEach((pf) => this.destroy(pf));
            this.frames = [];
        }
        /** Test/diagnostic hook. */
        size() {
            return this.frames.length;
        }
    }
    IframePool.instance = null;

    /**
     * Option C renderer (secondary path, for JS-rendered pages).
     *
     * We fetch the HTML ourselves (bypasses CORS via the internet privilege), then
     * load it into a SAME-ORIGIN hidden iframe via `srcdoc` so scripts execute and
     * we retain full DOM read access — the Tizen analogue of Electron's
     * processHtmlContent. Cross-origin `src=` framing is avoided because the TV
     * runtime can't strip X-Frame-Options/CSP and cross-origin DOM is unreadable.
     *
     * The whole render is raced against a 60s timeout.
     */
    class IframeRenderer {
        static run(req) {
            return __awaiter(this, void 0, void 0, function* () {
                const pool = IframePool.getInstance();
                const frame = yield pool.acquire();
                const work = IframeRenderer.render(frame, req);
                const timeout = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error("[IframeRenderer] job timed out (60s)")), JOB_TIMEOUT_MS);
                });
                try {
                    return yield Promise.race([work, timeout]);
                }
                finally {
                    pool.release(frame);
                }
            });
        }
        static render(frame, req) {
            return __awaiter(this, void 0, void 0, function* () {
                let statusCode = 0;
                let finalUrl = req.url;
                let html = "";
                try {
                    const res = yield fetch(req.url, { redirect: "follow" });
                    statusCode = res.status;
                    finalUrl = res.url || req.url;
                    html = yield res.text();
                }
                catch (e) {
                    Logger.error("[IframeRenderer] fetch failed:", e);
                    return { html: "", markdown: "", finalUrl, statusCode, websiteUnreachable: true };
                }
                // Size the frame to the requested viewport.
                if (req.windowSize) {
                    frame.style.width = (req.windowSize.width || 1024) + "px";
                    frame.style.height = (req.windowSize.height || 768) + "px";
                }
                yield IframeRenderer.loadSrcdoc(frame, html);
                // Let the page's JS settle.
                const waitMs = Math.max(0, (req.waitBeforeScraping || 0) * 1000);
                if (waitMs)
                    yield IframeRenderer.delay(waitMs);
                const doc = frame.contentDocument;
                if (!doc) {
                    // Same-origin read blocked unexpectedly — fall back to the fetched HTML.
                    Logger.warn("[IframeRenderer] contentDocument unreadable; using raw HTML");
                    const parsed = HtmlProcessor.parse(html);
                    const p = HtmlProcessor.process(parsed, req);
                    return { html: p.html, markdown: p.markdown, finalUrl, statusCode, websiteUnreachable: false };
                }
                // Run interaction actions in order, best-effort.
                if (req.actions && req.actions.length) {
                    for (const action of req.actions) {
                        try {
                            yield IframeRenderer.runAction(doc, action);
                        }
                        catch (e) {
                            Logger.debug("[IframeRenderer] action failed:", action, e);
                        }
                    }
                }
                const processed = HtmlProcessor.process(doc, req);
                return {
                    html: processed.html,
                    markdown: processed.markdown,
                    finalUrl,
                    statusCode,
                    websiteUnreachable: false,
                };
            });
        }
        static loadSrcdoc(frame, html) {
            return new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done)
                        return;
                    done = true;
                    frame.removeEventListener("load", finish);
                    resolve();
                };
                frame.addEventListener("load", finish);
                // Safety: resolve even if 'load' never fires.
                setTimeout(finish, 15000);
                try {
                    frame.srcdoc = html;
                }
                catch (e) {
                    Logger.error("[IframeRenderer] srcdoc set failed:", e);
                    finish();
                }
            });
        }
        static delay(ms) {
            return new Promise((r) => setTimeout(r, ms));
        }
        static runAction(doc, action) {
            return __awaiter(this, void 0, void 0, function* () {
                switch (action.type) {
                    case "wait":
                        yield IframeRenderer.delay(action.milliseconds || 0);
                        break;
                    case "click": {
                        const el = doc.querySelector(action.selector);
                        if (el)
                            el.click();
                        break;
                    }
                    case "fill_input":
                    case "fill_textarea":
                    case "select": {
                        const el = doc.querySelector(action.selector);
                        if (el)
                            el.value = action.value;
                        break;
                    }
                    case "scroll": {
                        const win = doc.defaultView;
                        if (win) {
                            const amt = action.amount || 0;
                            win.scrollBy({
                                top: action.direction === "up" ? -amt : amt,
                                left: action.direction === "left"
                                    ? -amt
                                    : action.direction === "right"
                                        ? amt
                                        : 0,
                            });
                        }
                        break;
                    }
                    default:
                        Logger.debug("[IframeRenderer] unknown action:", action.type);
                }
            });
        }
    }

    /**
     * Ships a finished job back to Mellowtel.
     *
     * Text results: POST the full body to `save_html_endpoint` (default
     * https://request.mellow.tel/) — body shape matches the Electron SDK's
     * saveCrawl (recordID, content, markDown, node_identifier, orgId, save flags,
     * cereal_result, batch info, final_url, statusCode). The backend learns the job
     * is done by polling its DynamoDB scrape_<recordID> row; there is NO WebSocket
     * completion message in the live protocol.
     *
     * Binary results (files): request a presigned S3 URL, PUT the bytes. (Screenshots
     * are disabled in v1, so the binary path is only used for saveFile jobs.)
     */
    class ResultUploader {
        /** POST a text/markdown result. Returns true on success. */
        static uploadText(req, nodeId, result, options) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c;
                const endpoint = req.save_html_endpoint || REQUEST_ENDPOINT;
                const batchExecution = (_a = options === null || options === void 0 ? void 0 : options.batchExecution) !== null && _a !== void 0 ? _a : false;
                const batchId = (_b = options === null || options === void 0 ? void 0 : options.batchId) !== null && _b !== void 0 ? _b : "";
                const cerealResult = (_c = options === null || options === void 0 ? void 0 : options.cerealResult) !== null && _c !== void 0 ? _c : {};
                const body = {
                    recordID: req.recordID,
                    fastLane: req.fastLane,
                    url: req.url,
                    htmlTransformer: req.htmlTransformer,
                    orgId: req.orgId,
                    saveText: req.saveText,
                    node_identifier: nodeId,
                    BATCH_execution: batchExecution,
                    batch_id: batchId,
                    final_url: result.finalUrl || req.url,
                    website_unreachable: result.websiteUnreachable,
                    statusCode: result.statusCode,
                    requestMessageInfo: req.json,
                    saveHtml: req.saveHtml,
                    saveMarkdown: req.saveMarkdown,
                    cereal_result: JSON.stringify({ data: cerealResult, success: true }),
                    file_name_bytes: "",
                };
                if (req.parser_job) {
                    body.json = JSON.stringify(cerealResult);
                }
                else {
                    if (req.saveHtml)
                        body.content = result.html;
                    if (req.saveMarkdown)
                        body.markDown = result.markdown;
                }
                try {
                    const res = yield fetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "text/plain" },
                        body: JSON.stringify(body),
                    });
                    if (!res.ok) {
                        const txt = yield res.text().catch(() => "");
                        throw new Error(`saveCrawl HTTP ${res.status} ${txt}`);
                    }
                    Logger.info("[Upload] result delivered for", req.recordID);
                    return true;
                }
                catch (e) {
                    Logger.error("[Upload] failed for", req.recordID, e);
                    return false;
                }
            });
        }
        /** Request a presigned S3 URL for binary content. */
        static getSignedUrl(recordID, contentType) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const res = yield fetch(GENERATE_UPLOAD_URL_ENDPOINT, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ record_id: recordID, content_type: contentType }),
                    });
                    if (!res.ok)
                        throw new Error(`generate-upload-url HTTP ${res.status}`);
                    const data = yield res.json();
                    return { uploadUrl: data.uploadUrl, fileName: data.fileName };
                }
                catch (e) {
                    Logger.error("[Upload] getSignedUrl failed:", e);
                    return null;
                }
            });
        }
        /** PUT bytes to a presigned S3 URL. */
        static uploadBinary(uploadUrl, contentType, bytes) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    const res = yield fetch(uploadUrl, {
                        method: "PUT",
                        headers: { "Content-Type": contentType, "x-amz-acl": "public-read" },
                        body: (bytes instanceof Uint8Array
                            ? bytes
                            : new Uint8Array(bytes)),
                    });
                    if (!res.ok)
                        throw new Error(`S3 PUT HTTP ${res.status}`);
                    return true;
                }
                catch (e) {
                    Logger.error("[Upload] uploadBinary failed:", e);
                    return false;
                }
            });
        }
    }

    /**
     * Daily + hourly job gate.
     *
     * Mirrors the Electron SDK's daily counter and adds an hourly cap with burst
     * headroom (MAX_DAILY_RATE / 24 * 1.5). Both windows auto-reset once elapsed.
     *
     * canExecute() is a read-only check (no increment) used before connecting and
     * before accepting a job. incrementCount() is called AFTER a job succeeds, so a
     * job that fails to render does not consume quota.
     */
    class RateLimiter {
        static readWindow(countKey, resetKey, windowMs) {
            return __awaiter(this, void 0, void 0, function* () {
                const now = Date.now();
                const countRaw = yield TizenStorage.get(countKey);
                const resetRaw = yield TizenStorage.get(resetKey);
                const count = countRaw ? parseInt(countRaw, 10) || 0 : 0;
                const resetAt = resetRaw ? parseInt(resetRaw, 10) || 0 : 0;
                const expired = resetAt === 0 || now - resetAt >= windowMs;
                return { count, resetAt, expired };
            });
        }
        /** True if BOTH the daily and hourly windows have remaining quota. */
        static canExecute() {
            return __awaiter(this, void 0, void 0, function* () {
                const daily = yield RateLimiter.readWindow(STORAGE_KEYS.dailyCount, STORAGE_KEYS.dailyResetAt, DAY_MS);
                const hourly = yield RateLimiter.readWindow(STORAGE_KEYS.hourlyCount, STORAGE_KEYS.hourlyResetAt, HOUR_MS);
                const dailyOk = daily.expired || daily.count < MAX_DAILY_RATE;
                const hourlyOk = hourly.expired || hourly.count < MAX_HOURLY_RATE;
                if (!dailyOk)
                    Logger.warn("[RateLimiter] daily limit reached");
                if (!hourlyOk)
                    Logger.warn("[RateLimiter] hourly limit reached");
                return dailyOk && hourlyOk;
            });
        }
        /** Records one executed job, resetting either window if it has elapsed. */
        static incrementCount() {
            return __awaiter(this, void 0, void 0, function* () {
                const now = Date.now();
                const daily = yield RateLimiter.readWindow(STORAGE_KEYS.dailyCount, STORAGE_KEYS.dailyResetAt, DAY_MS);
                if (daily.expired) {
                    yield TizenStorage.set(STORAGE_KEYS.dailyCount, "1");
                    yield TizenStorage.set(STORAGE_KEYS.dailyResetAt, String(now));
                }
                else {
                    yield TizenStorage.set(STORAGE_KEYS.dailyCount, String(daily.count + 1));
                }
                const hourly = yield RateLimiter.readWindow(STORAGE_KEYS.hourlyCount, STORAGE_KEYS.hourlyResetAt, HOUR_MS);
                if (hourly.expired) {
                    yield TizenStorage.set(STORAGE_KEYS.hourlyCount, "1");
                    yield TizenStorage.set(STORAGE_KEYS.hourlyResetAt, String(now));
                }
                else {
                    yield TizenStorage.set(STORAGE_KEYS.hourlyCount, String(hourly.count + 1));
                }
            });
        }
        /** Current counts (for diagnostics/stats). */
        static getCounts() {
            return __awaiter(this, void 0, void 0, function* () {
                const daily = yield RateLimiter.readWindow(STORAGE_KEYS.dailyCount, STORAGE_KEYS.dailyResetAt, DAY_MS);
                const hourly = yield RateLimiter.readWindow(STORAGE_KEYS.hourlyCount, STORAGE_KEYS.hourlyResetAt, HOUR_MS);
                return {
                    daily: daily.expired ? 0 : daily.count,
                    hourly: hourly.expired ? 0 : hourly.count,
                };
            });
        }
    }

    /**
     * Cumulative stats counter (never resets), separate from the rate limiter.
     * Mirrors the Electron SDK: a running total plus a { "YYYY-MM-DD": count } map.
     */
    function today() {
        return new Date().toISOString().split("T")[0];
    }
    class RequestCounter {
        /** Increment total + today's bucket after a successful job. */
        static increment() {
            return __awaiter(this, void 0, void 0, function* () {
                const totalRaw = yield TizenStorage.get(STORAGE_KEYS.totalRequests);
                const total = totalRaw ? parseInt(totalRaw, 10) || 0 : 0;
                yield TizenStorage.set(STORAGE_KEYS.totalRequests, String(total + 1));
                const history = (yield TizenStorage.getJSON(STORAGE_KEYS.dailyHistory)) || {};
                const d = today();
                history[d] = (history[d] || 0) + 1;
                yield TizenStorage.setJSON(STORAGE_KEYS.dailyHistory, history);
            });
        }
        static getTotal() {
            return __awaiter(this, void 0, void 0, function* () {
                const raw = yield TizenStorage.get(STORAGE_KEYS.totalRequests);
                return raw ? parseInt(raw, 10) || 0 : 0;
            });
        }
        static getDailyHistory() {
            return __awaiter(this, void 0, void 0, function* () {
                return ((yield TizenStorage.getJSON(STORAGE_KEYS.dailyHistory)) || {});
            });
        }
        static getToday() {
            return __awaiter(this, void 0, void 0, function* () {
                const history = yield RequestCounter.getDailyHistory();
                return history[today()] || 0;
            });
        }
        static getStats() {
            return __awaiter(this, void 0, void 0, function* () {
                return {
                    total: yield RequestCounter.getTotal(),
                    daily: yield RequestCounter.getToday(),
                    dailyHistory: yield RequestCounter.getDailyHistory(),
                };
            });
        }
    }

    /**
     * Orchestrates one job: rate-check → pick render strategy → render → upload →
     * count. Screenshots are unsupported in v1, so htmlVisualizer jobs are skipped
     * (the matchmaker shouldn't route them given screenshots=false, but we guard
     * anyway).
     */
    class JobExecutor {
        constructor(nodeId) {
            this.nodeId = nodeId;
        }
        /** Chooses Option A vs Option C. */
        static needsJsRendering(req) {
            // parser/direct-fetch jobs never need rendering.
            if (req.parser_job || (req.method_endpoint && req.method_endpoint.length)) {
                return false;
            }
            if (req.fetchInstead)
                return false; // explicit no-JS
            // Default to the JS-capable path for normal page scrapes; ParserJob is used
            // for explicitly static/fetch jobs above.
            return true;
        }
        /** Execute and deliver a job. Returns true if a result was uploaded. */
        execute(req_1) {
            return __awaiter(this, arguments, void 0, function* (req, options = {}) {
                if (!req.url || !req.recordID) {
                    Logger.warn("[JobExecutor] missing url/recordID, dropping");
                    return false;
                }
                if (req.htmlVisualizer || req.fullpageScreenshot) {
                    Logger.warn("[JobExecutor] screenshot job received but unsupported in v1; dropping", req.recordID);
                    return false;
                }
                if (!(yield RateLimiter.canExecute())) {
                    Logger.warn("[JobExecutor] rate limited, dropping", req.recordID);
                    return false;
                }
                let result;
                try {
                    result = JobExecutor.needsJsRendering(req)
                        ? yield IframeRenderer.run(req)
                        : yield ParserJob.run(req);
                }
                catch (e) {
                    Logger.error("[JobExecutor] render failed for", req.recordID, e);
                    // Report the failure so the backend's poll can resolve (unreachable).
                    result = {
                        html: "",
                        markdown: "",
                        finalUrl: req.url,
                        statusCode: 0,
                        websiteUnreachable: true,
                    };
                }
                const uploaded = yield ResultUploader.uploadText(req, this.nodeId, result, {
                    batchExecution: options.batchExecution,
                    batchId: options.batchId,
                });
                if (uploaded && !result.websiteUnreachable) {
                    yield RateLimiter.incrementCount();
                    yield RequestCounter.increment();
                }
                return uploaded;
            });
        }
    }

    /**
     * Routes incoming server messages.
     *
     * Mirrors the Electron handler: ignores control frames with no `url`, supports
     * `type_event === 'batch'`, runs single jobs immediately, and drops failures
     * without crashing the socket. There is NO WebSocket completion message in the
     * live protocol — results go back via the result endpoint, so the handler does
     * not send job_complete.
     *
     * `logOnly` mode (Milestone 3) records jobs without executing them.
     */
    class MessageHandler {
        constructor(nodeId, logOnly = false, onDisconnectDevice) {
            this.logOnly = logOnly;
            this.onDisconnectDevice = onDisconnectDevice;
            this.executor = new JobExecutor(nodeId);
        }
        setLogOnly(v) {
            this.logOnly = v;
        }
        handle(raw) {
            return __awaiter(this, void 0, void 0, function* () {
                let json;
                try {
                    json = JSON.parse(raw);
                }
                catch (e) {
                    Logger.debug("[MessageHandler] non-JSON message ignored:", e);
                    return;
                }
                if (json.type_event === "batch") {
                    yield this.handleBatch(json);
                    return;
                }
                // Server command to take this node offline (kill switch over the socket).
                if (json.type_event === "disconnect_device") {
                    Logger.warn("[MessageHandler] disconnect_device command");
                    if (this.onDisconnectDevice)
                        this.onDisconnectDevice();
                    return;
                }
                // Other control frames (heartbeat, refresh_cereal) have no url.
                if (!json.url) {
                    Logger.debug("[MessageHandler] control frame:", json.type_event || "(none)");
                    return;
                }
                const req = DataRequest.fromJson(json);
                Logger.info("[MessageHandler] job:", req.recordID, req.url);
                if (this.logOnly) {
                    Logger.info("[MessageHandler] logOnly mode — not executing");
                    return;
                }
                if (!(yield RateLimiter.canExecute())) {
                    Logger.warn("[MessageHandler] rate limited, dropping", req.recordID);
                    return;
                }
                this.executor.execute(req).catch((e) => {
                    Logger.error("[MessageHandler] job error for", req.recordID, e);
                });
            });
        }
        handleBatch(json) {
            return __awaiter(this, void 0, void 0, function* () {
                let requests = [];
                try {
                    requests = JSON.parse(json.batch_array);
                }
                catch (e) {
                    Logger.error("[MessageHandler] bad batch_array:", e);
                    return;
                }
                const parallel = json.parallel_executions_batch || 1;
                const delay = json.delay_between_executions || 0;
                const batchId = json.batch_id || "";
                Logger.info("[MessageHandler] batch:", requests.length, "jobs");
                if (this.logOnly)
                    return;
                for (let i = 0; i < requests.length; i += parallel) {
                    const chunk = requests.slice(i, i + parallel);
                    yield Promise.all(chunk.map((rd) => {
                        const req = DataRequest.fromJson(rd);
                        return this.executor
                            .execute(req, { batchExecution: true, batchId })
                            .catch((e) => Logger.error("[MessageHandler] batch job failed:", req.recordID, e));
                    }));
                    if (i + parallel < requests.length && delay > 0) {
                        yield new Promise((r) => setTimeout(r, delay));
                    }
                }
            });
        }
    }

    class WebSocketClient {
        constructor() {
            this.ws = null;
            this.params = null;
            this.handler = null;
            this.reconnectGate = null;
            this.isConnecting = false;
            this.voluntaryDisconnect = false;
            this.reconnectAttempts = 0;
            this.pingTimer = null;
            this.pongTimer = null;
            this.healthTimer = null;
            this.logOnly = false;
        }
        static getInstance() {
            if (!WebSocketClient.instance)
                WebSocketClient.instance = new WebSocketClient();
            return WebSocketClient.instance;
        }
        /** Milestone 3: connect but only log inbound jobs (no execution). */
        setLogOnly(v) {
            this.logOnly = v;
            if (this.handler)
                this.handler.setLogOnly(v);
        }
        isConnected() {
            return !!this.ws && this.ws.readyState === WebSocket.OPEN;
        }
        /** Open the connection. Idempotent. */
        connect(params, options) {
            this.params = params;
            if (options && options.reconnectGate) {
                this.reconnectGate = options.reconnectGate;
            }
            if (this.ws) {
                Logger.debug("[WS] already connected/connecting");
                return true;
            }
            if (this.isConnecting)
                return false;
            this.voluntaryDisconnect = false;
            this.isConnecting = true;
            const url = WebSocketClient.buildUrl(params);
            Logger.info("[WS] connecting:", url);
            try {
                // A disconnect_device command from the server stops the node cleanly.
                this.handler = new MessageHandler(params.nodeId, this.logOnly, () => {
                    Logger.warn("[WS] disconnect_device received — stopping node");
                    this.disconnect();
                });
                this.ws = new WebSocket(url);
                this.attachListeners();
                return true;
            }
            catch (e) {
                Logger.error("[WS] construct failed:", e);
                this.isConnecting = false;
                this.scheduleReconnect();
                return false;
            }
        }
        static buildUrl(p) {
            const q = new URLSearchParams({
                device_id: p.nodeId,
                version: VERSION,
                platform: PLATFORM,
                speed_download: String(p.speedDownload),
                screenshots: String(SUPPORTS_SCREENSHOTS),
                manifest_version: "tizen",
                ws_client: "new_ws",
            });
            return `${WS_URL}?${q.toString()}`;
        }
        attachListeners() {
            if (!this.ws)
                return;
            this.ws.onopen = () => {
                Logger.info("[WS] connection established");
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.startPing();
                this.startHealthCheck();
            };
            this.ws.onmessage = (ev) => {
                // Any inbound traffic proves the socket is alive.
                this.clearPongTimer();
                const data = typeof ev.data === "string" ? ev.data : "";
                if (!data)
                    return;
                // Swallow app-level pong frames.
                if (data === "pong" || data.indexOf('"type":"pong"') !== -1)
                    return;
                if (this.handler) {
                    this.handler.handle(data).catch((e) => Logger.error("[WS] handler error:", e));
                }
            };
            this.ws.onerror = (e) => {
                Logger.error("[WS] socket error:", e);
            };
            this.ws.onclose = () => {
                Logger.info("[WS] connection closed");
                this.resetSocket();
                if (!this.voluntaryDisconnect)
                    this.scheduleReconnect();
            };
        }
        // --- liveness ---
        startPing() {
            this.stopPing();
            this.pingTimer = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    try {
                        this.ws.send(JSON.stringify({ type: "ping" }));
                    }
                    catch (e) {
                        Logger.debug("[WS] ping send failed:", e);
                    }
                    this.startPongTimer();
                }
            }, PING_INTERVAL_MS);
        }
        stopPing() {
            if (this.pingTimer)
                clearInterval(this.pingTimer);
            this.pingTimer = null;
            this.clearPongTimer();
        }
        startPongTimer() {
            this.clearPongTimer();
            this.pongTimer = setTimeout(() => {
                Logger.warn("[WS] pong timeout — closing socket");
                if (this.ws) {
                    try {
                        this.ws.close();
                    }
                    catch (_a) {
                        /* noop */
                    }
                }
            }, PONG_TIMEOUT_MS);
        }
        clearPongTimer() {
            if (this.pongTimer)
                clearTimeout(this.pongTimer);
            this.pongTimer = null;
        }
        startHealthCheck() {
            this.stopHealthCheck();
            this.healthTimer = setInterval(() => {
                if (this.voluntaryDisconnect)
                    return;
                if (!this.isConnected()) {
                    Logger.warn("[WS] health check: socket down, reconnecting");
                    this.reconnectAttempts = 0;
                    if (this.params)
                        this.connect(this.params);
                }
            }, HEALTH_CHECK_INTERVAL_MS);
        }
        stopHealthCheck() {
            if (this.healthTimer)
                clearInterval(this.healthTimer);
            this.healthTimer = null;
        }
        // --- reconnect ---
        scheduleReconnect() {
            if (this.voluntaryDisconnect)
                return;
            if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                Logger.warn("[WS] max reconnect attempts reached; giving up");
                return;
            }
            this.reconnectAttempts++;
            const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);
            Logger.info(`[WS] reconnect ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
            setTimeout(() => {
                void this.tryReconnect();
            }, delay);
        }
        tryReconnect() {
            return __awaiter(this, void 0, void 0, function* () {
                if (this.voluntaryDisconnect || !this.params || this.ws)
                    return;
                // Re-evaluate the gate (approval / disabled) before reconnecting so a
                // backend-disabled node stops looping instead of hammering the server.
                if (this.reconnectGate) {
                    let allowed = false;
                    try {
                        allowed = yield this.reconnectGate();
                    }
                    catch (e) {
                        Logger.error("[WS] reconnect gate threw; stopping:", e);
                        allowed = false;
                    }
                    if (!allowed) {
                        Logger.warn("[WS] reconnect gate denied; halting reconnect loop");
                        this.voluntaryDisconnect = true;
                        this.stopHealthCheck();
                        return;
                    }
                }
                this.connect(this.params);
            });
        }
        resetSocket() {
            this.stopPing();
            this.isConnecting = false;
            this.ws = null;
        }
        /** Voluntarily close (opt-out/stop). Suppresses auto-reconnect. */
        disconnect() {
            Logger.info("[WS] voluntary disconnect");
            this.voluntaryDisconnect = true;
            this.reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
            this.stopPing();
            this.stopHealthCheck();
            if (this.ws) {
                try {
                    this.ws.close();
                }
                catch (_a) {
                    /* noop */
                }
                this.ws = null;
            }
        }
    }
    WebSocketClient.instance = null;

    /**
     * Bandwidth measurement. Downloads a known-size file, times it, computes Mbps.
     * Result cached 24h. Falls back to a conservative stub on any failure so the
     * node still advertises a (modest) speed rather than blocking.
     *
     * The download URL is a Cloudflare speed-test endpoint that serves arbitrary
     * byte counts; swap for a Mellowtel-hosted asset if the backend prefers one.
     */
    const DEFAULT_BYTES = 1000000; // 1 MB
    const SPEED_TEST_URL = `https://speed.cloudflare.com/__down?bytes=${DEFAULT_BYTES}`;
    class SpeedTest {
        /** Returns Mbps, using a cached value when fresh (<24h). */
        static measure() {
            return __awaiter(this, void 0, void 0, function* () {
                const cached = yield TizenStorage.getJSON(STORAGE_KEYS.lastSpeedTest);
                const now = Date.now();
                if (cached && now - cached.timestamp < SPEED_TEST_CACHE_MS) {
                    Logger.debug("[SpeedTest] cached:", cached.mbps, "Mbps");
                    return cached.mbps;
                }
                let mbps = SPEED_TEST_FALLBACK_MBPS;
                try {
                    const start = Date.now();
                    const res = yield fetch(SPEED_TEST_URL, { cache: "no-store" });
                    const buf = yield res.arrayBuffer();
                    const elapsedSec = (Date.now() - start) / 1000;
                    const bytes = buf.byteLength || DEFAULT_BYTES;
                    if (elapsedSec > 0) {
                        mbps = Math.round(((bytes * 8) / elapsedSec / 1000000) * 100) / 100;
                    }
                    Logger.info("[SpeedTest] measured:", mbps, "Mbps");
                }
                catch (e) {
                    Logger.error("[SpeedTest] failed, using fallback:", e);
                    mbps = SPEED_TEST_FALLBACK_MBPS;
                }
                yield TizenStorage.setJSON(STORAGE_KEYS.lastSpeedTest, {
                    timestamp: now,
                    mbps,
                });
                return mbps;
            });
        }
    }

    /**
     * Public SDK facade for Samsung Tizen TV Web apps.
     *
     * Lifecycle:
     *   const m = new Mellowtel('PUBLIC_KEY');
     *   await m.initBackground();              // identity + config, no network
     *   if (await m.showConsentDialog()) {     // OFF by default
     *     await m.start();                     // gates → connect → receive jobs
     *   }
     *   ...
     *   await m.stop();                        // disconnect, stay opted-in
     *
     * The facade is intentionally thin; all real work lives in the modules it wires.
     */
    class Mellowtel {
        constructor(publicKey, options = {}) {
            this.nodeId = "";
            this.initialized = false;
            this.started = false;
            this.ws = WebSocketClient.getInstance();
            if (!publicKey)
                throw new Error("[Mellowtel] publicKey is required");
            this.publicKey = publicKey;
            Logger.configure(options.disableLogs !== false, options.logLevel);
        }
        /** Resolve identity + persist config. No network, no consent prompt. */
        initBackground() {
            return __awaiter(this, void 0, void 0, function* () {
                if (this.initialized)
                    return;
                this.nodeId = yield IdentityHelpers.getOrCreateNodeId(this.publicKey);
                yield TizenStorage.set(STORAGE_KEYS.publicKey, this.publicKey);
                this.initialized = true;
                Logger.info("[Mellowtel] initialized, node:", this.nodeId);
                // If the user previously opted in, auto-start on launch.
                if (yield ConsentManager.isOptedIn()) {
                    yield this.start();
                }
            });
        }
        /**
         * Begin operating: opt-in gate → approval (kill switch) → connect.
         * No-op (with a warning) if the user is not opted in.
         */
        start() {
            return __awaiter(this, void 0, void 0, function* () {
                if (!this.initialized)
                    yield this.initBackground();
                if (this.started && this.ws.isConnected())
                    return true;
                if (!(yield ConsentManager.isOptedIn())) {
                    Logger.warn("[Mellowtel] start() ignored — user not opted in");
                    return false;
                }
                // Remote kill switch can disable an integration without a new build.
                if (yield this.isDisabled()) {
                    Logger.warn("[Mellowtel] integration disabled locally; not starting");
                    return false;
                }
                const speed = yield SpeedTest.measure();
                // Remote kill-switch gate (skipped when SKIP_APPROVAL is set).
                {
                    Logger.info("[Mellowtel] approval check skipped (SKIP_APPROVAL)");
                }
                const ok = this.ws.connect({
                    nodeId: this.nodeId,
                    publicKey: this.publicKey,
                    speedDownload: speed,
                }, {
                    // Re-checked before every reconnect: stop looping if the user opted out,
                    // the integration was disabled locally, or /approval now denies the node.
                    reconnectGate: () => __awaiter(this, void 0, void 0, function* () {
                        if (!(yield ConsentManager.isOptedIn()))
                            return false;
                        if (yield this.isDisabled())
                            return false;
                        return true;
                    }),
                });
                this.started = ok;
                return ok;
            });
        }
        /** Stop operating (disconnect) without changing opt-in state. */
        stop() {
            return __awaiter(this, void 0, void 0, function* () {
                this.ws.disconnect();
                IframePool.getInstance().shutdown();
                this.started = false;
                Logger.info("[Mellowtel] stopped");
            });
        }
        // --- consent ---
        /** Show the TV consent modal; persists + returns the user's choice. */
        showConsentDialog(options) {
            return __awaiter(this, void 0, void 0, function* () {
                // Only prompt if the user hasn't already decided.
                if (yield ConsentManager.hasDecided()) {
                    return (yield ConsentManager.getOptInStatus()) === true;
                }
                const accepted = yield showConsentDialog(options);
                if (accepted) {
                    yield this.optIn();
                }
                else {
                    yield ConsentManager.optOut();
                }
                return accepted;
            });
        }
        optIn() {
            return __awaiter(this, void 0, void 0, function* () {
                yield ConsentManager.optIn();
                if (this.initialized)
                    yield this.start();
            });
        }
        optOut() {
            return __awaiter(this, void 0, void 0, function* () {
                yield ConsentManager.optOut();
                yield this.stop();
            });
        }
        getOptInStatus() {
            return __awaiter(this, void 0, void 0, function* () {
                return ConsentManager.getOptInStatus();
            });
        }
        // --- info / stats ---
        getNodeId() {
            return this.nodeId;
        }
        getStats() {
            return __awaiter(this, void 0, void 0, function* () {
                return RequestCounter.getStats();
            });
        }
        isDisabled() {
            return __awaiter(this, void 0, void 0, function* () {
                return (yield TizenStorage.get(STORAGE_KEYS.disabled)) === "true";
            });
        }
    }

    // UMD entry: exposes the Mellowtel class as the global `Mellowtel` for
    // <script> users. ESM/type consumers use src/index.ts instead.

    return Mellowtel;

}));
//# sourceMappingURL=mellowtel-tizen.umd.js.map
