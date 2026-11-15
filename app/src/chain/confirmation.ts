// Espera a que una transacción enviada por el relayer quede confirmada en la red. La lógica está separada de la
// librería de la billetera para poder probarla sin celular.
export type Confirmation = "confirmed" | "timeout";

export const CONFIRMATION_TIMEOUT_MS = 90_000;

// `wait` devuelve true si la transacción salió bien y false si el contrato la revirtió.
export async function waitForConfirmation(
  hash: string,
  wait: (hash: string) => Promise<boolean>,
  timeoutMs: number = CONFIRMATION_TIMEOUT_MS,
): Promise<Confirmation> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Confirmation>((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const result = await Promise.race([wait(hash).then((ok) => (ok ? ("confirmed" as const) : ("reverted" as const))), timeout]);
    if (result === "reverted") throw new Error("transaction_reverted");
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
