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

// La escena del atardecer y sus variantes: un cielo, un astro con la nota adentro, el agua con su reflejo, los juncos al frente y los datos abajo.
// Cada variante cambia la hora y el clima (colores, astro, estrellas, pájaros, neblina o rayas retro), no la composición.
interface Scene {
  sky: [string, number][];
  orb: { cx: number; cy: number; r: number; fill: string };
  numberColor: string;
  water: string;
  reflection: string;
  reeds: { fill: string; opacity: number; scale: number; bottom: number };
  text: { title: string; meta: string; sub: string };
  titleLines?: number;
  // Se dibuja en el cielo, antes del astro (estrellas, pájaros).
  sky_extras?: string;
  // Se dibuja encima de los juncos (neblina) y lo que necesita en <defs>.
  mist?: string;
  mistDefs?: string;
  // Rayas que cortan el astro (retro) y el suelo en perspectiva.
  retro?: boolean;
}

function scene(d: CardData, f: CardFonts, o: Scene): Composition {
  const c = paletteOf(d.category);
  const title = wrap(d.title || "Changa", 18, o.titleLines ?? 3);
  const { cx, cy, r } = o.orb;
  const horizon = 590;
  let reflection = "";
  if (!o.retro) for (let i = 0; i < 4; i += 1) reflection += `<rect x="${cx - (150 - i * 30)}" y="${612 + i * 24}" width="${300 - i * 60}" height="7" rx="3.5" fill="${o.reflection}" opacity="${(0.6 - i * 0.13).toFixed(2)}"/>`;
  let slits = "";
  if (o.retro) for (let k = 0; k < 6; k += 1) slits += `<rect y="${cy + 62 + k * 17}" width="${CARD_WIDTH}" height="${3 + k * 2.6}" fill="#000"/>`;
  let floor = "";
  if (o.retro) {
    for (let i = -6; i <= 6; i += 1) floor += `<line x1="${300 + i * 22}" y1="${horizon}" x2="${300 + i * 150}" y2="${CARD_HEIGHT}" stroke="${o.reflection}" stroke-opacity="0.4" stroke-width="2"/>`;
    for (const y of [606, 628, 658, 700]) floor += `<line x1="0" y1="${y}" x2="${CARD_WIDTH}" y2="${y}" stroke="${o.reflection}" stroke-opacity="0.4" stroke-width="2"/>`;
  }
  const stops = o.sky.map(([color, at]) => `<stop offset="${at}" stop-color="${color}"/>`).join("");
  const numberY = o.retro ? cy + 44 : cy + 86;
  const labelY = o.retro ? cy - 110 : cy - 88;
  return {
    defs: `<linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient><clipPath id="redondeo"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${CARD_RADIUS}"/></clipPath>${o.mistDefs ?? ""}${o.retro ? `<mask id="rajas" maskUnits="userSpaceOnUse" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#fff"/>${slits}</mask>` : ""}`,
    body: [
      `<g clip-path="url(#redondeo)">`,
      `<rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#cielo)"/>`,
      o.sky_extras ?? "",
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.orb.fill}"${o.retro ? ' mask="url(#rajas)"' : ""}/>`,
      `<rect y="${horizon}" width="${CARD_WIDTH}" height="${CARD_HEIGHT - horizon}" fill="${o.water}"/>`,
      reflection,
      floor,
      reeds(0, o.reeds.bottom, o.reeds.scale, o.reeds.fill, o.reeds.opacity),
      // Si los juncos no cubren todo el ancho, se repiten para que no terminen en un corte seco.
      o.reeds.scale * REEDS.width < CARD_WIDTH - 1 ? reeds(o.reeds.scale * REEDS.width - 4, o.reeds.bottom, o.reeds.scale, o.reeds.fill, o.reeds.opacity) : "",
      o.mist ?? "",
      lines(title, 52, 112, 62, 52, o.text.title, f.bold),
      text("NOTA DE 5", cx, labelY, 26, o.numberColor, f.bold, "700", 'text-anchor="middle" letter-spacing="8"'),
      text(`${d.rating}`, cx, numberY, o.retro ? 170 : 200, o.numberColor, f.bold, "700", 'text-anchor="middle"'),
      text(meta(d), 300, 742, 24, o.text.meta, f.regular, "400", 'text-anchor="middle"'),
      text(`${d.payerName ? `Calificó ${d.payerName}  ·  ` : ""}#${d.orderId}`, 300, 776, 22, o.text.sub, f.regular, "400", 'text-anchor="middle"'),
      `</g>`,
    ].join(""),
  };
}

function atardecer(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  return scene(d, f, {
    sky: [[c.deep, 0], [c.base, 0.5], [SAND, 0.74]],
    orb: { cx: 300, cy: 450, r: 166, fill: SAND },
    numberColor: c.deep,
    water: c.deep,
    reflection: SAND,
    reeds: { fill: "#120706", opacity: 0.92, scale: 1.45, bottom: 690 },
    text: { title: CREAM, meta: CREAM, sub: LINE },
  });
}

// Amanecer: cielo claro, sol pálido que sale y neblina sobre los juncos.
function amanecer(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  return scene(d, f, {
    sky: [[c.base, 0], ["#E9B27A", 0.46], ["#FBEBC8", 0.76]],
    orb: { cx: 300, cy: 470, r: 150, fill: "#FFF6DC" },
    numberColor: c.base,
    water: c.base,
    reflection: "#FFF6DC",
    reeds: { fill: c.deep, opacity: 0.82, scale: 1.45, bottom: 690 },
    text: { title: CREAM, meta: CREAM, sub: LINE },
    mistDefs: `<linearGradient id="neblina" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBEBC8" stop-opacity="0"/><stop offset="0.55" stop-color="#FBEBC8" stop-opacity="0.5"/><stop offset="1" stop-color="#FBEBC8" stop-opacity="0"/></linearGradient>`,
    mist: `<rect y="520" width="${CARD_WIDTH}" height="190" fill="url(#neblina)"/>`,
  });
}

// Noche: luna llena, estrellas y el reflejo en el agua oscura.
function noche(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const rand = seeded(d.orderId * 7 + 5);
  let stars = "";
  for (let i = 0; i < 46; i += 1) stars += `<circle cx="${(20 + rand() * 560).toFixed(0)}" cy="${(24 + rand() * 330).toFixed(0)}" r="${(1 + rand() * 2.2).toFixed(1)}" fill="${CREAM}" opacity="${(0.35 + rand() * 0.6).toFixed(2)}"/>`;
  return scene(d, f, {
    sky: [["#090C18", 0], [c.deep, 0.62], [c.base, 0.8]],
    orb: { cx: 300, cy: 450, r: 160, fill: CREAM },
    numberColor: c.deep,
    water: "#070810",
    reflection: CREAM,
    reeds: { fill: "#030409", opacity: 0.95, scale: 1.45, bottom: 690 },
    text: { title: CREAM, meta: CREAM, sub: LINE },
    sky_extras: stars,
  });
}

// Retro: el sol cortado por rayas y el suelo en perspectiva, como un póster de los ochenta.
function retro(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  return scene(d, f, {
    sky: [[c.deep, 0], [c.base, 0.7], ["#E27D5F", 0.74]],
    orb: { cx: 300, cy: 430, r: 172, fill: SAND },
    numberColor: c.deep,
    water: c.deep,
    reflection: SAND,
    reeds: { fill: "#120706", opacity: 0.85, scale: 1.05, bottom: 640 },
    text: { title: CREAM, meta: CREAM, sub: LINE },
    retro: true,
  });
}

// Bandada: el atardecer, con la nota contada en pájaros: llenos los que cuentan.
function bandada(d: CardData, f: CardFonts): Composition {
  const c = paletteOf(d.category);
  const rise = [0, -22, -34, -22, 0];
  const birds = Array.from({ length: 5 }, (_, i) => {
    const x = 110 + i * 95;
    const y = 262 + rise[i]!;
    const on = i < d.rating;
    return `<path d="M ${x - 30} ${y} Q ${x - 15} ${y - 22} ${x} ${y} Q ${x + 15} ${y - 22} ${x + 30} ${y}" fill="none" stroke="${CREAM}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="${on ? 1 : 0.25}"/>`;
  }).join("");
  return scene(d, f, {
    sky: [[c.deep, 0], [c.base, 0.5], [SAND, 0.74]],
    orb: { cx: 300, cy: 470, r: 160, fill: SAND },
    numberColor: c.deep,
    water: c.deep,
    reflection: SAND,
    reeds: { fill: "#120706", opacity: 0.92, scale: 1.45, bottom: 690 },
    text: { title: CREAM, meta: CREAM, sub: LINE },
    titleLines: 2,
    sky_extras: birds,
  });
}

export type CardShape = "atardecer" | "amanecer" | "noche" | "retro" | "bandada";
export const CARD_SHAPES: readonly CardShape[] = ["atardecer", "amanecer", "noche", "retro", "bandada"];
export const DEFAULT_SHAPE: CardShape = "atardecer";

const COMPOSITIONS: Record<CardShape, (d: CardData, f: CardFonts) => Composition> = { atardecer, amanecer, noche, retro, bandada };

export function receiptCardSvg(data: CardData, fonts: CardFonts = WEB_FONTS, shape: CardShape = DEFAULT_SHAPE): string {
  const rating = Math.min(5, Math.max(0, Math.round(data.rating)));
  const { defs, body } = COMPOSITIONS[shape]({ ...data, rating }, fonts);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}
