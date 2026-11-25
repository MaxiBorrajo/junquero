// La imagen de un comprobante (el NFT) como SVG. Es una función pura: la usan la app (para mostrarlo) y el servidor (para el enlace que ven
// las billeteras), así los dos dibujan lo mismo. No incluye fotos del trabajo: la evidencia está cifrada entre las partes y no puede ser pública.

// Minimal claro (fondo crema) u oscuro (fondo del tono oscuro del rubro, con letras crema y arena).
import { REEDS } from "./reeds";

export type CardStyle = "minimal" | "oscuro";
// El estilo que usan la app y el servidor.
export const DEFAULT_STYLE: CardStyle = "oscuro";
export const CARD_STYLES: readonly CardStyle[] = ["minimal", "oscuro"];

export interface CardData {
  orderId: number;
  title: string;
  category: number;
  categoryName: string;
  remote: boolean;
  // 1 a 5.
  rating: number;
  // Año y mes juntos, por ejemplo 202611.
  month: number;
  // Nombre público de quien calificó (opcional).
  payerName?: string | null;
}

export interface CardFonts {
  regular: string;
  bold: string;
}

export const WEB_FONTS: CardFonts = { regular: "Helvetica, Arial, sans-serif", bold: "Helvetica, Arial, sans-serif" };

export const CARD_WIDTH = 600;
export const CARD_HEIGHT = 800;

const INK = "#231815";
const BACKGROUND = "#F4EEE6";
const SAND = "#E7C98B";
const MUTED = "#6B5C57";
const LINE = "#D9CDBE";

// Un color por rubro (el orden es el de `t.publish.categories`). `base` es el fondo; `deep` el tono más oscuro de los juncos.
const PALETTE = [
  { base: "#8F2F22", deep: "#5E1D14" }, // Hogar
  { base: "#2F6B3A", deep: "#1C4524" }, // Jardín
  { base: "#2B5B84", deep: "#183A57" }, // Mudanzas
  { base: "#2A7F7A", deep: "#195450" }, // Limpieza
  { base: "#B5651D", deep: "#7A410E" }, // Oficios
  { base: "#3F4A9A", deep: "#262E66" }, // Tecnología
  { base: "#9B2F6B", deep: "#661C45" }, // Diseño
  { base: "#7A5A1E", deep: "#4D3810" }, // Traducción
  { base: "#5A4A45", deep: "#352B28" }, // Otros
] as const;

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const paletteOf = (category: number) => PALETTE[category] ?? PALETTE[PALETTE.length - 1]!;

export function monthLabel(month: number): string {
  const year = Math.floor(month / 100);
  const index = (month % 100) - 1;
  return MONTHS[index] ? `${MONTHS[index]} ${year}` : String(month);
}

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Parte un texto en renglones de a lo sumo `maxChars` letras; si sobra, el último termina en puntos suspensivos.
export function wrap(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines.map((line) => (line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line));
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1]!;
  kept[maxLines - 1] = `${last.length >= maxChars ? last.slice(0, maxChars - 1) : last}…`;
  return kept;
}

function text(value: string, x: number, y: number, size: number, fill: string, font: string, weight: "400" | "700", extra = ""): string {
  return `<text x="${x}" y="${y}" font-size="${size}" font-family="${font}" font-weight="${weight}" fill="${fill}" ${extra}>${escape(value)}</text>`;
}

function lines(values: string[], x: number, y: number, step: number, size: number, fill: string, font: string, anchor: "start" | "middle" = "start"): string {
  return values.map((line, i) => text(line, x, y + i * step, size, fill, font, "700", `text-anchor="${anchor}"`)).join("");
}

function minimalCard(d: CardData, fonts: CardFonts, dark: boolean): string {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 17, 3);
  // En el oscuro el fondo es el tono profundo del rubro; los juncos negros quedan tono sobre tono.
  const paper = dark ? c.deep : BACKGROUND;
  const ink = dark ? BACKGROUND : INK;
  const accent = dark ? SAND : c.base;
  const quiet = dark ? LINE : MUTED;
  const reeds = dark ? 0.5 : REEDS_OPACITY;
  return [
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${paper}"/>`,
    reedsGroup(reeds, dark ? "#000000" : INK),
    `<rect width="18" height="${CARD_HEIGHT}" fill="${dark ? SAND : c.base}"/>`,
    lines(title, 64, 170, 64, 54, ink, fonts.bold),
    text(`${d.rating}`, 60, 560, 220, accent, fonts.bold, "700"),
    text("/ 5", 210, 560, 64, accent, fonts.regular, "400"),
    text(`${d.categoryName} · ${d.remote ? "a distancia" : "presencial"} · ${monthLabel(d.month)}`, 64, 626, 26, quiet, fonts.regular, "400"),
    d.payerName ? text(`Calificó ${d.payerName}`, 64, 672, 26, ink, fonts.regular, "400") : "",
    text("junquero", 64, 742, 34, accent, fonts.bold, "700"),
    text(`#${d.orderId}`, 560, 742, 26, quiet, fonts.regular, "400", 'text-anchor="end"'),
  ].join("");
}

// Los juncos van abajo, detrás del texto, escalados para cubrir el ancho (se recortan un poco los costados) y semitransparentes.
const REEDS_SCALE = 2.3;
const REEDS_OPACITY = 0.2;

function reedsGroup(opacity: number, fill: string): string {
  const width = REEDS.width * REEDS_SCALE;
  const height = REEDS.height * REEDS_SCALE;
  const x = (CARD_WIDTH - width) / 2;
  const y = CARD_HEIGHT - height;
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${REEDS_SCALE})" opacity="${opacity}"><path d="${REEDS.path}" fill="${fill}"/></g>`;
}

export function receiptCardSvg(data: CardData, style: CardStyle = DEFAULT_STYLE, fonts: CardFonts = WEB_FONTS): string {
  const rating = Math.min(5, Math.max(0, Math.round(data.rating)));
  const body = minimalCard({ ...data, rating }, fonts, style === "oscuro");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">${body}</svg>`;
}
