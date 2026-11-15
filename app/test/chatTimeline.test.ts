import { describe, expect, it } from "vitest";
import type { ChatEvent } from "../src/data/useChatEvents";
import { buildTimeline, eventText } from "../src/lib/chatTimeline";

const event = (id: number, createdAt: number, kind: ChatEvent["kind"] = "proposed", actor = "0xaa"): ChatEvent => ({ id, kind, actor, createdAt });
const message = (key: string, createdAt: number) => ({ key, createdAt });

describe("línea de tiempo del chat", () => {
  it("mezcla por hora y pone el evento antes si coinciden", () => {
    const rows = buildTimeline([message("m1", 10), message("m2", 30)], [event(1, 20), event(2, 30)]);
    expect(rows.map((row) => row.key)).toEqual(["m1", "event-1", "event-2", "m2"]);
  });
  it("redacta distinto para quien lo hizo y para la otra persona", () => {
    const texts = { mine: { proposed: "Mandaste", accepted: "", rejected: "", cancelled: "", agreed: "", checkedin: "", delivered: "", settled: "" }, theirs: { proposed: "{name} mandó", accepted: "", rejected: "", cancelled: "", agreed: "", checkedin: "", delivered: "", settled: "" } };
    expect(eventText(event(1, 1), "0xAA", "Ana", texts)).toBe("Mandaste");
    expect(eventText(event(1, 1), "0xbb", "Ana", texts)).toBe("Ana mandó");
  });
});
