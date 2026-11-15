// El aporte inicial de quien crea un grupo se hace en segundo plano: espera a que el grupo exista en la cadena y recién
// ahí pide la firma y suma el aporte. No depende de que la pantalla siga abierta.
export interface InitialContributionJob {
  key: string;
  // Devuelve el id de la orden cuando el grupo ya está confirmado, o null si no apareció a tiempo.
  waitForGroup: () => Promise<number | null>;
  contribute: (orderId: number) => Promise<void>;
  onSuccess: () => void;
  onFailure: () => void;
}

const running = new Set<string>();

export function isContributionRunning(key: string): boolean {
  return running.has(key);
}

export async function runInitialContribution(job: InitialContributionJob): Promise<boolean> {
  if (running.has(job.key)) return false;
  running.add(job.key);
  try {
    const orderId = await job.waitForGroup();
    if (orderId === null) throw new Error("not_ready");
    await job.contribute(orderId);
    job.onSuccess();
    return true;
  } catch {
    job.onFailure();
    return false;
  } finally {
    running.delete(job.key);
  }
}
