import type { ChatEvent } from "../data/useChatEvents";

export type TimelineRow<M extends { createdAt: number; key: string }> = { type: "message"; key: string; createdAt: number; message: M } | { type: "event"; key: string; createdAt: number; event: ChatEvent };

// Mezcla mensajes y eventos por hora. A igual hora, el evento va antes: la propuesta se ve antes de lo que se conteste.
export function buildTimeline<M extends { createdAt: number; key: string }>(messages: M[], events: ChatEvent[]): TimelineRow<M>[] {
  const rows: TimelineRow<M>[] = [
    ...messages.map((message) => ({ type: "message" as const, key: message.key, createdAt: message.createdAt, message })),
    ...events.map((event) => ({ type: "event" as const, key: `event-${event.id}`, createdAt: event.createdAt, event })),
  ];
  return rows.map((row, index) => ({ row, index })).sort((a, b) => a.row.createdAt - b.row.createdAt || (a.row.type === b.row.type ? a.index - b.index : a.row.type === "event" ? -1 : 1)).map((entry) => entry.row);
}

// "Aceptaste el acuerdo" para quien lo hizo y "{nombre} aceptó el acuerdo" para la otra persona.
export function eventText(event: ChatEvent, me: string | null, name: string, texts: { mine: Record<ChatEvent["kind"], string>; theirs: Record<ChatEvent["kind"], string> }): string {
  const mine = me !== null && event.actor.toLowerCase() === me.toLowerCase();
  return (mine ? texts.mine : texts.theirs)[event.kind].replace("{name}", name);
}
