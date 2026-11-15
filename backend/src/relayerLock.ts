import type { Env } from "./env";

export type Lock = <T>(work: () => Promise<T>) => Promise<T>;

// Sin cola (pruebas o si el binding no está configurado), se ejecuta directo.
export const noLock: Lock = (work) => work();

// Pasa el trabajo por la fila única del relayer. Si la fila no responde, se sigue sin ella antes que dejar de enviar.
export function relayerLock(env: Pick<Env, "RELAYER_GATE">): Lock {
  const gate = env.RELAYER_GATE;
  if (!gate) return noLock;
  return async <T>(work: () => Promise<T>): Promise<T> => {
    const stub = gate.get(gate.idFromName("relayer"));
    let token: string | null = null;
    try {
      token = ((await (await stub.fetch("https://gate/acquire", { method: "POST" })).json()) as { token: string }).token;
    } catch {
      token = null;
    }
    try {
      return await work();
    } finally {
      if (token) await stub.fetch("https://gate/release", { method: "POST", body: JSON.stringify({ token }) }).catch(() => undefined);
    }
  };
}
