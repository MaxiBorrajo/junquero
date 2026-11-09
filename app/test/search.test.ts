import { describe, expect, it } from "vitest";
import { matchesQuery, normalize } from "../src/lib/search";

describe("búsqueda", () => {
  it("ignora tildes y mayúsculas", () => {
    expect(normalize("  Jardín  ")).toBe("jardin");
    expect(matchesQuery("JARDIN", ["Cortar el pasto del jardín"])).toBe(true);
  });

  it("exige todas las palabras, en cualquier orden y en cualquiera de los campos", () => {
    expect(matchesQuery("pintar habitacion", ["Pintar", "una habitación grande"])).toBe(true);
    expect(matchesQuery("pintar cocina", ["Pintar", "una habitación grande"])).toBe(false);
  });

  it("sin texto muestra todo y los campos vacíos no rompen", () => {
    expect(matchesQuery("  ", ["x"])).toBe(true);
    expect(matchesQuery("a", [null, undefined, "a"])).toBe(true);
    expect(matchesQuery("a", [null])).toBe(false);
  });
});
