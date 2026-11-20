import { describe, expect, it } from "vitest";
import { notificationText } from "../src/lib/notificationText";
import { routeForNotification } from "../src/push/routes";

describe("textos de notificaciones", () => {
  it("tiene título y cuerpo para cada tipo que manda el servidor y uno genérico para los desconocidos", () => {
    for (const kind of ["application_new", "published", "group_published", "agreement_proposed", "agreed", "chat", "delivered", "cancelled", "settled", "reminder_start", "release_ready", "dispute_opened", "dispute_resolved", "dispute_small", "jury_open", "jury_reveal", "jury_drawn", "jury_deadline", "selfie_approved", "selfie_rejected"]) {
      const text = notificationText(kind);
      expect(text.title.length).toBeGreaterThan(3);
      expect(text.body.length).toBeGreaterThan(3);
    }
    expect(notificationText("algo_nuevo").title).toBe("Novedad");
  });

  it("las notificaciones de jurado abren la vista de jurado", () => {
    expect(routeForNotification("jury_open", "5").pathname).toBe("/jury-open");
    expect(routeForNotification("jury_reveal", "5:start").pathname).toBe("/jury-open");
    expect(routeForNotification("jury_stake_ready", "").pathname).toBe("/jury-stake");
    expect(routeForNotification("jury_drawn", "5").pathname).toBe("/jury/[caseId]");
  });

  it("cada tipo lleva a una pantalla", () => {
    expect(routeForNotification("agreement_proposed", "12").pathname).toBe("/agreement/[orderId]");
    expect(routeForNotification("settled", "7").pathname).toBe("/order/[orderId]");
  });
});
