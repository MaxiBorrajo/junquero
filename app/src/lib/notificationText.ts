const TEXTS: Record<string, { title: string; body: string }> = {
  application_new: { title: "Nueva postulación", body: "Un junquero se postuló a tu trabajo." },
  agreement_proposed: { title: "Te eligieron", body: "Te eligieron para un trabajo. Confirmá el acuerdo." },
  agreed: { title: "Changa acordada", body: "Quedó acordada. Abrí la changa para ver los detalles." },
  chat: { title: "Mensaje nuevo", body: "Tenés un mensaje nuevo." },
  delivered: { title: "Entrega registrada", body: "Revisá el trabajo: si no respondés a tiempo, se aprueba solo." },
  cancelled: { title: "Changa cancelada", body: "Una de tus changas fue cancelada." },
  settled: { title: "Pago liberado", body: "Se liberó el pago de una changa." },
  reminder_start: { title: "Tu changa es pronto", body: "Tenés una changa en una hora." },
  release_ready: { title: "Aprobaron tu trabajo", body: "Ya podés cobrar. Confirmalo en la changa." },
  dispute_opened: { title: "Abrieron un reclamo", body: "Tenés un plazo limitado para responder." },
  jury_drawn: { title: "Te sortearon como jurado", body: "Tenés plazos para actuar." },
  jury_deadline: { title: "Plazo de jurado por vencer", body: "Si no actuás a tiempo podés perder tu depósito." },
  selfie_approved: { title: "Verificación aprobada", body: "Ya podés postularte a changas." },
  selfie_rejected: { title: "Revisá tu selfie", body: "No pudimos verificarla. Probá de nuevo con buena luz." },
};

export const notificationText = (kind: string): { title: string; body: string } => TEXTS[kind] ?? { title: "Novedad", body: "Tenés una novedad." };
