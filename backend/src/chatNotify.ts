import type { Env } from "./env";

// Le avisa a los chats abiertos que hay algo nuevo en su historial. Es una señal liviana ({"t":"event"}): el celular
// vuelve a pedir lo que necesite. Nunca rompe a quien la llama: si el aviso falla, el celular se pone al día solo.
export async function notifyChat(env: Pick<Env, "CHAT">, applicationIds: number[]): Promise<void> {
  if (!env.CHAT) return;
  const unique = [...new Set(applicationIds.filter((id) => Number.isSafeInteger(id)))];
  await Promise.all(
    unique.map((id) =>
      env.CHAT.get(env.CHAT.idFromName(String(id)))
        .fetch("https://chat/notify", { method: "POST" })
        .catch(() => undefined),
    ),
  );
}

// Corre un trabajo que puede anotar hechos en el historial (el indexador, la limpieza de propuestas vencidas) y avisa
// a los chats que tuvieron novedades. `id` es autoincremental, así que alcanza con mirar lo que apareció después.
export async function withChatNotify<T>(env: Pick<Env, "CHAT" | "DB">, work: () => Promise<T>): Promise<T> {
  const before = await env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM chat_events").first<{ id: number }>();
  const result = await work();
  const { results } = await env.DB.prepare("SELECT DISTINCT application_id FROM chat_events WHERE id > ?").bind(before?.id ?? 0).all<{ application_id: number }>();
  if (results.length > 0) await notifyChat(env, results.map((row) => row.application_id));
  return result;
}
