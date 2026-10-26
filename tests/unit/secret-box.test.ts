import { afterEach, describe, expect, it } from "vitest";
import { canEncrypt, isEncrypted, open, seal, SecretUnavailableError } from "@/server/secret-box";

const URL_PLAIN = "https://demouser:sup3rs3cretpw@bridge.simplefin.org/simplefin";
const KEY = Buffer.alloc(32, 9).toString("base64");

const g = globalThis as { __cashflowOsKeystore?: unknown };
const keystore = (available = true) => ({
  isAvailable: () => available,
  encrypt: (plain: string) => Buffer.from(`k:${plain}`).reverse(),
  decrypt: (sealed: Buffer) => Buffer.from(sealed).reverse().toString().slice(2),
});

afterEach(() => {
  delete g.__cashflowOsKeystore;
  delete process.env.CASHFLOW_SECRET_KEY;
});

describe("secret-box with no sealer (plain dev/prod server)", () => {
  it("stores plaintext and reads it back", () => {
    expect(canEncrypt()).toBe(false);
    expect(seal(URL_PLAIN)).toBe(URL_PLAIN);
    expect(open(URL_PLAIN)).toBe(URL_PLAIN);
    expect(isEncrypted(URL_PLAIN)).toBe(false);
  });
});

describe("secret-box with the desktop keystore", () => {
  it("round-trips through an opaque, self-describing value", () => {
    g.__cashflowOsKeystore = keystore();
    expect(canEncrypt()).toBe(true);
    const stored = seal(URL_PLAIN);
    expect(stored.startsWith("enc:v1:os:")).toBe(true);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain("sup3rs3cretpw");
    expect(open(stored)).toBe(URL_PLAIN);
  });

  it("still reads legacy plaintext", () => {
    g.__cashflowOsKeystore = keystore();
    expect(open(URL_PLAIN)).toBe(URL_PLAIN);
  });

  it("is ignored when the OS reports encryption unavailable", () => {
    g.__cashflowOsKeystore = keystore(false);
    expect(canEncrypt()).toBe(false);
    expect(seal(URL_PLAIN)).toBe(URL_PLAIN);
  });

  it("refuses, without echoing the value, to read it where the keystore is missing", () => {
    g.__cashflowOsKeystore = keystore();
    const stored = seal(URL_PLAIN);
    delete g.__cashflowOsKeystore;
    expect(() => open(stored)).toThrow(SecretUnavailableError);
    try {
      open(stored);
    } catch (err) {
      expect((err as Error).message).not.toContain("sup3rs3cretpw");
      expect((err as Error).message).not.toContain(stored);
    }
  });

  it("wraps a keystore decrypt failure", () => {
    g.__cashflowOsKeystore = { ...keystore(), decrypt: () => { throw new Error(`bad ${URL_PLAIN}`); } };
    expect(() => open("enc:v1:os:AAAA")).toThrow(SecretUnavailableError);
    expect(() => open("enc:v1:os:AAAA")).not.toThrow(/sup3rs3cretpw/);
  });
});

describe("secret-box with CASHFLOW_SECRET_KEY (plain server)", () => {
  it("round-trips with a random IV each time", () => {
    process.env.CASHFLOW_SECRET_KEY = KEY;
    const a = seal(URL_PLAIN);
    const b = seal(URL_PLAIN);
    expect(a.startsWith("enc:v1:key:")).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain("sup3rs3cretpw");
    expect(open(a)).toBe(URL_PLAIN);
    expect(open(b)).toBe(URL_PLAIN);
  });

  it("prefers the OS keystore when both exist", () => {
    process.env.CASHFLOW_SECRET_KEY = KEY;
    g.__cashflowOsKeystore = keystore();
    expect(seal(URL_PLAIN).startsWith("enc:v1:os:")).toBe(true);
  });

  it("rejects a wrong key, a missing key, a tampered value and a malformed key", () => {
    process.env.CASHFLOW_SECRET_KEY = KEY;
    const stored = seal(URL_PLAIN);

    process.env.CASHFLOW_SECRET_KEY = Buffer.alloc(32, 1).toString("base64");
    expect(() => open(stored)).toThrow(SecretUnavailableError);

    delete process.env.CASHFLOW_SECRET_KEY;
    expect(() => open(stored)).toThrow(SecretUnavailableError);

    process.env.CASHFLOW_SECRET_KEY = KEY;
    const bytes = Buffer.from(stored.slice("enc:v1:key:".length), "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => open(`enc:v1:key:${bytes.toString("base64")}`)).toThrow(SecretUnavailableError);
    expect(() => open("enc:v1:key:AAAA")).toThrow(SecretUnavailableError);

    process.env.CASHFLOW_SECRET_KEY = "too-short";
    expect(() => seal(URL_PLAIN)).toThrow(SecretUnavailableError);
  });
});
