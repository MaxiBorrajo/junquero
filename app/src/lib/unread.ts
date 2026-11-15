import type { ChatSummary } from "../api/types";

// Cantidad de chats con mensajes sin leer (para el número de la pestaña).
export const countUnreadChats = (chats: ChatSummary[] | undefined): number => (chats ?? []).filter((chat) => chat.unreadCount > 0).length;
