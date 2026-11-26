// La imagen de un comprobante (el NFT) como SVG. Es una función pura: la usan la app (para mostrarlo) y el servidor (para el enlace que ven
// las billeteras), así los dos dibujan lo mismo. No incluye fotos del trabajo: la evidencia está cifrada entre las partes y no puede ser pública.

import { REEDS } from "./reeds";

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

const BACKGROUND = "#F4EEE6";
const SAND = "#E7C98B";
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

// La versión compacta es para verla chica (la grilla): solo el título y la nota, grandes. El resto se ve al entrar.
function compactBody(d: CardData, fonts: CardFonts, shift: number): string {
  const title = wrap(d.title || "Changa", 13, 4);
  return [
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${paletteOf(d.category).deep}"/>`,
    reedsGroup(REEDS_OPACITY, "#000000"),
    `<rect width="26" height="${CARD_HEIGHT}" fill="${SAND}"/>`,
    lines(title, 76, 170 + shift, 84, 72, BACKGROUND, fonts.bold),
    text(`${d.rating}`, 70, 740, 300, SAND, fonts.bold, "700"),
    text("/ 5", 270, 740, 100, SAND, fonts.regular, "400"),
  ].join("");
}

function cardBody(d: CardData, fonts: CardFonts, shift: number): string {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 17, 3);
  // Fondo en el tono profundo del rubro, letras crema y arena; los juncos negros quedan tono sobre tono.
  const paper = c.deep;
  const ink = BACKGROUND;
  const accent = SAND;
  const quiet = LINE;
  return [
    `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${paper}"/>`,
    reedsGroup(REEDS_OPACITY, "#000000"),
    `<rect width="18" height="${CARD_HEIGHT}" fill="${SAND}"/>`,
    lines(title, 64, 170 + shift, 64, 54, ink, fonts.bold),
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
const REEDS_OPACITY = 0.5;

function reedsGroup(opacity: number, fill: string): string {
  const width = REEDS.width * REEDS_SCALE;
  const height = REEDS.height * REEDS_SCALE;
  const x = (CARD_WIDTH - width) / 2;
  const y = CARD_HEIGHT - height;
  return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${REEDS_SCALE})" opacity="${opacity}"><path d="${REEDS.path}" fill="${fill}"/></g>`;
}

// La silueta de la tarjeta. Todas parten del mismo rectángulo de 600 por 800 y le quitan o le agregan algo.
export type CardShape = "rectangulo" | "arco" | "ticket" | "sello" | "chapa";
export const CARD_SHAPES: readonly CardShape[] = ["rectangulo", "arco", "ticket", "sello", "chapa"];
export const DEFAULT_SHAPE: CardShape = "ticket";

interface ShapeParts {
  // Lo que va dentro de <defs> (el recorte o la máscara) y cómo se aplica al contenido.
  defs: string;
  apply: string;
  // Lo que se dibuja encima del contenido (la perforación del ticket, el aro de la chapa).
  decor: string;
  // Cuánto se baja el título para que no lo corte la silueta.
  shift: number;
}

const sharedCuts = (): string => {
  let circles = "";
  for (let i = 0; i < 15; i += 1) circles += `<circle cx="${20 + i * 40}" cy="0" r="12" fill="#000"/><circle cx="${20 + i * 40}" cy="${CARD_HEIGHT}" r="12" fill="#000"/>`;
  for (let j = 0; j < 20; j += 1) circles += `<circle cx="0" cy="${20 + j * 40}" r="12" fill="#000"/><circle cx="${CARD_WIDTH}" cy="${20 + j * 40}" r="12" fill="#000"/>`;
  return circles;
};

function shapeParts(shape: CardShape): ShapeParts {
  switch (shape) {
    case "arco":
      // Una ventana con la parte de arriba redonda.
      return { defs: `<clipPath id="forma"><path d="M0 800 L0 300 A300 300 0 0 1 600 300 L600 800 Z"/></clipPath>`, apply: 'clip-path="url(#forma)"', decor: "", shift: 70 };
    case "ticket":
      // Una entrada: muescas a los costados y una línea de puntos para cortar.
      return {
        defs: `<clipPath id="forma"><path d="M0 0 H600 V554 A36 36 0 0 0 600 626 V800 H0 V626 A36 36 0 0 0 0 554 Z"/></clipPath>`,
        apply: 'clip-path="url(#forma)"',
        decor: `<line x1="56" y1="590" x2="544" y2="590" stroke="${SAND}" stroke-opacity="0.55" stroke-width="3" stroke-dasharray="14 12"/>`,
        shift: 0,
      };
    case "sello":
      // Un sello postal: el borde perforado.
      return { defs: `<mask id="forma" maskUnits="userSpaceOnUse" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#fff"/>${sharedCuts()}</mask>`, apply: 'mask="url(#forma)"', decor: "", shift: 14 };
    case "chapa":
      // Una chapa para colgar: esquinas redondas y un agujero arriba.
      return {
        defs: `<clipPath id="forma"><path clip-rule="evenodd" d="M64 0 H536 A64 64 0 0 1 600 64 V736 A64 64 0 0 1 536 800 H64 A64 64 0 0 1 0 736 V64 A64 64 0 0 1 64 0 Z M272 64 A28 28 0 1 0 328 64 A28 28 0 1 0 272 64 Z"/></clipPath>`,
        apply: 'clip-path="url(#forma)"',
        decor: `<circle cx="300" cy="64" r="34" fill="none" stroke="${SAND}" stroke-width="6"/>`,
        shift: 74,
      };
    default:
      return { defs: "", apply: "", decor: "", shift: 0 };
  }
}

export function receiptCardSvg(data: CardData, fonts: CardFonts = WEB_FONTS, compact = false, shape: CardShape = DEFAULT_SHAPE): string {
  const rating = Math.min(5, Math.max(0, Math.round(data.rating)));
  const parts = shapeParts(shape);
  const body = compact ? compactBody({ ...data, rating }, fonts, parts.shift) : cardBody({ ...data, rating }, fonts, parts.shift);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">${parts.defs ? `<defs>${parts.defs}</defs>` : ""}<g ${parts.apply}>${body}${parts.decor}</g></svg>`;
}
