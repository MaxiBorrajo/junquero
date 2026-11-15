// Cuánto esperar antes de volver a abrir el socket del chat: 1 s, 2 s, 4 s... hasta un máximo de 30 s.
export const reconnectDelay = (attempt: number): number => Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt));
