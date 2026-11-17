import { SYSTEM_EVENTS, type ChatEvent, type ChatEventKind } from "../chat/events";
import { formatUsdc } from "./money";

export type TimelineRow<M extends { createdAt: number; key: string }> = { type: "message"; key: string; createdAt: number; message: M } | { type: "event"; key: string; createdAt: number; event: ChatEvent };

// Mezcla mensajes y eventos por hora. A igual hora, el evento va antes: la propuesta se ve antes de lo que se conteste.
export function buildTimeline<M extends { createdAt: number; key: string }>(messages: M[], events: ChatEvent[]): TimelineRow<M>[] {
  const rows: TimelineRow<M>[] = [
    ...messages.map((message) => ({ type: "message" as const, key: message.key, createdAt: message.createdAt, message })),
    ...events.map((event) => ({ type: "event" as const, key: `event-${event.id}`, createdAt: event.createdAt, event })),
  ];
  return rows.map((row, index) => ({ row, index })).sort((a, b) => a.row.createdAt - b.row.createdAt || (a.row.type === b.row.type ? a.index - b.index : a.row.type === "event" ? -1 : 1)).map((entry) => entry.row);
}

const pad = (value: number): string => String(value).padStart(2, "0");
export const clockTime = (seconds: number): string => {
  const date = new Date(seconds * 1000);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

type Texts = Record<ChatEventKind, string>;

// "Aceptaste el acuerdo" para quien lo hizo y "{nombre} aceptó el acuerdo" para la otra persona. Completa los datos chicos del hecho (monto, cantidad, número de hito).
export function eventText(event: ChatEvent, me: string | null, name: string, texts: { mine: Texts; theirs: Texts }): string {
  const mine = me !== null && event.actor !== "" && event.actor.toLowerCase() === me.toLowerCase() && !SYSTEM_EVENTS.includes(event.kind);
  const data = event.data ?? {};
  const count = Number(data.count ?? 1);
  return (mine ? texts.mine : texts.theirs)[event.kind]
    .replace("{name}", name)
    .replace("{time}", clockTime(event.createdAt))
    .replace("{pruebas}", count === 1 ? "1 prueba" : `${count} pruebas`)
    .replace("{amount}", formatUsdc(String(data.added ?? data.paid ?? "0")))
    .replace("{n}", String(Number(data.index ?? 0) + 1))
    .replace("{percent}", String(Math.round(Number(data.progressBps ?? 0) / 100)));
}

// Si el hecho lo hizo quien está mirando el chat (se dibuja del lado derecho).
export const isMineEvent = (event: ChatEvent, me: string | null): boolean => me !== null && event.actor !== "" && event.actor.toLowerCase() === me.toLowerCase() && !SYSTEM_EVENTS.includes(event.kind);
