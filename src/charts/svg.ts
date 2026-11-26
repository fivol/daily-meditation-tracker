// SVG primitives and the visual theme shared by every dashboard.
export { plural } from '../render.js';

/** Logical canvas width, outer margin and the gap between cards. */
export const W = 1600;
export const M = 64;
export const GAP = 28;
/** Inner padding of a card and the height its title takes. */
export const PAD = 36;
export const HEAD = 104;

export const C = {
  page: '#F6F1E8',
  card: '#FFFFFF',
  border: '#ECE4D6',
  grid: '#EFE9DF',
  track: '#F0EAE0',
  ink: '#2B2521',
  ink2: '#6E645B',
  ink3: '#A1968A',
  /** Morning and evening sessions keep these two hues everywhere. */
  morning: '#E08A1E',
  evening: '#4A5AA8',
  /** One hue for "how much practice": light → dark. */
  teal: ['#C9E6E0', '#69B8AA', '#3A988A', '#1B6E63'],
  accent: '#D9722A',
  goodBg: '#E1F2EA',
  goodInk: '#1B6B4E',
  calmBg: '#F1ECE3',
};

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const n = (value: number) => Number(value.toFixed(2));

export const esc = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface TextOptions {
  size?: number;
  weight?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  spacing?: number;
}

export function text(x: number, y: number, value: string, o: TextOptions = {}): string {
  const { size = 24, weight = 500, fill = C.ink, anchor = 'start', spacing } = o;
  const extra = spacing ? ` letter-spacing="${spacing}"` : '';
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${extra}>${esc(value)}</text>`;
}

export function rect(x: number, y: number, w: number, h: number, o: { r?: number; fill?: string; stroke?: string } = {}): string {
  const { r = 0, fill = C.card, stroke } = o;
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(w, 0))}" height="${n(Math.max(h, 0))}" rx="${n(r)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="1.5"` : ''}/>`;
}

export function line(x1: number, y1: number, x2: number, y2: number, stroke = C.grid, width = 1.5): string {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${stroke}" stroke-width="${width}"/>`;
}

export function circle(cx: number, cy: number, r: number, fill: string, ring?: string): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${ring ? ` stroke="${ring}" stroke-width="3"` : ''}/>`;
}

/** A column standing on its baseline: rounded data end, square bottom. */
export function column(x: number, top: number, w: number, h: number, radius = 8, fill = C.teal[2]): string {
  if (h <= 0) return '';
  const r = Math.min(radius, w / 2, h);
  const bottom = top + h;
  return `<path d="M${n(x)},${n(bottom)} V${n(top + r)} Q${n(x)},${n(top)} ${n(x + r)},${n(top)} H${n(x + w - r)} Q${n(x + w)},${n(top)} ${n(x + w)},${n(top + r)} V${n(bottom)} Z" fill="${fill}"/>`;
}

/** Rough advance widths (in em) of Manrope glyphs — enough to size pills and place units. */
function glyphWidth(ch: string): number {
  if (ch === ' ' || ch === ' ') return 0.28;
  if (/[.,:;·'’!]/.test(ch)) return 0.27;
  if (ch === '1') return 0.44;
  if (/[0-9]/.test(ch)) return 0.6;
  if (/[%]/.test(ch)) return 0.86;
  if (/[+−–\-=]/.test(ch)) return 0.58;
  if (/[А-ЯЁA-Z]/.test(ch)) return 0.7;
  if (/[шщжмыюфШЩЖМЫЮФ]/.test(ch)) return 0.82;
  return 0.57;
}

export function textWidth(value: string, size: number, weight = 500): number {
  const em = [...value].reduce((sum, ch) => sum + glyphWidth(ch), 0);
  return em * size * (1 + (weight - 500) / 6000);
}

/** White card with an optional title and a quiet note under it. */
export function card(box: Box, title?: string, note?: string): string {
  const parts = [rect(box.x, box.y, box.w, box.h, { r: 32, stroke: C.border })];
  if (title) parts.push(text(box.x + PAD, box.y + 58, title, { size: 30, weight: 700 }));
  if (note) parts.push(text(box.x + PAD, box.y + 90, note, { size: 21, fill: C.ink3 }));
  return parts.join('');
}

/** Area of a card under its title. */
export const inner = (box: Box, head = HEAD): Box => ({
  x: box.x + PAD,
  y: box.y + head,
  w: box.w - 2 * PAD,
  h: box.h - head - PAD,
});

/** Change against an earlier period. Only growth is tinted; a dip stays neutral — nobody is scolded. */
export interface Delta {
  label: string;
  up: boolean;
}

const PILL_H = 40;

export function pill(x: number, y: number, delta: Delta): { svg: string; width: number } {
  const size = 21;
  const width = textWidth(delta.label, size, 700) + (delta.up ? 62 : 36);
  const ink = delta.up ? C.goodInk : C.ink2;
  const parts = [rect(x, y, width, PILL_H, { r: PILL_H / 2, fill: delta.up ? C.goodBg : C.calmBg })];
  if (delta.up) parts.push(`<path d="M${n(x + 18)},${n(y + 26)} l8,-12 l8,12 Z" fill="${ink}"/>`);
  parts.push(text(x + (delta.up ? 44 : 18), y + 27.5, delta.label, { size, weight: 700, fill: ink }));
  return { svg: parts.join(''), width };
}

/** Legend keys in a row, right-aligned to `right`. */
export function legend(right: number, y: number, items: { color: string; label: string }[]): string {
  const size = 21;
  let x = right;
  const parts: string[] = [];
  for (const item of [...items].reverse()) {
    x -= textWidth(item.label, size);
    parts.push(text(x, y, item.label, { size, fill: C.ink2 }));
    x -= 26;
    parts.push(rect(x, y - 15, 16, 16, { r: 5, fill: item.color }));
    x -= 28;
  }
  return parts.join('');
}

/** Lotus mark: five petals rising from one point. */
export function lotus(cx: number, baseY: number, scale = 1, fill = C.accent): string {
  const petal = 'M0,0 C-15,-20 -15,-46 0,-62 C15,-46 15,-20 0,0 Z';
  const petals = [-64, -34, 0, 34, 64].map(
    (angle) => `<path d="${petal}" transform="rotate(${angle}) scale(${angle === 0 ? 1 : Math.abs(angle) > 40 ? 0.74 : 0.9})" fill="${fill}" fill-opacity="${angle === 0 ? 1 : Math.abs(angle) > 40 ? 0.45 : 0.7}"/>`,
  );
  return `<g transform="translate(${n(cx)},${n(baseY)}) scale(${scale})">${petals.join('')}</g>`;
}

const GROUP = ' ';

/** 12480 → "12 480". */
export function int(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
}

/** Hours from minutes: one decimal under ten hours, whole hours above. */
export function hoursNumber(minutes: number): string {
  const h = minutes / 60;
  return h < 10 ? String(Number(h.toFixed(1))).replace('.', ',') : int(h);
}

/** A round axis maximum and step for values up to `max`. */
export function niceScale(max: number, ticks = 4): { max: number; step: number } {
  if (max <= 0) return { max: 1, step: 1 };
  const rough = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!;
  return { max: Math.ceil(max / step) * step, step };
}

/** Wraps the pieces of a picture into a document on a plain background. */
export function document(height: number, body: string[], width = W, fill = C.page): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${n(height)}" viewBox="0 0 ${width} ${n(height)}" font-family="Manrope">`,
    rect(0, 0, width, height, { fill }),
    ...body,
    '</svg>',
  ].join('');
}
