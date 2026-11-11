const TEXTS: Record<string, { title: string; body: string }> = {
  application_new: { title: "Nueva postulación", body: "Un junquero se postuló a tu trabajo." },
  agreement_proposed: { title: "Te eligieron", body: "Te eligieron para un trabajo. Confirmá el acuerdo." },
  published: { title: "Trabajo publicado", body: "Tu trabajo ya está confirmado y aparece en el mapa." },
  group_published: { title: "Trabajo grupal publicado", body: "Tu trabajo grupal ya puede recibir aportes. Compartilo para juntar la meta." },
  agreed: { title: "Trabajo acordado", body: "Quedó acordado. Abrí el trabajo para ver los detalles." },
  chat: { title: "Mensaje nuevo", body: "Tenés un mensaje nuevo." },
  delivered: { title: "Entrega registrada", body: "Revisá el trabajo: si no respondés a tiempo, se aprueba solo." },
  cancelled: { title: "Trabajo cancelado", body: "Uno de tus trabajos fue cancelado." },
  settled: { title: "Pago liberado", body: "Se liberó el pago de un trabajo." },
  reminder_start: { title: "Tu trabajo es pronto", body: "Tenés un trabajo en una hora." },
  release_ready: { title: "Aprobaron tu trabajo", body: "Ya podés cobrar. Confirmalo en el trabajo." },
  dispute_opened: { title: "Abrieron un reclamo", body: "Tenés un plazo limitado para responder." },
  jury_drawn: { title: "Te sortearon como jurado", body: "Tenés plazos para actuar." },
  jury_deadline: { title: "Plazo de jurado por vencer", body: "Si no actuás a tiempo podés perder tu depósito." },
  selfie_approved: { title: "Verificación aprobada", body: "Ya podés postularte a trabajos." },
  selfie_rejected: { title: "Revisá tu selfie", body: "No pudimos verificarla. Probá de nuevo con buena luz." },
};

export const notificationText = (kind: string): { title: string; body: string } => TEXTS[kind] ?? { title: "Novedad", body: "Tenés una novedad." };
