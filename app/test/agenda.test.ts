import { describe, expect, it } from "vitest";
import type { Changa, MyApplication } from "../src/api/types";
import { agendaItems, buildAgenda, closedJobs } from "../src/lib/agenda";
import { applicationView } from "../src/lib/applicationState";

const at = (day: number, hour: number): number => Math.floor(new Date(2026, 10, day, hour, 0, 0).getTime() / 1000);
const NOW = at(16, 10);

const published = (orderId: number | null, status: string, startsAt?: number, modality: "onsite" | "remote" = "onsite"): Changa => ({
  id: orderId ?? 0,
  owner: "0xaa",
  specHash: `h${orderId}`,
  spec: { v: 1, title: `Publicado ${orderId}`, description: "", category: 0, modality, nonce: "n", evidence: [], attachments: [], ...(startsAt === undefined ? {} : { startsAt }) },
  orderId,
  token: null,
  amount: "1000000",
  status,
  createdAt: 0,
});

const applied = (orderId: number | null, applicationStatus: MyApplication["status"], jobStatus: string, when: number | null): MyApplication => ({
  id: orderId ?? 0,
  changaId: 1,
  applicant: "0xbb",
  amount: null,
  message: "",
  attachments: [],
  status: applicationStatus,
  createdAt: 0,
  updatedAt: 0,
  changa: { specHash: `a${orderId}`, orderId, status: jobStatus, title: `Hago ${orderId}`, amount: "2000000", category: 0, modality: "onsite", when },
});

describe("agenda", () => {
  it("junta lo que publiqué y lo que me eligieron, solo si está en curso", () => {
    const items = agendaItems(
      [published(1, "agreed", at(16, 15)), published(2, "settled", at(15, 9)), published(3, "open"), published(null, "agreed")],
      [applied(4, "chosen", "agreed", at(17, 9)), applied(5, "chosen", "settled", at(14, 9)), applied(6, "active", "open", null), applied(7, "closed", "agreed", at(18, 9))],
    );
    expect(items.map((item) => [item.orderId, item.role]).sort()).toEqual([[1, "payer"], [4, "payee"]]);
  });

  it("separa atrasados, hoy, próximos y sin día fijo, ordenados por hora", () => {
    const items = agendaItems(
      [published(1, "agreed", at(16, 18)), published(2, "agreed", at(16, 9)), published(3, "delivered", at(14, 9)), published(4, "agreed", at(20, 8)), published(5, "agreed", undefined, "remote")],
      [applied(6, "chosen", "agreed", at(17, 7))],
    );
    const groups = buildAgenda(items, NOW);
    expect(groups.map((group) => group.section)).toEqual(["overdue", "today", "upcoming", "undated"]);
    expect(groups[1]!.items.map((item) => item.orderId)).toEqual([2, 1]);
    expect(groups[2]!.items.map((item) => item.orderId)).toEqual([6, 4]);
    expect(groups[3]!.items[0]!.remote).toBe(true);
  });

  it("sin trabajos en curso no hay grupos", () => {
    expect(buildAgenda(agendaItems([published(1, "settled", at(16, 9))], []), NOW)).toEqual([]);
  });
});

describe("estado de una postulación", () => {
  it("si ya cobró no dice que puede empezar", () => {
    expect(applicationView("chosen", "settled")).toBe("settled");
    expect(applicationView("chosen", "delivered")).toBe("delivered");
    expect(applicationView("chosen", "agreed")).toBe("inProgress");
    expect(applicationView("chosen", "disputed")).toBe("disputed");
    expect(applicationView("chosen", "cancelled")).toBe("cancelled");
  });

  it("mientras se confirma el acuerdo sigue como elegida", () => {
    expect(applicationView("chosen", "open")).toBe("chosen");
  });

  it("las no elegidas no cambian", () => {
    expect(applicationView("active", "open")).toBe("waiting");
    expect(applicationView("dismissed", "agreed")).toBe("dismissed");
    expect(applicationView("withdrawn", "open")).toBe("withdrawn");
    expect(applicationView("closed", "agreed")).toBe("closed");
  });
});

describe("trabajos cerrados", () => {
  it("junta lo que publiqué y lo que hice, solo si se cerró", () => {
    const jobs = closedJobs(
      [published(1, "settled"), published(2, "agreed"), published(3, "cancelled"), published(null, "settled")],
      [applied(4, "chosen", "settled", null), applied(5, "chosen", "agreed", null), applied(6, "closed", "settled", null)],
    );
    expect(jobs.map((job) => [job.orderId, job.role]).sort()).toEqual([[1, "payer"], [4, "payee"]]);
  });

  it("ordena por fecha de cierre, la más reciente primero", () => {
    const closedAt = (changa: Changa, seconds: number): Changa => ({ ...changa, closedAt: seconds });
    const mine = applied(4, "chosen", "settled", null);
    const jobs = closedJobs(
      [closedAt(published(1, "settled"), 1000), closedAt(published(2, "settled"), 3000)],
      [{ ...mine, changa: { ...mine.changa, closedAt: 2000 } }],
    );
    expect(jobs.map((job) => job.orderId)).toEqual([2, 4, 1]);
  });

  it("sin fecha de cierre, por número de pedido y después de los que tienen fecha", () => {
    const jobs = closedJobs([published(7, "settled"), published(9, "settled"), { ...published(3, "settled"), closedAt: 500 }], []);
    expect(jobs.map((job) => job.orderId)).toEqual([3, 9, 7]);
  });
});
