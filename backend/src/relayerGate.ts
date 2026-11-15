import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";
import { LeaseMutex } from "./mutex";

const LEASE_MS = 30_000;

// Un solo ejemplar en todo el sistema: todas las transacciones que se firman con la clave del relayer (reenvíos, acuerdos,
// marcas, tareas) hacen fila acá. Así no se pisan el número de transacción (nonce) ni se gastan envíos que fallan por eso.
export class RelayerGate extends DurableObject<Env> {
  private readonly mutex = new LeaseMutex(LEASE_MS);

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/acquire") {
      const token = crypto.randomUUID();
      await this.mutex.acquire(token);
      return Response.json({ token });
    }
    if (path === "/release") {
      const { token } = (await request.json().catch(() => ({}))) as { token?: string };
      return Response.json({ released: typeof token === "string" && this.mutex.release(token) });
    }
    return new Response("not found", { status: 404 });
  }
}
