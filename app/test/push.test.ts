import { describe, expect, it } from "vitest";
import { routeForNotification } from "../src/push/routes";

describe("rutas de las notificaciones", () => {
  it("abre la pantalla que corresponde a cada aviso", () => {
    expect(routeForNotification("application_new", "5")).toEqual({ pathname: "/applications/[changaId]", params: { changaId: "5" } });
    expect(routeForNotification("agreement_proposed", "9")).toEqual({ pathname: "/agreement/[orderId]", params: { orderId: "9" } });
    for (const kind of ["agreed", "delivered", "settled", "cancelled", "reminder_start"]) {
      expect(routeForNotification(kind, "12")).toEqual({ pathname: "/order/[orderId]", params: { orderId: "12" } });
    }
    expect(routeForNotification("chat", "3")).toEqual({ pathname: "/messages" });
    expect(routeForNotification("selfie_rejected", "0")).toEqual({ pathname: "/profile" });
    expect(routeForNotification("jury_drawn", "4")).toEqual({ pathname: "/jury/[caseId]", params: { caseId: "4" } });
    expect(routeForNotification("jury_deadline", "7:commit")).toEqual({ pathname: "/jury/[caseId]", params: { caseId: "7" } });
    expect(routeForNotification("dispute_opened", "3")).toEqual({ pathname: "/order/[orderId]", params: { orderId: "3" } });
  });

  it("ignora referencias inválidas", () => {
    expect(routeForNotification("agreed", "../../x")).toEqual({ pathname: "/map" });
    expect(routeForNotification("agreed", "")).toEqual({ pathname: "/map" });
  });
});

import { activeFilterCount, filtersQuery, noFilters, validateFilters } from "../src/lib/filters";

describe("filtros", () => {
  it("arma la consulta con montos en unidades mínimas", () => {
    expect(filtersQuery(noFilters())).toBe("");
    expect(filtersQuery({ category: 2, minAmount: "5", maxAmount: "25,5" })).toBe("category=2&minAmount=5000000&maxAmount=25500000");
    expect(filtersQuery({ category: 0, minAmount: "", maxAmount: "" })).toBe("category=0");
  });
  it("valida montos y orden", () => {
    expect(validateFilters({ category: null, minAmount: "10", maxAmount: "5" })).toBe(false);
    expect(validateFilters({ category: null, minAmount: "abc", maxAmount: "" })).toBe(false);
    expect(validateFilters({ category: null, minAmount: "5", maxAmount: "5" })).toBe(true);
    expect(validateFilters(noFilters())).toBe(true);
  });
  it("cuenta los filtros activos", () => {
    expect(activeFilterCount(noFilters())).toBe(0);
    expect(activeFilterCount({ category: 0, minAmount: "1", maxAmount: "" })).toBe(2);
  });
});
