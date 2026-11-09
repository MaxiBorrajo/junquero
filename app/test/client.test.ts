import { describe, expect, it, vi } from "vitest";
import { ApiError, createApi } from "../src/api/client";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("api client", () => {
  it("manda el token y parsea la respuesta", async () => {
    const fetcher = vi.fn(async () => json(200, { ok: true }));
    const api = createApi({ baseUrl: "https://x", fetcher, getToken: () => "abc" });
    expect(await api.get("/me")).toEqual({ ok: true });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x/me");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });

  it("no manda Authorization sin token", async () => {
    const fetcher = vi.fn(async () => json(200, {}));
    await createApi({ baseUrl: "https://x", fetcher, getToken: () => null }).get("/changas");
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toEqual({});
  });

  it("serializa el cuerpo JSON", async () => {
    const fetcher = vi.fn(async () => json(201, { id: 1 }));
    await createApi({ baseUrl: "https://x", fetcher, getToken: () => null }).send("PUT", "/me/profile", { name: "Ana" });
    const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe('{"name":"Ana"}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("lanza ApiError con el código del servidor", async () => {
    const api = createApi({ baseUrl: "https://x", fetcher: async () => json(400, { error: "name too short" }), getToken: () => null });
    await expect(api.get("/x")).rejects.toMatchObject({ status: 400, code: "name too short" });
    await expect(api.get("/x")).rejects.toBeInstanceOf(ApiError);
  });

  it("usa un código genérico si el cuerpo no es JSON", async () => {
    const api = createApi({ baseUrl: "https://x", fetcher: async () => new Response("boom", { status: 502 }), getToken: () => null });
    await expect(api.get("/x")).rejects.toMatchObject({ status: 502, code: "http_502" });
  });

  it("avisa cuando el token deja de servir", async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ baseUrl: "https://x", fetcher: async () => json(401, { error: "unauthorized" }), getToken: () => "t", onUnauthorized });
    await expect(api.get("/me")).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it("no avisa 401 si nunca hubo sesión", async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ baseUrl: "https://x", fetcher: async () => json(401, { error: "unauthorized" }), getToken: () => null, onUnauthorized });
    await expect(api.get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
