// Hechos del flujo que se muestran en el chat. Sin dependencias de pantalla, para poder probarlos solos.
export type ChatEventKind =
  | "proposed" | "accepted" | "rejected" | "cancelled" | "expired"
  | "applied" | "withdrawn" | "dismissed" | "offered" | "offer_rejected"
  | "agreed" | "checkedin" | "delivered" | "settled"
  | "evidence" | "approved" | "review_extended" | "changes_requested"
  | "topped_up" | "order_cancelled" | "dispute_opened" | "dispute_resolved"
  | "milestone_delivered" | "milestone_paid" | "progress" | "terminated" | "abandoned";

// Hechos que no hizo ninguna de las dos personas (los resuelve el sistema o el jurado): se ven siempre del lado de la otra persona.
export const SYSTEM_EVENTS: readonly ChatEventKind[] = ["expired", "dispute_resolved"];

export interface ChatEvent {
  id: number;
  kind: ChatEventKind;
  actor: string;
  createdAt: number;
  data?: Record<string, string | number> | null;
}
