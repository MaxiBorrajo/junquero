import { describe, expect, it } from "vitest";
import { buildSpec, emptyDraft, parseAmount, setModality, validateAll, validateBasics, validatePrice, validateWhen, withApproximateZone, type Draft } from "../src/publish/draft";
import { distanceM } from "../src/lib/geo";

const NOW = 1_800_000_000;
const base = (patch: Partial<Draft> = {}): Draft => ({
  ...emptyDraft(),
  title: "Pintar un frente",
  category: 1,
  point: { lat: -34.6037, lng: -58.3816 },
  approx: { lat: -34.6045, lng: -58.3809 },
  startsAt: NOW + 7200,
  amount: "25",
  ...patch,
});

describe("borrador", () => {
  it("valida título y rubro", () => {
    expect(validateBasics(base())).toEqual({});
    expect(validateBasics(base({ title: "ab" })).title).toBeDefined();
    expect(validateBasics(base({ title: "x".repeat(81) })).title).toBeDefined();
    expect(validateBasics(base({ category: null })).category).toBeDefined();
    expect(validateBasics(base({ description: "x".repeat(2001) })).description).toBeDefined();
  });

  it("presencial exige punto y fecha con una hora de margen", () => {
    expect(validateWhen(base(), NOW)).toEqual({});
    expect(validateWhen(base({ point: null }), NOW).point).toBeDefined();
    expect(validateWhen(base({ startsAt: NOW + 1800 }), NOW).startsAt).toBeDefined();
    expect(validateWhen(base({ startsAt: null }), NOW).startsAt).toBeDefined();
  });

  it("a distancia exige plazo de entrega y no punto", () => {
    const remote = base({ modality: "remote", point: null, approx: null, startsAt: null, deadline: NOW + 86400 });
    expect(validateWhen(remote, NOW)).toEqual({});
    expect(validateWhen({ ...remote, deadline: null }, NOW).deadline).toBeDefined();
  });

  it("valida monto mínimo, decimales y evidencia", () => {
    expect(parseAmount("25,5")).toBe(25_500_000n);
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("1.1234567")).toBeNull();
    expect(validatePrice(base({ amount: "0,5" })).amount).toBe("amountMin");
    expect(validatePrice(base({ amount: "" })).amount).toBe("amount");
    expect(validatePrice(base({ evidence: ["a", "b", "c", "d", "e", "f"] })).evidence).toBeDefined();
    expect(validatePrice(base({ evidence: ["x".repeat(121)] })).evidence).toBeDefined();
    expect(validatePrice(base({ evidence: ["", "foto del frente"] }))).toEqual({});
  });

  it("validateAll junta los errores de todos los pasos", () => {
    expect(Object.keys(validateAll(emptyDraft(), NOW)).sort()).toEqual(["amount", "category", "evidence", "point", "startsAt", "title"]);
    expect(validateAll(base({ evidence: ["foto del frente"] }), NOW)).toEqual({});
  });

  it("pide al menos una prueba de cierre salvo que se use el plan por hitos", () => {
    expect(validatePrice(base({ evidence: [] })).evidence).toBe("required");
    expect(validatePrice(base({ evidence: ["", "  "] })).evidence).toBe("required");
    expect(validatePrice(base({ evidence: ["foto del frente"] })).evidence).toBeUndefined();
    expect(validatePrice(base({ evidence: [], useMilestones: true, milestones: [] })).evidence).toBeUndefined();
  });

  it("la ficha presencial lleva la zona aproximada y nunca el punto exacto", () => {
    const spec = buildSpec(base({ evidence: [" foto ", ""] }), "nonce-12345");
    expect(spec.area).toEqual({ lat: -34.6045, lng: -58.3809, radiusM: 300 });
    expect(JSON.stringify(spec)).not.toContain("-34.6037");
    expect(spec).toMatchObject({ v: 1, modality: "onsite", startsAt: NOW + 7200, evidence: ["foto"] });
    expect(spec.deadline).toBeUndefined();
  });

  it("la ficha a distancia no lleva zona ni horario de inicio", () => {
    const spec = buildSpec(base({ modality: "remote", deadline: NOW + 86400 }), "nonce-12345");
    expect(spec.area).toBeUndefined();
    expect(spec.startsAt).toBeUndefined();
    expect(spec.deadline).toBe(NOW + 86400);
  });

  it("cambiar de modalidad limpia lo que ya no aplica", () => {
    const changed = setModality(base(), "remote");
    expect(changed).toMatchObject({ modality: "remote", point: null, approx: null, startsAt: null });
    const same = base();
    expect(setModality(same, "onsite")).toBe(same);
  });

  it("la zona aproximada queda desplazada del punto real", () => {
    let i = 0;
    const values = [0.3, 0.7];
    const draft = withApproximateZone(emptyDraft(), { lat: -34.6, lng: -58.4 }, () => values[i++ % 2]!);
    const d = distanceM(draft.point!, draft.approx!);
    expect(d).toBeGreaterThan(39);
    expect(d).toBeLessThan(151);
  });
});

import { emptyMilestone, totalAmount, validateMilestones, groupDeadline } from "../src/publish/draft";

describe("hitos y grupo en el borrador", () => {
  const m = (patch: Partial<ReturnType<typeof emptyMilestone>> = {}) => ({ name: "Pintar", amount: "50", criteria: "Dos manos", evidence: "Foto", ...patch });
  const withPlan = (items = [m(), m({ name: "Terminar", amount: "30" })], patch: Partial<Draft> = {}) => base({ useMilestones: true, milestones: items, amount: "", ...patch });

  it("el total sale de la suma de los hitos", () => {
    expect(totalAmount(withPlan())).toBe(80_000_000n);
    expect(totalAmount(base({ amount: "25" }))).toBe(25_000_000n);
    expect(totalAmount(withPlan([m(), m({ amount: "abc" })]))).toBeNull();
  });

  it("valida cantidad y datos de cada hito", () => {
    expect(validateMilestones(withPlan())).toEqual({});
    expect(validateMilestones(withPlan([m()])).milestones).toBeDefined();
    const bad = validateMilestones(withPlan([m({ name: "" }), m({ criteria: "" })]));
    expect(bad["m0.name"]).toBeDefined();
    expect(bad["m1.criteria"]).toBeDefined();
    expect(validateMilestones(withPlan([m({ amount: "0" }), m()]))["m0.amount"]).toBeDefined();
    expect(validateMilestones(base({ amount: "25" }))).toEqual({});
  });

  it("validatePrice acepta un plan correcto sin monto suelto y exige el mínimo sobre la suma", () => {
    expect(validatePrice(withPlan())).toEqual({});
    expect(validatePrice(withPlan([m({ amount: "0,3" }), m({ amount: "0,3" })])).amount).toBe("amountMin");
  });

  it("la ficha lleva los hitos en unidades mínimas ", () => {
    const spec = buildSpec(withPlan(), "nonce-12345", NOW);
    expect(spec.milestones).toEqual([
      { name: "Pintar", amount: "50000000", criteria: "Dos manos", evidence: "Foto" },
      { name: "Terminar", amount: "30000000", criteria: "Dos manos", evidence: "Foto" },
    ]);
    expect(spec).not.toHaveProperty("advance");
    expect(buildSpec(base(), "nonce-12345", NOW).milestones).toBeUndefined();
  });

  it("la ficha grupal lleva la meta y el plazo de aportes", () => {
    const spec = buildSpec(base({ kind: "group", fundingDays: 14, amount: "100" }), "nonce-12345", NOW);
    expect(spec.group).toEqual({ target: "100000000", fundingDeadline: groupDeadline(14, NOW) });
    expect(groupDeadline(1, 0)).toBe(86400);
  });
});

describe("materiales", () => {
  const plan2 = [
    { name: "A", amount: "50", criteria: "Criterio", evidence: "Foto" },
    { name: "B", amount: "30", criteria: "Criterio", evidence: "Foto" },
  ];
  it("sin elegir, los compra quien publica", () => {
    expect(buildSpec(base({ useMilestones: true, milestones: plan2, amount: "" }), "nonce-12345", NOW).materials).toBe("payer");
    expect(buildSpec(base({ useMilestones: true, milestones: plan2, amount: "", materials: "worker" }), "nonce-12345", NOW).materials).toBe("worker");
    expect(buildSpec(base(), "nonce-12345", NOW).materials).toBeUndefined();
  });
});
