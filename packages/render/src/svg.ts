/**
 * SVG 导出。
 *
 * 从同一份布局结果生成矢量图，与 Canvas 屏幕渲染共享颜色计算（技术方案 5.11）。
 */

import type { Sheet } from '../../core/src/types.ts';
import { formatLatex } from '../../core/src/latex.ts';
import { hasRichMarkup, parseRich, stripRich } from '../../core/src/rich.ts';
import type { LayoutResult } from '../../layout/src/layout.ts';
import { wrapText } from '../../layout/src/wrap.ts';
import { createEstimateMeasurer, type TextMeasurer } from '../../layout/src/measure.ts';
import { nodeColors, paletteColor, rgba } from './color.ts';

const FONT = `'PingFang SC','Microsoft YaHei',system-ui,sans-serif`;

export interface SvgOptions {
  readonly dark?: boolean;
  readonly padding?: number;
  readonly measure?: TextMeasurer;
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markerGlyph(marker: string): { glyph: string; color: string } {
  switch (marker) {
    case 'flag': return { glyph: '⚑', color: '#c0562a' };
    case 'star': return { glyph: '★', color: '#b8860b' };
    case 'done': return { glyph: '✓', color: '#2b7a4b' };
    case 'wait': return { glyph: '△', color: '#7a7f86' };
    case 'question': return { glyph: '?', color: '#2f6f9f' };
    case 'idea': return { glyph: '✦', color: '#b8860b' };
    case 'heart': return { glyph: '♥', color: '#c0392b' };
    case 'warn': return { glyph: '!', color: '#d35400' };
    case 'pin': return { glyph: '●', color: '#6b4b8a' };
    case 'clock': return { glyph: '◷', color: '#5f7d95' };
    default: {
      if (marker.startsWith('prio')) return { glyph: marker.slice(4), color: '#c0562a' };
      if (marker.startsWith('progress')) {
        const glyphs = '⓪①②③④⑤⑥⑦⑧';
        return { glyph: glyphs[Number(marker.slice(8))] ?? '○', color: '#2b7a4b' };
      }
      return { glyph: '', color: '#000' };
    }
  }
}

export function toSvg(sheet: Sheet, layout: LayoutResult, options: SvgOptions = {}): string {
  const dark = options.dark ?? sheet.style.darkCanvas;
  const measure = options.measure ?? createEstimateMeasurer();
  const b = layout.bounds;
  const width = Math.round(b.w);
  const height = Math.round(b.h);
  const out: string[] = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="${b.x} ${b.y} ${b.w} ${b.h}" font-family="${FONT}">`
  );
  out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${sheet.style.background}"/>`);

  for (const zone of layout.zones) {
    out.push(
      `<rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="10" ` +
      `fill="rgba(47,111,159,0.05)" stroke="rgba(47,111,159,0.34)" stroke-width="1.2" stroke-dasharray="6 5"/>`
    );
    out.push(
      `<text x="${zone.x + 12}" y="${zone.y + 20}" font-size="11" font-weight="600" fill="#5f7d95">${esc(zone.title)}</text>`
    );
  }

  for (const boundary of layout.boundaries) {
    out.push(
      `<rect x="${boundary.x}" y="${boundary.y}" width="${boundary.w}" height="${boundary.h}" rx="12" ` +
      `fill="rgba(224,122,47,0.07)" stroke="rgba(224,122,47,0.55)" stroke-width="1.4"/>`
    );
    out.push(
      `<text x="${boundary.x + 12}" y="${boundary.y + 19}" font-size="11" font-weight="600" fill="rgba(196,86,26,0.95)">${esc(boundary.title)}</text>`
    );
  }

  if (layout.spine) {
    out.push(
      `<line x1="${layout.spine.x1}" y1="${layout.spine.y1}" x2="${layout.spine.x2}" y2="${layout.spine.y2}" ` +
      `stroke="${dark ? '#46566a' : '#c3d0dc'}" stroke-width="3" stroke-linecap="round"/>`
    );
  }

  for (const edge of layout.edges) {
    const from = layout.boxes.get(edge.from);
    const to = layout.boxes.get(edge.to);
    if (!from || !to) continue;
    const color = dark ? rgba(paletteColor(sheet, edge.to), 0.62) : rgba(paletteColor(sheet, edge.to), 0.5);
    const strokeWidth = Math.max(1, sheet.style.lineWidth * Math.max(0.55, 1 - to.depth * 0.12));
    const edgeStyle = sheet.style.edgeStyle ?? 'curve';
    let path: string;
    if (edgeStyle === 'straight') {
      path = `M${edge.x1} ${edge.y1} L${edge.x2} ${edge.y2}`;
    } else if (edgeStyle === 'elbow') {
      if (edge.orientation === 'v') {
        const midY = (edge.y1 + edge.y2) / 2;
        path = `M${edge.x1} ${edge.y1} L${edge.x1} ${midY} L${edge.x2} ${midY} L${edge.x2} ${edge.y2}`;
      } else {
        const midX = (edge.x1 + edge.x2) / 2;
        path = `M${edge.x1} ${edge.y1} L${midX} ${edge.y1} L${midX} ${edge.y2} L${edge.x2} ${edge.y2}`;
      }
    } else if (edge.orientation === 'v') {
      const midY = (edge.y1 + edge.y2) / 2;
      path = `M${edge.x1} ${edge.y1} C${edge.x1} ${midY} ${edge.x2} ${midY} ${edge.x2} ${edge.y2}`;
    } else {
      const midX = (edge.x1 + edge.x2) / 2;
      path = `M${edge.x1} ${edge.y1} C${midX} ${edge.y1} ${midX} ${edge.y2} ${edge.x2} ${edge.y2}`;
    }
    out.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`);
  }

  for (const relation of layout.relationships) {
    const midX = (relation.x1 + relation.x2) / 2;
    const midY = (relation.y1 + relation.y2) / 2;
    out.push(
      `<path d="M${relation.x1} ${relation.y1} C${midX} ${relation.y1} ${midX} ${relation.y2} ${relation.x2} ${relation.y2}" ` +
      `fill="none" stroke="rgba(107,75,138,0.70)" stroke-width="1.4" stroke-dasharray="5 4"/>`
    );
    if (relation.label) {
      out.push(
        `<text x="${midX}" y="${midY - 4}" font-size="10.5" fill="rgba(107,75,138,0.92)" text-anchor="middle">${esc(relation.label)}</text>`
      );
    }
  }

  for (const box of layout.boxes.values()) {
    const topic = sheet.topics[box.id];
    if (!topic) continue;
    const colors = nodeColors(sheet, box.id, dark);
    const style = topic.styleOverride;
    const fill = style?.fill ?? colors.fill;
    const stroke = style?.stroke ?? colors.stroke;
    const strokeWidth = style?.strokeWidth ?? 1;
    const radius = box.id === sheet.rootId ? 9 : 8;
    const shape = style?.shape ?? 'rounded';

    if (shape === 'ellipse') {
      out.push(
        `<ellipse cx="${box.x + box.w / 2}" cy="${box.y + box.h / 2}" rx="${box.w / 2}" ry="${box.h / 2}" ` +
        `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
      );
    } else if (shape === 'diamond') {
      const points = [
        `${box.x + box.w / 2},${box.y}`,
        `${box.x + box.w},${box.y + box.h / 2}`,
        `${box.x + box.w / 2},${box.y + box.h}`,
        `${box.x},${box.y + box.h / 2}`
      ].join(' ');
      out.push(`<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
    } else if (shape === 'hexagon') {
      const cut = Math.min(16, box.w * 0.18, box.h * 0.5);
      const points = [
        `${box.x + cut},${box.y}`,
        `${box.x + box.w - cut},${box.y}`,
        `${box.x + box.w},${box.y + box.h / 2}`,
        `${box.x + box.w - cut},${box.y + box.h}`,
        `${box.x + cut},${box.y + box.h}`,
        `${box.x},${box.y + box.h / 2}`
      ].join(' ');
      out.push(`<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`);
    } else {
      const rx = shape === 'pill' ? box.h / 2 : shape === 'rect' ? 0 : radius;
      out.push(
        `<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${rx}" ` +
        `fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`
      );
    }

    let textX = box.x + 13;
    if (topic.image) {
      out.push(
        `<image href="${topic.image.dataUrl}" x="${box.x + 8}" y="${box.y + (box.h - 24) / 2}" width="24" height="24" preserveAspectRatio="xMidYMid slice"/>`
      );
      textX += 30;
    }
    const markers = topic.markers?.length
      ? topic.markers
      : topic.marker
        ? [topic.marker]
        : [];
    for (const marker of markers) {
      const { glyph, color } = markerGlyph(marker);
      if (!glyph) continue;
      out.push(`<text x="${textX - 2}" y="${box.y + box.h / 2 + 4.5}" font-size="12" fill="${color}">${glyph}</text>`);
      textX += 22;
    }

    const isRoot = box.id === sheet.rootId;
    const available = box.w - (textX - box.x) - 12;
    const fontSize = topic.fontSize ?? (isRoot ? 15 : 13);
    const weight = style?.fontWeight ?? (isRoot ? 700 : 500);
    const italic = Boolean(style?.italic);
    const decoration = [style?.underline ? 'underline' : '', style?.strike ? 'line-through' : '']
      .filter(Boolean)
      .join(' ');
    const textColor = style?.textColor ?? colors.text;
    const anchor = style?.align === 'center' ? 'middle' : style?.align === 'right' ? 'end' : 'start';
    const anchorX = style?.align === 'center'
      ? textX + available / 2
      : style?.align === 'right'
        ? textX + available
        : textX;
    const styleAttrs =
      `font-weight="${weight}" font-style="${italic ? 'italic' : 'normal'}" ` +
      `fill="${textColor}" text-anchor="${anchor}"` +
      (decoration ? ` text-decoration="${decoration}"` : '');
    const lines = hasRichMarkup(topic.text)
      ? topic.text.split('\n')
      : wrapText(stripRich(topic.text || ' '), available, fontSize, weight, measure.width);
    const lineHeight = Math.round(fontSize * 1.35);
    const block = lines.length * lineHeight;
    const firstBaseline = topic.equation
      ? box.y + 8 + fontSize * 0.82
      : box.y + (box.h - block) / 2 + fontSize * 0.82;

    lines.forEach((line, index) => {
      const plain = stripRich(line);
      const natural = measure.width(plain || ' ', fontSize, weight);
      const baseline = firstBaseline + index * lineHeight;
      if (natural > available) {
        const fit = ` textLength="${Math.max(12, available - 2)}" lengthAdjust="spacingAndGlyphs"`;
        out.push(
          `<text x="${anchorX}" y="${baseline}" font-size="${fontSize}" ` +
          `${styleAttrs}${fit}>${esc(plain || ' ')}</text>`
        );
        return;
      }
      const spans = parseRich(line || ' ')
        .map((run) =>
          `<tspan font-weight="${run.bold ? 700 : weight}" ` +
          `font-style="${run.italic || italic ? 'italic' : 'normal'}">${esc(run.text)}</tspan>`
        )
        .join('');
      out.push(
        `<text x="${anchorX}" y="${baseline}" font-size="${fontSize}" ` +
        `${styleAttrs}>${spans}</text>`
      );
    });

    if (topic.equation) {
      out.push(
        `<text x="${textX}" y="${box.y + box.h - 8}" font-size="10" font-style="italic" fill="#5d6b7a">` +
        `${esc(`∑ ${formatLatex(topic.equation.latex)}`.slice(0, 46))}</text>`
      );
    }

    if (box.collapsedCount > 0) {
      const cx = box.x + box.w - 2;
      const cy = box.y + box.h - 1;
      out.push(`<circle cx="${cx}" cy="${cy}" r="9" fill="#e07a2f"/>`);
      out.push(
        `<text x="${cx}" y="${cy + 3.4}" font-size="9.5" fill="#ffffff" text-anchor="middle">${box.collapsedCount}</text>`
      );
    }

    if (topic.task) {
      const pct = Math.max(0, Math.min(100, topic.task.progress));
      const barW = box.w - 20;
      const barY = box.y + box.h - 4;
      out.push(`<rect x="${box.x + 10}" y="${barY}" width="${barW}" height="2" fill="${dark ? 'rgba(255,255,255,0.14)' : 'rgba(24,42,64,0.10)'}"/>`);
      out.push(`<rect x="${box.x + 10}" y="${barY}" width="${(barW * pct) / 100}" height="2" fill="${colors.base}"/>`);
    }
  }

  out.push('</svg>');
  return out.join('\n');
}
