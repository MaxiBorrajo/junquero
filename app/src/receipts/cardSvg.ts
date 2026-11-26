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

// La composición tipográfica: la nota es un número gigante que se sale de la tarjeta; el resto es un texto chico y ordenado.
// "original" es la de siempre; las demás son variantes de esa misma idea que suman los juncos de distintas maneras.
type Variante = "original" | "alpie" | "desvanece" | "dentro" | "brotan" | "esquina" | "espiga" | "oscura";

// Una sola espiga de junco, dibujada con trazo y relleno, parada al costado del número.
function unaEspiga(x: number, color: string): string {
  return [
    `<path d="M ${x} 840 C ${x - 4} 760, ${x + 10} 690, ${x} 610" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`,
    `<path d="M ${x} 840 C ${x - 44} 770, ${x - 96} 700, ${x - 112} 620" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>`,
    `<ellipse cx="${x}" cy="540" rx="24" ry="74" fill="${color}"/>`,
    `<line x1="${x}" y1="466" x2="${x}" y2="418" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`,
  ].join("");
}

function tipografica(d: CardData, f: CardFonts, v: Variante): Composition {
  const c = paletteOf(d.category);
  const dark = v === "oscura";
  const paper = dark ? c.deep : PAPER;
  const ink = dark ? CREAM : INK;
  const quiet = dark ? LINE : MUTED;
  const accent = dark ? SAND : c.base;
  const title = wrap(d.title || "Changa", 17, 3);
  const drop = (title.length - 1) * 58;
  const numeral = (fill: string, extra = "") => text(`${d.rating}`, 676, 846, 660, fill, f.bold, "700", `text-anchor="end" ${extra}`);
  let defs = "";
  let detras = "";
  let delante = "";
  if (v === "alpie") detras = reeds(0, 800, 1.45, c.deep, 0.3);
  else if (v === "oscura") delante = reeds(0, 800, 1.45, "#000000", 0.4);
  else if (v === "brotan") delante = reeds(0, 806, 1.45, c.base, 1);
  else if (v === "desvanece") {
    // Los juncos de "al pie" (mismo color y opacidad) pero más grandes, que se van desvaneciendo a medida que se acercan al número.
    defs = `<linearGradient id="desvanece" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="0.3" stop-color="#fff"/><stop offset="0.78" stop-color="#000"/></linearGradient><mask id="hastaelnumero" maskUnits="userSpaceOnUse" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#desvanece)"/></mask>`;
    detras = `<g mask="url(#hastaelnumero)">${reeds(-30, 800, 2.2, c.deep, 0.3)}</g>`;
  } else if (v === "esquina") {
    // Los juncos nacen en la esquina de abajo a la izquierda y se van desvaneciendo hacia el número.
    defs = `<linearGradient id="desvanece" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="esquina" maskUnits="userSpaceOnUse" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"><rect x="0" y="0" width="470" height="${CARD_HEIGHT}" fill="url(#desvanece)"/></mask>`;
    detras = `<g mask="url(#esquina)">${reeds(-30, 800, 1.3, c.base, 0.6)}</g>`;
  }
  else if (v === "espiga") delante = unaEspiga(150, c.base);
  else if (v === "dentro") {
    // Los juncos oscuros solo se ven adentro del número: la máscara es el propio número.
    defs = `<mask id="adentro" maskUnits="userSpaceOnUse" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">${numeral("#fff")}</mask>`;
    delante = `<g mask="url(#adentro)">${reeds(-150, 846, 3.1, c.deep, 1)}</g>`;
  }
  return framed(
    [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${paper}"/>`,
      detras,
      numeral(dark ? SAND : c.base),
      delante,
      text(`JUNQUERO · #${d.orderId}`, 56, 84, 20, quiet, f.bold, "700", 'letter-spacing="6"'),
      lines(title, 56, 168, 58, 50, ink, f.bold),
      `<line x1="56" y1="${190 + drop}" x2="136" y2="${190 + drop}" stroke="${accent}" stroke-width="5"/>`,
      text(`${d.categoryName} · ${kind(d)}`, 56, 252 + drop, 24, quiet, f.regular, "400"),
      text(monthLabel(d.month), 56, 286 + drop, 24, quiet, f.regular, "400"),
      credit(d) ? text(credit(d), 56, 320 + drop, 24, ink, f.regular, "400") : "",
    ].join(""),
    defs,
  );
}

export type CardShape = "original" | "desvanece" | "alpie" | "dentro" | "brotan" | "esquina" | "espiga" | "oscura";
export const CARD_SHAPES: readonly CardShape[] = ["original", "desvanece", "alpie", "esquina", "dentro", "brotan", "espiga", "oscura"];
export const DEFAULT_SHAPE: CardShape = "original";

const COMPOSITIONS: Record<CardShape, (d: CardData, f: CardFonts) => Composition> = {
  original: (d, f) => tipografica(d, f, "original"),
  desvanece: (d, f) => tipografica(d, f, "desvanece"),
  alpie: (d, f) => tipografica(d, f, "alpie"),
  dentro: (d, f) => tipografica(d, f, "dentro"),
  brotan: (d, f) => tipografica(d, f, "brotan"),
  esquina: (d, f) => tipografica(d, f, "esquina"),
  espiga: (d, f) => tipografica(d, f, "espiga"),
  oscura: (d, f) => tipografica(d, f, "oscura"),
};

export function receiptCardSvg(data: CardData, fonts: CardFonts = WEB_FONTS, shape: CardShape = DEFAULT_SHAPE): string {
  const rating = Math.min(5, Math.max(0, Math.round(data.rating)));
  const { defs, body } = COMPOSITIONS[shape]({ ...data, rating }, fonts);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}
