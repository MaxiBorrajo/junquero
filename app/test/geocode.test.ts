import { describe, expect, it } from "vitest";
import { sortByDistance, type Place } from "../src/lib/geocode";

const place = (id: string, lat: number, lng: number): Place => ({ id, name: id, detail: id, lat, lng });

describe("sortByDistance", () => {
  it("puts the closest place to the map center first", () => {
    const near = { lat: -34.71, lng: -58.29 };
    const sorted = sortByDistance([place("matanza", -34.66, -58.54), place("quilmes", -34.7148, -58.3184), place("varela", -34.798, -58.254)], near);
    expect(sorted.map((item) => item.id)).toEqual(["quilmes", "varela", "matanza"]);
  });

  it("does not change the original list", () => {
    const list = [place("b", 1, 1), place("a", 0, 0)];
    sortByDistance(list, { lat: 0, lng: 0 });
    expect(list.map((item) => item.id)).toEqual(["b", "a"]);
  });
});
