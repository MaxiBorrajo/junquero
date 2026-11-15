// Detecta datos de contacto (teléfonos, mails, enlaces, usuarios de redes) antes de enviar un mensaje.
// El chat va cifrado: el servidor no puede leerlo, así que el control se hace en el celular.
export type ContactKind = "phone" | "email" | "link";

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/;
const LINK = /(https?:\/\/|www\.)\S+|\b(wa\.me|t\.me|bit\.ly|linktr\.ee|instagram\.com|facebook\.com|fb\.me|tiktok\.com)\S*/i;
const DOMAIN = /\b[a-z0-9-]{2,}\.(com|com\.ar|ar|net|org|me|io|app|link|ly|gl|co)\b/i;
const HANDLE = /(^|\s)@[a-z0-9_.]{3,}/i;
// Una secuencia de dígitos con espacios, guiones, puntos o paréntesis entre medio.
const DIGIT_RUN = /\+?\d[\d\s().-]{6,}\d/g;
const THOUSANDS = /^\d{1,3}([.,]\d{3})+$/;
const MIN_PHONE_DIGITS = 8;

export function detectContact(text: string): ContactKind | null {
  if (EMAIL.test(text)) return "email";
  if (LINK.test(text) || DOMAIN.test(text) || HANDLE.test(text)) return "link";
  for (const run of text.match(DIGIT_RUN) ?? []) {
    const trimmed = run.trim();
    if (THOUSANDS.test(trimmed)) continue;
    if (trimmed.replace(/\D/g, "").length >= MIN_PHONE_DIGITS) return "phone";
  }
  return null;
}
