// Una cola de un solo lugar: de a uno por vez, en orden de llegada. Si quien lo tiene no lo devuelve a tiempo (se cayó el
// Worker en el medio), el turno se libera solo al vencer el préstamo, así nadie queda esperando para siempre.
export class LeaseMutex {
  private holder: string | null = null;
  private expiresAt = 0;
  private readonly queue: (() => void)[] = [];

  constructor(
    private readonly leaseMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private busy(): boolean {
    return this.holder !== null && this.now() < this.expiresAt;
  }

  async acquire(token: string): Promise<void> {
    while (this.busy()) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
        setTimeout(resolve, Math.max(1, this.expiresAt - this.now() + 1));
      });
    }
    this.holder = token;
    this.expiresAt = this.now() + this.leaseMs;
  }

  release(token: string): boolean {
    if (this.holder !== token) return false;
    this.holder = null;
    this.queue.shift()?.();
    return true;
  }
}
