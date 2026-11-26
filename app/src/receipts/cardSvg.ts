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

// Una espiga de junco como ícono (para mostrar la nota): llena si cuenta, en contorno si no.
function spike(cx: number, cy: number, fill: string, on: boolean): string {
  const o = on ? 1 : 0.3;
  return `<line x1="${cx}" y1="${cy + 54}" x2="${cx}" y2="${cy - 6}" stroke="${fill}" stroke-width="5" stroke-linecap="round" opacity="${o}"/><ellipse cx="${cx}" cy="${cy - 30}" rx="11" ry="30" fill="${on ? fill : "none"}" stroke="${fill}" stroke-width="4" opacity="${o}"/>`;
}

function star(cx: number, cy: number, radius: number, fill: string, on: boolean): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? radius : radius * 0.42;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return `<polygon points="${points.join(" ")}" fill="${fill}" opacity="${on ? 1 : 0.28}"/>`;
}

function starRow(rating: number, cx: number, cy: number, radius: number, fill: string): string {
  const gap = radius * 2.5;
  return Array.from({ length: 5 }, (_, i) => star(cx + (i - 2) * gap, cy, radius, fill, i < rating)).join("");
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

// 1. Atardecer: un cartel con el sol bajo sobre el agua y los juncos al frente. La nota va dentro del sol.
function atardecer(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 18, 3);
  let reflection = "";
  for (let i = 0; i < 4; i += 1) reflection += `<rect x="${300 - (150 - i * 30)}" y="${612 + i * 24}" width="${300 - i * 60}" height="7" rx="3.5" fill="${SAND}" opacity="${(0.6 - i * 0.13).toFixed(2)}"/>`;
  return {
    defs: `<linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.deep}"/><stop offset="0.5" stop-color="${c.base}"/><stop offset="0.74" stop-color="${SAND}"/></linearGradient>`,
    body: [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#cielo)"/>`,
      `<circle cx="300" cy="450" r="166" fill="${SAND}"/>`,
      `<rect y="590" width="${CARD_WIDTH}" height="${CARD_HEIGHT - 590}" fill="${c.deep}"/>`,
      reflection,
      reeds(0, 690, 1.45, "#120706", 0.92),
      lines(title, 52, 112, 62, 52, CREAM, f.bold),
      text("NOTA DE 5", 300, 362, 26, c.deep, f.bold, "700", 'text-anchor="middle" letter-spacing="8"'),
      text(`${d.rating}`, 300, 536, 200, c.deep, f.bold, "700", 'text-anchor="middle"'),
      text(meta(d), 300, 742, 24, CREAM, f.regular, "400", 'text-anchor="middle"'),
      text(`${d.payerName ? `Calificó ${d.payerName}  ·  ` : ""}#${d.orderId}`, 300, 776, 22, LINE, f.regular, "400", 'text-anchor="middle"'),
    ].join(""),
  };
}

// 2. Medalla: un disco con los juncos adentro, la nota en el centro y una cinta con el título.
function medalla(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 25, 1)[0] ?? "";
  return {
    defs: `<radialGradient id="disco" cx="0.5" cy="0.38" r="0.7"><stop offset="0" stop-color="${c.base}"/><stop offset="1" stop-color="${c.deep}"/></radialGradient><clipPath id="adentro"><circle cx="300" cy="350" r="236"/></clipPath><path id="arco" d="M 104 350 A 196 196 0 0 1 496 350"/>`,
    body: [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${PAPER}"/>`,
      `<circle cx="300" cy="350" r="262" fill="${SAND}"/>`,
      `<circle cx="300" cy="350" r="244" fill="url(#disco)"/>`,
      `<g clip-path="url(#adentro)">${reeds(60, 586, 1.2, "#000000", 0.38)}</g>`,
      `<circle cx="300" cy="350" r="218" fill="none" stroke="${SAND}" stroke-opacity="0.55" stroke-width="3"/>`,
      `<text font-size="30" font-family="${f.bold}" font-weight="700" fill="${SAND}" letter-spacing="7" text-anchor="middle"><textPath href="#arco" startOffset="50%">JUNQUERO · TRABAJO CERRADO</textPath></text>`,
      text(`${d.rating}`, 300, 440, 250, SAND, f.bold, "700", 'text-anchor="middle"'),
      text("de 5", 300, 500, 36, CREAM, f.regular, "400", 'text-anchor="middle"'),
      `<path d="M 36 585 H 564 L 530 640 L 564 695 H 36 L 70 640 Z" fill="${c.base}"/><path d="M 36 695 L 70 640 L 84 695 Z" fill="${c.deep}"/><path d="M 564 695 L 530 640 L 516 695 Z" fill="${c.deep}"/>`,
      text(title, 300, 652, 32, CREAM, f.bold, "700", 'text-anchor="middle"'),
      text(meta(d), 300, 742, 24, INK, f.regular, "400", 'text-anchor="middle"'),
      text(`${d.payerName ? `Calificó ${d.payerName}  ·  ` : ""}#${d.orderId}`, 300, 776, 22, MUTED, f.regular, "400", 'text-anchor="middle"'),
    ].join(""),
  };
}

// 3. Sellado: un sello de goma entintado y algo gastado, torcido, sobre papel. El título va escrito abajo.
function sellado(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const rand = seeded(d.orderId * 13 + d.category);
  let wear = "";
  for (let i = 0; i < 110; i += 1) wear += `<circle cx="${(40 + rand() * 520).toFixed(0)}" cy="${(70 + rand() * 520).toFixed(0)}" r="${(1.2 + rand() * 3).toFixed(1)}" fill="#000"/>`;
  const title = wrap(d.title || "Changa", 20, 2);
  return {
    defs: `<mask id="gastado" maskUnits="userSpaceOnUse" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#fff"/>${wear}</mask><path id="arriba" d="M 104 330 A 196 196 0 0 1 496 330"/><path id="abajo" d="M 90 330 A 210 210 0 0 0 510 330"/>`,
    body: [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${PAPER}"/>`,
      reeds(-40, 800, 1.6, INK, 0.05),
      `<g transform="rotate(-9 300 330)" mask="url(#gastado)">`,
      `<circle cx="300" cy="330" r="254" fill="none" stroke="${c.base}" stroke-width="13"/>`,
      `<circle cx="300" cy="330" r="228" fill="none" stroke="${c.base}" stroke-width="3"/>`,
      `<circle cx="300" cy="330" r="150" fill="none" stroke="${c.base}" stroke-width="3" opacity="0.5"/>`,
      `<text font-size="34" font-family="${f.bold}" font-weight="700" fill="${c.base}" letter-spacing="6" text-anchor="middle"><textPath href="#arriba" startOffset="50%">PAGO PROTEGIDO</textPath></text>`,
      `<text font-size="30" font-family="${f.bold}" font-weight="700" fill="${c.base}" letter-spacing="5" text-anchor="middle"><textPath href="#abajo" startOffset="50%">${escape(monthLabel(d.month).toUpperCase())}</textPath></text>`,
      text(`${d.rating}`, 300, 408, 230, c.base, f.bold, "700", 'text-anchor="middle"'),
      starRow(d.rating, 300, 452, 17, c.base),
      `</g>`,
      lines(title, 300, 650, 52, 44, INK, f.bold, "middle"),
      text(`${d.categoryName} · ${kind(d)}`, 300, 738, 24, MUTED, f.regular, "400", 'text-anchor="middle"'),
      text(`${d.payerName ? `Calificó ${d.payerName}  ·  ` : ""}junquero  #${d.orderId}`, 300, 772, 22, MUTED, f.regular, "400", 'text-anchor="middle"'),
    ].join(""),
  };
}

// 4. Carta de colección: el nivel (oro, plata, bronce) lo da la nota. Una escena arriba y los datos abajo.
const TIERS = [
  { name: "PIEDRA", light: "#B3A9A3", dark: "#5F5753" },
  { name: "PIEDRA", light: "#B3A9A3", dark: "#5F5753" },
  { name: "PIEDRA", light: "#B3A9A3", dark: "#5F5753" },
  { name: "BRONCE", light: "#E0A878", dark: "#8A5A34" },
  { name: "PLATA", light: "#E3E6EB", dark: "#8F97A3" },
  { name: "ORO", light: "#F3D98F", dark: "#B8913A" },
];

function coleccion(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const tier = TIERS[Math.max(0, Math.min(5, d.rating))]!;
  const title = wrap(d.title || "Changa", 20, 2);
  return {
    defs: `<linearGradient id="marco" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${tier.light}"/><stop offset="0.5" stop-color="${tier.dark}"/><stop offset="1" stop-color="${tier.light}"/></linearGradient><linearGradient id="escena" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.deep}"/><stop offset="0.6" stop-color="${c.base}"/><stop offset="0.9" stop-color="${SAND}"/></linearGradient><clipPath id="ventana"><rect x="50" y="196" width="500" height="296" rx="20"/></clipPath>`,
    body: [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="42" fill="url(#marco)"/>`,
      `<rect x="20" y="20" width="560" height="760" rx="30" fill="${PAPER}"/>`,
      text(`NIVEL ${tier.name}`, 50, 76, 22, tier.dark, f.bold, "700", 'letter-spacing="5"'),
      lines(title, 50, 128, 52, 44, INK, f.bold),
      `<g clip-path="url(#ventana)"><rect x="50" y="196" width="500" height="296" fill="url(#escena)"/><circle cx="410" cy="380" r="62" fill="${SAND}"/><rect x="50" y="440" width="500" height="60" fill="${c.deep}"/>${reeds(40, 500, 1.3, "#120706", 0.9)}</g>`,
      `<rect x="50" y="196" width="500" height="296" rx="20" fill="none" stroke="${tier.dark}" stroke-width="5"/>`,
      starRow(d.rating, 168, 548, 21, tier.dark),
      text(`${d.rating} / 5`, 550, 560, 40, INK, f.bold, "700", 'text-anchor="end"'),
      text("Rubro", 50, 622, 22, MUTED, f.regular, "400"),
      text(d.categoryName, 550, 622, 24, INK, f.bold, "700", 'text-anchor="end"'),
      text("Modalidad", 50, 660, 22, MUTED, f.regular, "400"),
      text(kind(d), 550, 660, 24, INK, f.bold, "700", 'text-anchor="end"'),
      text("Mes", 50, 698, 22, MUTED, f.regular, "400"),
      text(monthLabel(d.month), 550, 698, 24, INK, f.bold, "700", 'text-anchor="end"'),
      d.payerName ? text("Calificó", 50, 736, 22, MUTED, f.regular, "400") + text(d.payerName, 550, 736, 24, INK, f.bold, "700", 'text-anchor="end"') : "",
      text("junquero · intransferible", 50, 768, 18, tier.dark, f.regular, "400"),
      text(`#${d.orderId}`, 550, 768, 18, tier.dark, f.regular, "400", 'text-anchor="end"'),
    ].join(""),
  };
}

// 5. Lámina: como una lámina botánica de un libro, con los juncos dibujados grandes y la nota en espigas.
function lamina(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 20, 2);
  const drawn = Array.from({ length: 5 }, (_, i) => spike(150 + i * 75, 646, c.base, i < d.rating)).join("");
  return {
    defs: "",
    body: [
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${PAPER}"/>`,
      `<rect x="22" y="22" width="556" height="756" fill="none" stroke="${INK}" stroke-width="3"/><rect x="34" y="34" width="532" height="732" fill="none" stroke="${INK}" stroke-width="1"/>`,
      text(`LÁMINA N.º ${d.orderId}`, 300, 92, 22, MUTED, f.bold, "700", 'text-anchor="middle" letter-spacing="7"'),
      lines(title, 300, 154, 54, 46, INK, f.bold, "middle"),
      `<line x1="200" y1="248" x2="400" y2="248" stroke="${c.base}" stroke-width="3"/>`,
      reeds(41, 506, 1.25, INK, 0.88),
      text(d.categoryName, 300, 572, 38, c.base, f.bold, "700", 'text-anchor="middle"'),
      drawn,
      text(`${kind(d)} · ${monthLabel(d.month)}`, 300, 728, 24, MUTED, f.regular, "400", 'text-anchor="middle"'),
      text(`${d.payerName ? `Calificó ${d.payerName}  ·  ` : ""}junquero`, 300, 756, 20, MUTED, f.regular, "400", 'text-anchor="middle"'),
    ].join(""),
  };
}

export type CardShape = "atardecer" | "medalla" | "sellado" | "coleccion" | "lamina";
export const CARD_SHAPES: readonly CardShape[] = ["atardecer", "medalla", "sellado", "coleccion", "lamina"];
export const DEFAULT_SHAPE: CardShape = "atardecer";

const COMPOSITIONS: Record<CardShape, (d: CardData, f: CardFonts) => Composition> = { atardecer, medalla, sellado, coleccion, lamina };

export function receiptCardSvg(data: CardData, fonts: CardFonts = WEB_FONTS, shape: CardShape = DEFAULT_SHAPE): string {
  const rating = Math.min(5, Math.max(0, Math.round(data.rating)));
  const { defs, body } = COMPOSITIONS[shape]({ ...data, rating }, fonts);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}
