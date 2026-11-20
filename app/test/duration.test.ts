import { describe, expect, it } from "vitest";
import { spokenDuration } from "../src/lib/duration";

describe("plazos dichos como persona", () => {
  it("elige la unidad que corresponde", () => {
    expect(spokenDuration(300)).toBe("5 minutos");
    expect(spokenDuration(60)).toBe("1 minuto");
    expect(spokenDuration(1800)).toBe("30 minutos");
    expect(spokenDuration(3600)).toBe("1 hora");
    expect(spokenDuration(21600)).toBe("6 horas");
    expect(spokenDuration(5400)).toBe("1 hora y 30 minutos");
    expect(spokenDuration(259200)).toBe("3 días");
  });
});
