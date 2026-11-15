import type { OrderView } from "./actions";

export type PayeeStep = "arrive" | "work" | "finish" | "review";
export type PayerStep = "wait" | "review" | "approve" | "done";

export interface JourneyState {
  view: OrderView;
  presencial: boolean;
  arrived: boolean;
  // Ya están subidas todas las pruebas pedidas (o al menos una si no se pidió ninguna en particular).
  ready: boolean;
}

// Los pasos de quien trabaja: llegar (solo presencial), subir las pruebas, terminar y esperar la aprobación.
export const payeeSteps = (presencial: boolean): PayeeStep[] => [...(presencial ? (["arrive"] as const) : []), "work", "finish", "review"];

export const payerSteps = (): PayerStep[] => ["wait", "review", "approve", "done"];

// Posición del paso actual. Un valor igual a la cantidad de pasos significa que ya terminó todo.
// El detalle del trabajo y el chat usan esta misma cuenta, así que siempre muestran el mismo paso.
export function payeeCurrent(state: JourneyState): number {
  const steps = payeeSteps(state.presencial);
  if (state.view === "settled") return steps.length;
  if (state.view === "worker-waiting-review") return steps.indexOf("review");
  if (state.presencial && !state.arrived) return steps.indexOf("arrive");
  return state.ready ? steps.indexOf("finish") : steps.indexOf("work");
}

export function payerCurrent(view: OrderView): number {
  if (view === "settled") return payerSteps().length;
  return view === "payer-waiting-work" ? 0 : 1;
}
