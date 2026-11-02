/**
 * Encryption at rest for the SimpleFIN Access URL (BankConnection.accessUrl).
 *
 * A stored value is self-describing:
 *   - `enc:v1:os:<base64>`   sealed by the desktop app's OS keystore (Electron safeStorage, i.e. Windows DPAPI).
 *   - `enc:v1:key:<base64>`  AES-256-GCM (iv | tag | ciphertext) under CASHFLOW_SECRET_KEY.
 *   - anything else          a legacy plaintext Access URL (always `https://...`), still readable.
 *
 * Which sealer is used for NEW writes: the OS keystore if the desktop app registered one,
 * else CASHFLOW_SECRET_KEY if set, else none (plaintext, the plain `next dev` / `next start` default).
 *
 * The desktop main process registers the keystore on globalThis (like the PrismaClient singleton)
 * before it starts Next, which runs in the same process. The key never leaves the main process
 * and nothing here logs or returns a secret. Errors carry no value.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Registered by electron/main.ts: a synchronous wrapper over Electron's safeStorage. */
export interface OsKeystore {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(sealed: Buffer): string;
}

const OS_PREFIX = "enc:v1:os:";
const KEY_PREFIX = "enc:v1:key:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

const globalForKeystore = globalThis as unknown as { __cashflowOsKeystore?: OsKeystore };

export class SecretUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretUnavailableError";
  }
}

export const isEncrypted = (stored: string): boolean => stored.startsWith("enc:v1:");

function osKeystore(): OsKeystore | null {
  const ks = globalForKeystore.__cashflowOsKeystore;
  return ks && ks.isAvailable() ? ks : null;
}

/** CASHFLOW_SECRET_KEY must be 32 bytes, base64 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). */
function envKey(): Buffer | null {
  const raw = process.env.CASHFLOW_SECRET_KEY?.trim();
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new SecretUnavailableError("CASHFLOW_SECRET_KEY must be 32 bytes, base64-encoded.");
  }
  return key;
}

/** True when `seal` will encrypt (an OS keystore or a configured key exists). */
export function canEncrypt(): boolean {
  return osKeystore() !== null || envKey() !== null;
}

/** Encrypts for storage; returns the plaintext unchanged only when no sealer is configured. */
export function seal(plain: string): string {
  const ks = osKeystore();
  if (ks) return OS_PREFIX + ks.encrypt(plain).toString("base64");

  const key = envKey();
  if (!key) return plain;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return KEY_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

/** Decrypts a stored value; a legacy plaintext value is returned as is. */
export function open(stored: string): string {
  if (stored.startsWith(OS_PREFIX)) {
    const ks = osKeystore();
    if (!ks) throw new SecretUnavailableError("This value was encrypted by the desktop app and can only be read there.");
    try {
      return ks.decrypt(Buffer.from(stored.slice(OS_PREFIX.length), "base64"));
    } catch {
      throw new SecretUnavailableError("The stored value could not be decrypted on this computer or Windows account.");
    }
  }
  if (stored.startsWith(KEY_PREFIX)) {
    const key = envKey();
    if (!key) throw new SecretUnavailableError("This value was encrypted with CASHFLOW_SECRET_KEY, which is not set.");
    const bytes = Buffer.from(stored.slice(KEY_PREFIX.length), "base64");
    if (bytes.length < IV_BYTES + TAG_BYTES) throw new SecretUnavailableError("The stored value is corrupt.");
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, IV_BYTES));
      decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
    } catch {
      throw new SecretUnavailableError("The stored value could not be decrypted with CASHFLOW_SECRET_KEY (wrong key?).");
    }
  }
  return stored;
}
