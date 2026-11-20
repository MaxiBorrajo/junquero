import { describe, expect, it } from "vitest";
import { groupEvidence } from "../src/jury/evidenceGroups";

const A = "0xaaaa";
const B = "0xbbbb";
const item = (hash: string, uploader: string, createdAt: number) => ({ hash, uploader, createdAt });

describe("pruebas de un reclamo, separadas", () => {
  it("separa las del trabajo de las que cuenta cada parte desde el reclamo", () => {
    const items = [item("foto", B, 100), item("relatoA", A, 1000), item("relatoB", B, 1200), item("extraB", B, 1250), item("archivoA", A, 1001)];
    const names = { relatoA: "relato.txt", relatoB: "relato.txt" };
    const groups = groupEvidence(items, names, A, B);
    expect(groups.job.map((i) => i.hash)).toEqual(["foto"]);
    expect(groups.payer.map((i) => i.hash)).toEqual(["relatoA", "archivoA"]);
    expect(groups.payee.map((i) => i.hash)).toEqual(["relatoB", "extraB"]);
  });

  it("si todavía no hay ningún relato, todo cuenta como del trabajo", () => {
    const groups = groupEvidence([item("x", A, 1), item("y", B, 2)], {}, A, B);
    expect(groups.job).toHaveLength(2);
    expect(groups.payer).toHaveLength(0);
  });

  it("deja una parte vacía si todavía no compartió nada", () => {
    const groups = groupEvidence([item("relatoB", B, 1000)], { relatoB: "relato.txt" }, A, B);
    expect(groups.payer).toEqual([]);
    expect(groups.payee).toHaveLength(1);
  });
});
