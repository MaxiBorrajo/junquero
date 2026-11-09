import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi } from "../src/lib/api";
import { formatAmount, shortAddress } from "../src/lib/format";
import { buildLoginMessage, connect, NoWalletError, signLogin, utf8Hex } from "../src/lib/login";

describe("login", () => {
  it("arma el mismo texto que verifica el servidor", () => {
    expect(buildLoginMessage("0xAbC0000000000000000000000000000000000001", 1794190000)).toBe(
      "Junquero: confirmo que esta billetera es mía.\nBilletera: 0xabc0000000000000000000000000000000000001\nEmitido: 1794190000",
    );
  });

  it("codifica en hexadecimal UTF-8, con tildes", () => {
    expect(utf8Hex("mía")).toBe("0x6dc3ad61");
    expect(utf8Hex("")).toBe("0x");
  });

  it("pide la cuenta y firma el texto codificado", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => (method === "eth_requestAccounts" ? ["0xABCDEF0000000000000000000000000000000001"] : "0xfirma"));
    const address = await connect({ request });
    expect(address).toBe("0xabcdef0000000000000000000000000000000001");
    expect(await signLogin({ request }, address, 5)).toBe("0xfirma");
    const call = request.mock.calls.at(-1)![0] as unknown as { params: string[] };
    expect(call.params[0]).toBe(utf8Hex(buildLoginMessage(address, 5)));
    expect(call.params[1]).toBe(address);
  });

  it("avisa si no hay billetera ni cuentas", async () => {
    await expect(connect(undefined)).rejects.toBeInstanceOf(NoWalletError);
    await expect(connect({ request: async () => [] })).rejects.toThrow("no_account");
  });
});

describe("cliente", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it("manda el token y parsea JSON", async () => {
    const fetcher = vi.fn(async () => json(200, { ok: 1 }));
    const api = createApi("https://x", () => "tok", () => {}, fetcher);
    expect(await api.get("/admin/summary")).toEqual({ ok: 1 });
    expect(((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("serializa los POST", async () => {
    const fetcher = vi.fn(async () => json(200, {}));
    await createApi("https://x", () => null, () => {}, fetcher).post("/admin/log", { a: 1 });
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("lanza ApiError y avisa si la sesión venció", async () => {
    const onUnauthorized = vi.fn();
    const api = createApi("https://x", () => "tok", onUnauthorized, async () => json(401, { error: "unauthorized" }));
    await expect(api.get("/admin/summary")).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    await expect(api.get("/admin/summary")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it("usa un código genérico si el cuerpo no es JSON", async () => {
    const api = createApi("https://x", () => null, () => {}, async () => new Response("boom", { status: 502 }));
    await expect(api.get("/x")).rejects.toMatchObject({ code: "http_502" });
  });
});

describe("formato", () => {
  it("formatea montos y direcciones", () => {
    expect(formatAmount("25500000")).toBe("25,5");
    expect(formatAmount(1234567890000)).toBe("1.234.567,89");
    expect(formatAmount(null)).toBe("-");
    expect(shortAddress("0x4E5e9eE0aAAbDA5B4e6118EE20e1bBe68b136511")).toBe("0x4E5e…6511");
  });
});
