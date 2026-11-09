import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { buildLoginMessage, issueToken, parseLogin, verifyLogin, verifyToken, TOKEN_TTL_SECONDS } from "../src/auth";

const account = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const now = 1_800_000_000;

async function login(issuedAt = now, signer = account) {
  const signature = await signer.signMessage({ message: buildLoginMessage(account.address, issuedAt) });
  return { address: account.address, issuedAt, signature };
}

describe("login", () => {
  it("accepts a valid signature and returns the lowercase address", async () => {
    const request = parseLogin(await login())!;
    expect(await verifyLogin(request, now)).toBe(account.address.toLowerCase());
  });

  it("rejects a signature from another wallet", async () => {
    const request = parseLogin(await login(now, other))!;
    expect(await verifyLogin(request, now)).toBeNull();
  });

  it("rejects expired and future messages", async () => {
    const request = parseLogin(await login(now - 301))!;
    expect(await verifyLogin(request, now)).toBeNull();
    const future = parseLogin(await login(now + 301))!;
    expect(await verifyLogin(future, now)).toBeNull();
  });

  it("rejects a signature over a different timestamp", async () => {
    const request = parseLogin(await login(now))!;
    expect(await verifyLogin({ ...request, issuedAt: now + 1 }, now)).toBeNull();
  });

  it("rejects malformed bodies and garbage signatures", async () => {
    expect(parseLogin(null)).toBeNull();
    expect(parseLogin({ address: "nope", issuedAt: now, signature: "0x00" })).toBeNull();
    expect(parseLogin({ address: account.address, issuedAt: "1", signature: "0x00" })).toBeNull();
    expect(await verifyLogin({ address: account.address, issuedAt: now, signature: "0x1234" }, now)).toBeNull();
  });
});

describe("session token", () => {
  const secret = "test-secret";

  it("round-trips and expires", async () => {
    const { token, expiresAt } = await issueToken(secret, account.address, now);
    expect(expiresAt).toBe(now + TOKEN_TTL_SECONDS);
    expect(await verifyToken(secret, token, now + 10)).toBe(account.address.toLowerCase());
    expect(await verifyToken(secret, token, expiresAt)).toBeNull();
  });

  it("rejects tokens signed with another secret or tampered", async () => {
    const { token } = await issueToken(secret, account.address, now);
    expect(await verifyToken("other", token, now)).toBeNull();
    const [payload, signature] = token.split(".");
    const forged = btoa(`${other.address.toLowerCase()}.${now + 999999}`).replace(/=+$/, "");
    expect(await verifyToken(secret, `${forged}.${signature}`, now)).toBeNull();
    expect(await verifyToken(secret, `${payload}.AAAA`, now)).toBeNull();
    expect(await verifyToken(secret, "garbage", now)).toBeNull();
    expect(await verifyToken(secret, "a.b.c", now)).toBeNull();
  });
});
