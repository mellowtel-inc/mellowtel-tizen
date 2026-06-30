/** Shared TypeScript types for the Mellowtel Tizen SDK. */

/** Logging verbosity. */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

/** Options passed to the Mellowtel constructor. */
export interface MellowtelOptions {
  /** Disable all logging (production default true). */
  disableLogs?: boolean;
  /** Explicit log level; overrides disableLogs when set. */
  logLevel?: LogLevel;
}

/** A single interaction step run against a rendered page (Option C). */
export interface Action {
  type: string;
  [key: string]: any;
}

/** Outcome of executing one job. */
export interface JobResult {
  /** Final serialized HTML (post-processing), if requested. */
  html: string;
  /** Markdown conversion of the HTML, if requested. */
  markdown: string;
  /** Final URL after redirects. */
  finalUrl: string;
  /** HTTP status of the fetched page (best-effort). */
  statusCode: number;
  /** True when the target could not be reached. */
  websiteUnreachable: boolean;
}

/** Local stats surfaced via Mellowtel.getStats(). */
export interface Stats {
  total: number;
  daily: number;
  dailyHistory: { [date: string]: number };
}
