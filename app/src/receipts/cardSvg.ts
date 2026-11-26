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

const CREAM = "#F4EEE6";
const PAPER = "#FBF7F0";
const SAND = "#E7C98B";
const LINE = "#D9CDBE";
const INK = "#231815";
const MUTED = "#6B5C57";

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

// Los juncos (un trazo vectorial) con su borde de abajo a la izquierda en (x, y), a la escala dada.
function reeds(x: number, y: number, scale: number, fill: string, opacity: number): string {
  return `<g transform="translate(${x.toFixed(1)} ${(y - REEDS.height * scale).toFixed(1)}) scale(${scale})" opacity="${opacity}"><path d="${REEDS.path}" fill="${fill}"/></g>`;
}

const kind = (d: CardData) => (d.remote ? "a distancia" : "presencial");
const meta = (d: CardData) => `${d.categoryName} · ${kind(d)} · ${monthLabel(d.month)}`;

// Generador de números al azar con semilla: el mismo trabajo dibuja siempre lo mismo.
function seeded(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Composition {
  defs: string;
  body: string;
}

// Las esquinas redondeadas van dibujadas en la propia imagen (también la ven las billeteras); en la app se usa el mismo radio, proporcional al ancho.
export const CARD_RADIUS = 44;
export const cornerRadius = (width: number): number => (width * CARD_RADIUS) / CARD_WIDTH;

// Las esquinas redondeadas van dibujadas en la propia imagen: se recorta todo con este rectángulo.
const framed = (body: string, defs = ""): Composition => ({
  defs: `<clipPath id="redondeo"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${CARD_RADIUS}"/></clipPath>${defs}`,
  body: `<g clip-path="url(#redondeo)">${body}</g>`,
});

const credit = (d: CardData): string => (d.payerName ? `Calificó ${d.payerName}` : "");

// Cinco composiciones minimalistas: una sola idea fuerte cada una, mucho aire y el color del rubro como único acento.

// 1. Tipográfica: la nota es un número gigante que se sale de la tarjeta; el resto es un texto chico y ordenado.
function tipografica(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 17, 3);
  return framed(
    [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${PAPER}"/>`,
      text(`${d.rating}`, 676, 846, 660, c.base, f.bold, "700", 'text-anchor="end"'),
      text(`JUNQUERO · #${d.orderId}`, 56, 84, 20, MUTED, f.bold, "700", 'letter-spacing="6"'),
      lines(title, 56, 168, 58, 50, INK, f.bold),
      `<line x1="56" y1="${190 + (title.length - 1) * 58}" x2="136" y2="${190 + (title.length - 1) * 58}" stroke="${c.base}" stroke-width="5"/>`,
      text(`${d.categoryName} · ${kind(d)}`, 56, 252 + (title.length - 1) * 58, 24, MUTED, f.regular, "400"),
      text(monthLabel(d.month), 56, 286 + (title.length - 1) * 58, 24, MUTED, f.regular, "400"),
      credit(d) ? text(credit(d), 56, 320 + (title.length - 1) * 58, 24, INK, f.regular, "400") : "",
    ].join(""),
  );
}

// 2. Espiga: una sola espiga de junco, dibujada con línea, y todo el aire del fondo oscuro. La nota son cinco puntos.
function espiga(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 14, 3);
  const top = 400;
  const metaY = top + (title.length - 1) * 60 + 56;
  const dotsY = metaY + 50;
  const dots = Array.from({ length: 5 }, (_, i) => `<circle cx="${68 + i * 40}" cy="${dotsY}" r="11" fill="${i < d.rating ? SAND : "none"}" stroke="${SAND}" stroke-width="3" opacity="${i < d.rating ? 1 : 0.4}"/>`).join("");
  return framed(
    [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${c.deep}"/>`,
      `<path d="M 440 830 C 436 660, 454 500, 440 330" fill="none" stroke="${SAND}" stroke-width="7" stroke-linecap="round"/>`,
      `<path d="M 440 830 C 396 690, 338 590, 312 440" fill="none" stroke="${SAND}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>`,
      `<path d="M 440 830 C 478 690, 528 600, 552 500" fill="none" stroke="${SAND}" stroke-width="3" stroke-linecap="round" opacity="0.5"/>`,
      `<ellipse cx="440" cy="246" rx="27" ry="88" fill="${SAND}"/>`,
      `<line x1="440" y1="158" x2="440" y2="104" stroke="${SAND}" stroke-width="4" stroke-linecap="round"/>`,
      lines(title, 56, top, 60, 52, CREAM, f.bold),
      text(`${d.categoryName} · ${kind(d)}`, 56, metaY, 24, LINE, f.regular, "400"),
      dots,
      text(`${monthLabel(d.month)}${credit(d) ? ` · ${credit(d)}` : ""}`, 56, dotsY + 52, 22, LINE, f.regular, "400"),
      text(`junquero · #${d.orderId}`, 56, 764, 20, SAND, f.regular, "400"),
    ].join(""),
  );
}

// 3. Círculo: un círculo del color del rubro con la nota adentro, y el título abajo. Casi sin nada más.
function circulo(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 14, 3);
  return framed(
    [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${PAPER}"/>`,
      `<circle cx="400" cy="260" r="178" fill="${c.base}"/>`,
      text(`${d.rating}`, 400, 336, 220, CREAM, f.bold, "700", 'text-anchor="middle"'),
      text("de 5", 400, 392, 28, SAND, f.regular, "400", 'text-anchor="middle" letter-spacing="4"'),
      `<line x1="56" y1="500" x2="136" y2="500" stroke="${c.base}" stroke-width="5"/>`,
      lines(title, 56, 572, 58, 50, INK, f.bold),
      text(`${d.categoryName} · ${kind(d)} · ${monthLabel(d.month)}`, 56, 742, 22, MUTED, f.regular, "400"),
      text(`${credit(d) ? `${credit(d)} · ` : ""}junquero #${d.orderId}`, 56, 772, 20, MUTED, f.regular, "400"),
    ].join(""),
  );
}

// 4. Horizonte: dos bloques de color, uno oscuro y uno claro, con los juncos del mismo tono parados sobre la línea que los separa.
function horizonte(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 17, 3);
  return framed(
    [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${PAPER}"/>`,
      `<rect width="${CARD_WIDTH}" height="500" fill="${c.deep}"/>`,
      reeds(0, 500, 1.45, c.base, 0.7),
      lines(title, 56, 130, 62, 54, CREAM, f.bold),
      text(`${d.rating}`, 52, 706, 200, c.base, f.bold, "700"),
      text("/ 5", 190, 706, 54, MUTED, f.regular, "400"),
      text(d.categoryName, 544, 600, 26, INK, f.bold, "700", 'text-anchor="end"'),
      text(kind(d), 544, 636, 22, MUTED, f.regular, "400", 'text-anchor="end"'),
      text(monthLabel(d.month), 544, 668, 22, MUTED, f.regular, "400", 'text-anchor="end"'),
      credit(d) ? text(credit(d), 544, 700, 22, MUTED, f.regular, "400", 'text-anchor="end"') : "",
      text(`junquero · #${d.orderId}`, 544, 764, 20, c.base, f.regular, "400", 'text-anchor="end"'),
    ].join(""),
  );
}

// 5. Regla: la nota como un punto sobre una escala del 1 al 5. El gráfico es el diseño.
function regla(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 16, 3);
  const x = (n: number) => 76 + (n - 1) * 112;
  const ticks = [1, 2, 3, 4, 5].map((n) => `<line x1="${x(n)}" y1="500" x2="${x(n)}" y2="${n === d.rating ? 480 : 490}" stroke="${INK}" stroke-width="3"/>${text(`${n}`, x(n), 540, 22, n === d.rating ? c.base : MUTED, f.bold, "700", 'text-anchor="middle"')}`).join("");
  return framed(
    [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${PAPER}"/>`,
      `<rect x="0" y="0" width="${CARD_WIDTH}" height="18" fill="${c.base}"/>`,
      text(`JUNQUERO · #${d.orderId}`, 56, 92, 20, MUTED, f.bold, "700", 'letter-spacing="6"'),
      lines(title, 56, 176, 60, 52, INK, f.bold),
      `<line x1="${x(1)}" y1="500" x2="${x(5)}" y2="500" stroke="${INK}" stroke-width="3"/>`,
      ticks,
      `<circle cx="${x(d.rating)}" cy="500" r="20" fill="${c.base}"/>`,
      text(`${d.rating}`, 56, 440, 150, c.base, f.bold, "700", "").replace('x="56"', 'x="52"'),
      text(`${d.categoryName} · ${kind(d)}`, 56, 640, 24, INK, f.regular, "400"),
      text(`${monthLabel(d.month)}${credit(d) ? ` · ${credit(d)}` : ""}`, 56, 676, 24, MUTED, f.regular, "400"),
      text("junquero", 56, 764, 30, c.base, f.bold, "700"),
      text(`#${d.orderId}`, 544, 764, 22, MUTED, f.regular, "400", 'text-anchor="end"'),
    ].join(""),
  );
}

export type CardShape = "tipografica" | "espiga" | "circulo" | "horizonte" | "regla";
export const CARD_SHAPES: readonly CardShape[] = ["tipografica", "espiga", "circulo", "horizonte", "regla"];
export const DEFAULT_SHAPE: CardShape = "tipografica";

const COMPOSITIONS: Record<CardShape, (d: CardData, f: CardFonts) => Composition> = { tipografica, espiga, circulo, horizonte, regla };

export function receiptCardSvg(data: CardData, fonts: CardFonts = WEB_FONTS, shape: CardShape = DEFAULT_SHAPE): string {
  const rating = Math.min(5, Math.max(0, Math.round(data.rating)));
  const { defs, body } = COMPOSITIONS[shape]({ ...data, rating }, fonts);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}
