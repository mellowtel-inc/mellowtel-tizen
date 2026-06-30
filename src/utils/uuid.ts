import { v4 } from "uuid";

/** RFC4122 v4 UUID. The `uuid` package uses Web Crypto when available. */
export function uuidv4(): string {
  return v4();
}

/**
 * Lowercase alphanumeric random string of the given length. Used for the node
 * id's random tail (mllwtl_<publicKey>_<rand10>), matching the live SDK format.
 * Prefers Web Crypto for unbiased randomness; falls back to Math.random.
 */
export function randomString(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const cryptoObj: Crypto | undefined =
    typeof crypto !== "undefined" ? crypto : undefined;

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
