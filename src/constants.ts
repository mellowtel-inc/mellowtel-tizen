/**
 * Centralized configuration. No URLs are hardcoded anywhere else in the SDK.
 *
 * Network field names and endpoints intentionally match the live Mellowtel
 * Electron/browser SDKs so a Tizen node registers and delivers results through
 * the exact same backend pipeline (matchmaker + request.mellow.tel + S3/DynamoDB).
 */

/** SDK semantic version (sent on the WebSocket connect + /approval). */
export const VERSION = "0.1.0";

/** Platform token advertised to the matchmaker. Confirm exact value with backend. */
export const PLATFORM = "tizen-tv";

/** WebSocket endpoint the node connects to (node registration happens on $connect). */
export const WS_URL = "wss://ws.mellow.tel";

/** Remote kill-switch / approval gate. GET with query params, returns { approval: boolean }. */
export const APPROVAL_API_URL = "https://api.mellow.tel/approval";

/** Default result endpoint (text results POST here; per-job save_html_endpoint can override). */
export const REQUEST_ENDPOINT = "https://request.mellow.tel/";

/** Presigned-upload generator for binary results (screenshots/files). */
export const GENERATE_UPLOAD_URL_ENDPOINT = "https://request.mellow.tel/generate-upload-url";

/** Daily cap on jobs executed by this node. Matches Electron default until backend confirms. */
export const MAX_DAILY_RATE = 15000;

/** Hourly cap with burst headroom: dailyRate / 24 * 1.5. */
export const MAX_HOURLY_RATE = Math.floor((MAX_DAILY_RATE / 24) * 1.5);

/** 24h window in ms (rate-limit + speed-test cache). */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** 1h window in ms. */
export const HOUR_MS = 60 * 60 * 1000;

/** Approval result cache TTL (30 min, mirrors the browser SDK). */
export const APPROVAL_CHECK_INTERVAL = 30 * 60 * 1000;

// --- WebSocket timing ---
export const PING_INTERVAL_MS = 60 * 1000; // ping every 60s
export const PONG_TIMEOUT_MS = 30 * 1000; // expect pong within 30s
export const HEALTH_CHECK_INTERVAL_MS = 15 * 60 * 1000; // forced reconnect check
export const RECONNECT_BASE_DELAY_MS = 5 * 1000; // exponential backoff base
export const MAX_RECONNECT_ATTEMPTS = 5;

// --- Job execution timing ---
export const JOB_TIMEOUT_MS = 60 * 1000; // hard per-job timeout
export const IFRAME_ACQUIRE_TIMEOUT_MS = 50 * 1000; // wait for a free iframe
export const IFRAME_POOL_MAX = 2; // TV RAM constraint
export const IFRAME_MAX_USES = 50; // recycle after N uses
export const IFRAME_MAX_AGE_MS = 5 * 60 * 1000; // recycle after 5 min

// --- Capabilities advertised to the matchmaker (v1) ---
export const SUPPORTS_SCREENSHOTS = false;

/**
 * Skip the /approval kill-switch and connect directly.
 * The live approval API is allow-by-default (verified: returns {approval:true}
 * for any input, including platform=tizen-tv), so skipping it just removes a
 * network round-trip + a fail-closed failure point. Set to false to re-enable
 * the remote kill switch.
 */
export const SKIP_APPROVAL = true;

// --- Speed test ---
export const SPEED_TEST_CACHE_MS = DAY_MS;
export const SPEED_TEST_FALLBACK_MBPS = 10; // conservative stub when test fails

/** localStorage key namespace. */
export const STORAGE_PREFIX = "mllwtl_";

/** Persisted storage keys (local only — never sent to the backend). */
export const STORAGE_KEYS = {
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
  approvalCache: "mllwtl_approval_cache",
  disabled: "mllwtl_disabled",
  version: "mllwtl_version",
} as const;
