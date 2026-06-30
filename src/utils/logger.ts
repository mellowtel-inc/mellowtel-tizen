import { LogLevel } from "../types";

const LEVEL_WEIGHT: { [k in LogLevel]: number } = {
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
export class Logger {
  private static level: LogLevel = "silent";
  private static prefix = "[mellowtel-tizen]";

  static setLevel(level: LogLevel): void {
    Logger.level = level;
  }

  /** Convenience used by the facade: disableLogs=true => silent, else debug. */
  static configure(disableLogs: boolean, explicit?: LogLevel): void {
    if (explicit) {
      Logger.level = explicit;
    } else {
      Logger.level = disableLogs ? "silent" : "debug";
    }
  }

  private static enabled(level: LogLevel): boolean {
    return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[Logger.level];
  }

  static debug(...args: any[]): void {
    if (Logger.enabled("debug")) console.log(Logger.prefix, ...args);
  }

  static log(...args: any[]): void {
    Logger.debug(...args);
  }

  static info(...args: any[]): void {
    if (Logger.enabled("info")) console.info(Logger.prefix, ...args);
  }

  static warn(...args: any[]): void {
    if (Logger.enabled("warn")) console.warn(Logger.prefix, ...args);
  }

  static error(...args: any[]): void {
    if (Logger.enabled("error")) console.error(Logger.prefix, ...args);
  }
}
