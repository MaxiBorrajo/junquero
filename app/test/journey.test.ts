import { describe, expect, it } from "vitest";
import { payeeCurrent, payeeSteps, payerCurrent, payerSteps } from "../src/lib/journey";

describe("camino del trabajo", () => {
  const base = { view: "worker-working" as const, presencial: true, arrived: false, ready: false };
  it("quien trabaja avanza llegar, pruebas, terminar y esperar", () => {
    const steps = payeeSteps(true);
    expect(steps[payeeCurrent(base)]).toBe("arrive");
    expect(steps[payeeCurrent({ ...base, arrived: true })]).toBe("work");
    expect(steps[payeeCurrent({ ...base, arrived: true, ready: true })]).toBe("finish");
    expect(steps[payeeCurrent({ ...base, view: "worker-waiting-review" })]).toBe("review");
    expect(payeeCurrent({ ...base, view: "settled" })).toBe(steps.length);
  });
  it("a distancia no hay paso de llegar", () => {
    const steps = payeeSteps(false);
    expect(steps).not.toContain("arrive");
    expect(steps[payeeCurrent({ ...base, presencial: false })]).toBe("work");
  });
  it("quien publica espera, revisa y termina", () => {
    expect(payerCurrent("payer-waiting-work")).toBe(0);
    expect(payerCurrent("payer-reviewing")).toBe(1);
    expect(payerCurrent("settled")).toBe(payerSteps().length);
  });
});
