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

const PAPER = "#FBF7F0";
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

// El diseño del comprobante: tipográfico. La nota es un número gigante que se sale de la tarjeta por la esquina de abajo; arriba va un texto
// chico y ordenado, y abajo unos juncos del color del rubro que se desvanecen a medida que se acercan al número.
// `compact` es para verla chica (la grilla): el mismo número y los mismos juncos, y de todo lo demás solo el título, más grande.
export function receiptCardSvg(data: CardData, fonts: CardFonts = WEB_FONTS, compact = false): string {
  const d = { ...data, rating: Math.min(5, Math.max(0, Math.round(data.rating))) };
  const f = fonts;
  const c = paletteOf(d.category);
  const title = compact ? wrap(d.title || "Changa", 13, 3) : wrap(d.title || "Changa", 17, 3);
  const drop = (title.length - 1) * 58;
  const defs = `<linearGradient id="desvanece" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="0.3" stop-color="#fff"/><stop offset="0.78" stop-color="#000"/></linearGradient><mask id="hastaelnumero" maskUnits="userSpaceOnUse" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#desvanece)"/></mask>`;
  const { defs: all, body } = framed(
    [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${PAPER}"/>`,
      `<g mask="url(#hastaelnumero)">${reeds(-25, 800, 1.85, c.base, 0.24)}</g>`,
      text(`${d.rating}`, 676, 846, 660, c.base, f.bold, "700", 'text-anchor="end"'),
      ...(compact
        ? [lines(title, 56, 150, 86, 78, INK, f.bold)]
        : [
            // La nota dicha con todas las letras: la imagen se ve suelta en una billetera, sin la app alrededor.
            `<text x="56" y="84" font-size="20" font-family="${f.bold}" font-weight="700" letter-spacing="5"><tspan fill="${c.base}">NOTA ${d.rating} DE 5</tspan><tspan fill="${MUTED}"> · JUNQUERO · #${d.orderId}</tspan></text>`,
            lines(title, 56, 168, 58, 50, INK, f.bold),
            `<line x1="56" y1="${190 + drop}" x2="136" y2="${190 + drop}" stroke="${c.base}" stroke-width="5"/>`,
            text(`${d.categoryName} · ${kind(d)}`, 56, 252 + drop, 24, MUTED, f.regular, "400"),
            text(monthLabel(d.month), 56, 286 + drop, 24, MUTED, f.regular, "400"),
            credit(d) ? text(credit(d), 56, 320 + drop, 24, INK, f.regular, "400") : "",
          ]),
    ].join(""),
    defs,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"><defs>${all}</defs>${body}</svg>`;
}
