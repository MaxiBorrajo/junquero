import { describe, expect, it } from "vitest";
import { addStaged, clearStaged, flattenStaged, roomLeft, stagedCount } from "../src/evidence/staging";
import { MAX_BATCH_ITEMS } from "../src/evidence/upload";

const file = (name: string) => ({ uri: `file:///${name}`, name, mime: "image/jpeg" });

describe("pruebas elegidas antes de firmar", () => {
  it("junta archivos de varias pruebas pedidas y los lista en orden", () => {
    let staged = addStaged({}, 2, [file("c.jpg")]);
    staged = addStaged(staged, 0, [file("a.jpg"), file("b.jpg")]);
    expect(stagedCount(staged)).toBe(3);
    expect(flattenStaged(staged).map((entry) => [entry.requirement, entry.file.name])).toEqual([[0, "a.jpg"], [0, "b.jpg"], [2, "c.jpg"]]);
  });

  it("elegir de nuevo en la misma prueba suma, y quitar la vacía", () => {
    let staged = addStaged({}, 1, [file("a.jpg")]);
    staged = addStaged(staged, 1, [file("b.jpg")]);
    expect(staged[1]).toHaveLength(2);
    expect(clearStaged(staged, 1)).toEqual({});
  });

  it("no se pasa del tope de una firma", () => {
    const many = Array.from({ length: MAX_BATCH_ITEMS + 5 }, (_, index) => file(`${index}.jpg`));
    const staged = addStaged({}, 0, many);
    expect(stagedCount(staged)).toBe(MAX_BATCH_ITEMS);
    expect(roomLeft(staged)).toBe(0);
    expect(addStaged(staged, 1, [file("extra.jpg")])).toBe(staged);
  });
});
