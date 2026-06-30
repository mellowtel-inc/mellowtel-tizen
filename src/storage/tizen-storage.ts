import { Logger } from "../utils/logger";

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

// Minimal shape of the Tizen filesystem API we rely on (avoids a hard dep on
// @types/tizen which isn't published for the web profile).
interface TizenFile {
  resolve(path: string): TizenFile;
  createDirectory(path: string): TizenFile;
  deleteFile(path: string, onSuccess?: () => void, onError?: (e: any) => void): void;
  openStream(
    mode: string,
    onSuccess: (stream: TizenFileStream) => void,
    onError: (e: any) => void,
    encoding?: string
  ): void;
  listFiles?(onSuccess: (files: TizenFile[]) => void, onError?: (e: any) => void): void;
  fullPath?: string;
}
interface TizenFileStream {
  write(data: string): void;
  read(count: number): string;
  bytesAvailable: number;
  close(): void;
}
interface TizenFilesystem {
  resolve(
    location: string,
    onSuccess: (dir: TizenFile) => void,
    onError: (e: any) => void,
    mode?: string
  ): void;
}
declare const tizen: { filesystem?: TizenFilesystem } | undefined;

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

function hasTizenFs(): boolean {
  return (
    typeof tizen !== "undefined" &&
    !!tizen &&
    typeof tizen.filesystem !== "undefined"
  );
}

function byteLength(s: string): number {
  // Cheap UTF-8 byte estimate without TextEncoder (older WebKit).
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

export class TizenStorage {
  /** Read a string value. Resolves a filesystem marker transparently. */
  static async get(key: string): Promise<string | null> {
    if (!hasLocalStorage()) return null;
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch (e) {
      Logger.error("[TizenStorage] localStorage.getItem failed:", e);
      return null;
    }
    if (raw === null) return null;
    if (raw.indexOf(FS_MARKER_PREFIX) === 0) {
      const fileName = raw.slice(FS_MARKER_PREFIX.length);
      return TizenStorage.readFile(fileName);
    }
    return raw;
  }

  /** Write a string value, offloading large payloads to the filesystem. */
  static async set(key: string, value: string): Promise<void> {
    if (!hasLocalStorage()) return;

    if (byteLength(value) >= LARGE_VALUE_BYTES && hasTizenFs()) {
      const fileName = TizenStorage.fileNameForKey(key);
      try {
        await TizenStorage.writeFile(fileName, value);
        localStorage.setItem(key, FS_MARKER_PREFIX + fileName);
        return;
      } catch (e) {
        Logger.error("[TizenStorage] filesystem write failed, falling back:", e);
        // fall through to localStorage attempt
      }
    }

    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Quota exceeded — try the filesystem as a last resort.
      Logger.error("[TizenStorage] localStorage.setItem failed:", e);
      if (hasTizenFs()) {
        const fileName = TizenStorage.fileNameForKey(key);
        try {
          await TizenStorage.writeFile(fileName, value);
          localStorage.setItem(key, FS_MARKER_PREFIX + fileName);
        } catch (e2) {
          Logger.error("[TizenStorage] filesystem fallback also failed:", e2);
        }
      }
    }
  }

  /** Remove a value (and any backing file). */
  static async remove(key: string): Promise<void> {
    if (!hasLocalStorage()) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw && raw.indexOf(FS_MARKER_PREFIX) === 0) {
        await TizenStorage.deleteFile(raw.slice(FS_MARKER_PREFIX.length));
      }
      localStorage.removeItem(key);
    } catch (e) {
      Logger.error("[TizenStorage] remove failed:", e);
    }
  }

  // --- JSON convenience helpers ---

  static async getJSON<T>(key: string): Promise<T | null> {
    const raw = await TizenStorage.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  static async setJSON(key: string, value: unknown): Promise<void> {
    await TizenStorage.set(key, JSON.stringify(value));
  }

  // --- filesystem internals ---

  private static fileNameForKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, "_") + ".dat";
  }

  private static resolveDir(): Promise<TizenFile> {
    return new Promise((resolve, reject) => {
      if (!hasTizenFs() || !tizen || !tizen.filesystem) {
        reject(new Error("tizen.filesystem unavailable"));
        return;
      }
      tizen.filesystem.resolve(
        FS_DIR,
        (root: TizenFile) => {
          try {
            let dir: TizenFile;
            try {
              dir = root.resolve(FS_SUBDIR);
            } catch {
              dir = root.createDirectory(FS_SUBDIR);
            }
            resolve(dir);
          } catch (e) {
            reject(e);
          }
        },
        (e: any) => reject(e),
        "rw"
      );
    });
  }

  private static async writeFile(fileName: string, data: string): Promise<void> {
    const dir = await TizenStorage.resolveDir();
    return new Promise((resolve, reject) => {
      let file: TizenFile;
      try {
        try {
          file = dir.resolve(fileName);
          // truncate by deleting then recreating
          dir.deleteFile(
            (file.fullPath as string) || fileName,
            () => TizenStorage.openAndWrite(dir, fileName, data, resolve, reject),
            () => TizenStorage.openAndWrite(dir, fileName, data, resolve, reject)
          );
          return;
        } catch {
          // file does not exist yet — create below
        }
        TizenStorage.openAndWrite(dir, fileName, data, resolve, reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  private static openAndWrite(
    dir: TizenFile,
    fileName: string,
    data: string,
    resolve: () => void,
    reject: (e: any) => void
  ): void {
    try {
      const file = dir.resolve(fileName);
      file.openStream(
        "w",
        (stream: TizenFileStream) => {
          try {
            stream.write(data);
            stream.close();
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        (e: any) => reject(e),
        "UTF-8"
      );
    } catch (e) {
      reject(e);
    }
  }

  private static async readFile(fileName: string): Promise<string | null> {
    let dir: TizenFile;
    try {
      dir = await TizenStorage.resolveDir();
    } catch {
      return null;
    }
    return new Promise((resolve) => {
      try {
        const file = dir.resolve(fileName);
        file.openStream(
          "r",
          (stream: TizenFileStream) => {
            try {
              const data = stream.read(stream.bytesAvailable);
              stream.close();
              resolve(data);
            } catch {
              resolve(null);
            }
          },
          () => resolve(null),
          "UTF-8"
        );
      } catch {
        resolve(null);
      }
    });
  }

  private static async deleteFile(fileName: string): Promise<void> {
    let dir: TizenFile;
    try {
      dir = await TizenStorage.resolveDir();
    } catch {
      return;
    }
    return new Promise((resolve) => {
      try {
        const file = dir.resolve(fileName);
        dir.deleteFile(
          (file.fullPath as string) || fileName,
          () => resolve(),
          () => resolve()
        );
      } catch {
        resolve();
      }
    });
  }
}
