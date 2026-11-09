import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";
import { createApi } from "../src/api/client";
import { buildLoginMessage, isExpired, loginWithWallet } from "../src/session/login";

describe("login", () => {
  it("arma el mensaje exacto que verifica el servidor", () => {
    expect(buildLoginMessage("0xAbC0000000000000000000000000000000000001", 1794190000)).toBe(
      "Junquero: confirmo que esta billetera es mía.\nBilletera: 0xabc0000000000000000000000000000000000001\nEmitido: 1794190000",
    );
  });

  it("firma el mensaje y manda dirección en minúsculas", async () => {
    const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ token: "t", expiresAt: 10, address: account.address.toLowerCase() }), { status: 200 }));
    const api = createApi({ baseUrl: "https://x", fetcher, getToken: () => null });
    const result = await loginWithWallet(api, account.address, (message) => account.signMessage({ message }), 1794190000);
    expect(result.token).toBe("t");
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.address).toBe(account.address.toLowerCase());
    expect(body.issuedAt).toBe(1794190000);
    expect(body.signature).toBe(await account.signMessage({ message: buildLoginMessage(account.address, 1794190000) }));
  });

  it("considera vencida una sesión que expira en menos de una hora", () => {
    expect(isExpired(1000 + 3000, 1000)).toBe(true);
    expect(isExpired(1000 + 7200, 1000)).toBe(false);
  });
});
