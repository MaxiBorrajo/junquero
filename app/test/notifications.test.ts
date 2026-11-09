import { describe, expect, it } from "vitest";
import { notificationText } from "../src/lib/notificationText";
import { routeForNotification } from "../src/push/routes";

describe("textos de notificaciones", () => {
  it("tiene título y cuerpo para cada tipo que manda el servidor y uno genérico para los desconocidos", () => {
    for (const kind of ["application_new", "agreement_proposed", "agreed", "chat", "delivered", "cancelled", "settled", "reminder_start", "release_ready", "dispute_opened", "jury_drawn", "jury_deadline", "selfie_approved", "selfie_rejected"]) {
      const text = notificationText(kind);
      expect(text.title.length).toBeGreaterThan(3);
      expect(text.body.length).toBeGreaterThan(3);
    }
    expect(notificationText("algo_nuevo").title).toBe("Novedad");
  });

  it("cada tipo lleva a una pantalla", () => {
    expect(routeForNotification("agreement_proposed", "12").pathname).toBe("/agreement/[orderId]");
    expect(routeForNotification("settled", "7").pathname).toBe("/order/[orderId]");
  });
});
