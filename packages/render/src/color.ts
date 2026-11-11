/**
 * 颜色计算：Canvas 与 SVG 导出共用，保证两种输出视觉一致。
 */

import { branchIndexOf } from '../../core/src/model.ts';
import type { Sheet, TopicId } from '../../core/src/types.ts';

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n)) return [47, 111, 159];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(hex: string, target: [number, number, number], ratio: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (a: number, t: number) => Math.round(a + (t - a) * ratio);
  return `rgb(${f(r, target[0])}, ${f(g, target[1])}, ${f(b, target[2])})`;
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function paletteColor(sheet: Sheet, topicId: TopicId): string {
  const palette = sheet.style.palette;
  const fallback = palette[0] ?? '#2f6f9f';
  if (!sheet.style.rainbow) return fallback;
  const index = branchIndexOf(sheet, topicId);
  return palette[index % palette.length] ?? fallback;
}

export interface NodeColors {
  readonly base: string;
  readonly fill: string;
  readonly stroke: string;
  readonly text: string;
}

export function nodeColors(sheet: Sheet, topicId: TopicId, dark: boolean): NodeColors {
  const isRoot = topicId === sheet.rootId;
  const base = isRoot ? '#2f6f9f' : paletteColor(sheet, topicId);
  const fill = isRoot
    ? dark ? '#2a4258' : mix(base, [255, 255, 255], 0.88)
    : dark ? mix(base, [22, 30, 42], 0.62) : mix(base, [255, 255, 255], 0.86);
  const stroke = dark ? rgba(base, 0.55) : rgba(base, 0.42);
  const text = dark ? '#e6edf4' : isRoot ? '#123d5c' : '#22303d';
  return { base, fill, stroke, text };
}
