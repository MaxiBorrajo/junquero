import type { Changa, MyApplication } from "../api/types";

// Trabajos en curso: ya acordados y todavía sin cerrar. Los cerrados y los cancelados no van en la agenda.
export const ACTIVE_STATUSES = ["agreed", "delivered", "disputed"] as const;
const isActive = (status: string): boolean => (ACTIVE_STATUSES as readonly string[]).includes(status);

export type AgendaRole = "payer" | "payee";
export type AgendaSection = "overdue" | "today" | "upcoming" | "undated";

export interface AgendaItem {
  orderId: number;
  title: string;
  role: AgendaRole;
  status: string;
  startsAt: number | null;
  amount: string | null;
  remote: boolean;
}

export interface AgendaGroup {
  section: AgendaSection;
  items: AgendaItem[];
}

const SECTIONS: AgendaSection[] = ["overdue", "today", "upcoming", "undated"];
const DAY = 24 * 3600;

const dayStart = (seconds: number): number => {
  const date = new Date(seconds * 1000);
  return Math.floor(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 1000);
};

// Une lo que publiqué y lo que me eligieron para hacer, en un solo listado de trabajos en curso.
export function agendaItems(published: Changa[], applied: MyApplication[]): AgendaItem[] {
  const items = new Map<number, AgendaItem>();
  for (const changa of applied) {
    const { changa: job } = changa;
    if (changa.status !== "chosen" || job.orderId === null || !isActive(job.status)) continue;
    items.set(job.orderId, { orderId: job.orderId, title: job.title, role: "payee", status: job.status, startsAt: job.when, amount: job.amount, remote: job.modality === "remote" });
  }
  for (const changa of published) {
    if (changa.orderId === null || !isActive(changa.status)) continue;
    items.set(changa.orderId, { orderId: changa.orderId, title: changa.spec.title, role: "payer", status: changa.status, startsAt: changa.spec.startsAt ?? null, amount: changa.amount, remote: changa.spec.modality === "remote" });
  }
  return [...items.values()];
}

// Ordena por día: atrasados (de días anteriores y sin cerrar), hoy, próximos y sin fecha fija. Dentro de cada grupo, por hora.
export function buildAgenda(items: AgendaItem[], nowSeconds: number): AgendaGroup[] {
  const today = dayStart(nowSeconds);
  const sectionOf = (item: AgendaItem): AgendaSection => {
    if (item.startsAt === null || item.startsAt === 0) return "undated";
    if (item.startsAt < today) return "overdue";
    if (item.startsAt < today + DAY) return "today";
    return "upcoming";
  };
  const groups = new Map<AgendaSection, AgendaItem[]>();
  for (const item of items) groups.set(sectionOf(item), [...(groups.get(sectionOf(item)) ?? []), item]);
  return SECTIONS.filter((section) => groups.has(section)).map((section) => ({
    section,
    items: groups.get(section)!.slice().sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0) || a.orderId - b.orderId),
  }));
}

export interface ClosedJob {
  orderId: number;
  title: string;
  role: AgendaRole;
  amount: string | null;
  closedAt: number | null;
}

// Los trabajos ya cerrados y pagados en los que participé, como quien publicó o como quien lo hizo. Los que se cerraron más recientemente primero; si falta la fecha, por número de pedido.
export function closedJobs(published: Changa[], applied: MyApplication[]): ClosedJob[] {
  const jobs = new Map<number, ClosedJob>();
  for (const application of applied) {
    const { changa: job } = application;
    if (application.status !== "chosen" || job.orderId === null || job.status !== "settled") continue;
    jobs.set(job.orderId, { orderId: job.orderId, title: job.title, role: "payee", amount: job.amount, closedAt: job.closedAt ?? null });
  }
  for (const changa of published) {
    if (changa.orderId === null || changa.status !== "settled") continue;
    jobs.set(changa.orderId, { orderId: changa.orderId, title: changa.spec.title, role: "payer", amount: changa.amount, closedAt: changa.closedAt ?? null });
  }
  return [...jobs.values()].sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0) || b.orderId - a.orderId);
}
