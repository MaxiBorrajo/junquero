import { describe, expect, it } from "vitest";
import type { ChatEvent } from "../src/chat/events";
import { t } from "../src/i18n";
import { buildTimeline, eventText, isMineEvent } from "../src/lib/chatTimeline";

const event = (id: number, createdAt: number, kind: ChatEvent["kind"] = "proposed", actor = "0xaa", data: ChatEvent["data"] = null): ChatEvent => ({ id, kind, actor, createdAt, data });
const message = (key: string, createdAt: number) => ({ key, createdAt });
const text = (item: ChatEvent, me: string | null) => eventText(item, me, "Ana", t.chat.events);

describe("línea de tiempo del chat", () => {
  it("mezcla por hora y pone el evento antes si coinciden", () => {
    const rows = buildTimeline([message("m1", 10), message("m2", 30)], [event(1, 20), event(2, 30)]);
    expect(rows.map((row) => row.key)).toEqual(["m1", "event-1", "event-2", "m2"]);
  });

  it("redacta distinto para quien lo hizo y para la otra persona", () => {
    expect(text(event(1, 1, "proposed"), "0xAA")).toBe("Mandaste la propuesta de acuerdo.");
    expect(text(event(1, 1, "proposed"), "0xbb")).toBe("Ana te mandó la propuesta de acuerdo.");
    expect(text(event(1, 1, "withdrawn"), "0xaa")).toBe("Te bajaste de la postulación.");
    expect(text(event(1, 1, "withdrawn"), "0xbb")).toBe("Ana se bajó de la postulación.");
  });

  it("completa cantidades, montos, hitos y avances", () => {
    expect(text(event(1, 1, "evidence", "0xaa", { count: 1 }), "0xaa")).toBe("Subiste 1 prueba.");
    expect(text(event(1, 1, "evidence", "0xaa", { count: 3 }), "0xbb")).toBe("Ana subió 3 pruebas.");
    expect(text(event(1, 1, "topped_up", "0xaa", { added: "5000000" }), "0xbb")).toContain("5");
    expect(text(event(1, 1, "milestone_delivered", "0xaa", { index: 1 }), "0xaa")).toBe("Entregaste el hito 2.");
    expect(text(event(1, 1, "progress", "0xaa", { index: 0, progressBps: 6000 }), "0xbb")).toBe("Ana reportó 60% de avance.");
  });

  it("los hechos del sistema no son de nadie", () => {
    expect(isMineEvent(event(1, 1, "expired", "0xaa"), "0xaa")).toBe(false);
    expect(isMineEvent(event(1, 1, "dispute_resolved", ""), "0xaa")).toBe(false);
    expect(text(event(1, 1, "expired", "0xaa"), "0xaa")).toBe("La propuesta venció. El trabajo vuelve a estar abierto.");
    expect(isMineEvent(event(1, 1, "applied", "0xAA"), "0xaa")).toBe(true);
  });
});
