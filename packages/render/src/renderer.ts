/**
 * Canvas 渲染器。
 *
 * 双画布：static 承载背景、连线、节点；overlay 承载选中环等交互图层。
 * 绘制前按视口做剔除，并按缩放级别做 LOD（技术方案 5.4）。
 */

import type { MarkerId, ShapeKind, Sheet, TopicId } from '../../core/src/types.ts';
import { formatLatex } from '../../core/src/latex.ts';
import { hasRichMarkup, parseRich, stripRich } from '../../core/src/rich.ts';
import { layoutSheet, type LayoutResult, type NodeBox } from '../../layout/src/layout.ts';
import { wrapText } from '../../layout/src/wrap.ts';
import { createCanvasMeasurer, type TextMeasurer } from '../../layout/src/measure.ts';
import { nodeColors, paletteColor, rgba } from './color.ts';

export interface ViewTransform {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export interface DragVisual {
  readonly fromId: TopicId;
  readonly x: number;
  readonly y: number;
  readonly targetId: TopicId | null;
  readonly valid: boolean;
}

export interface RenderInput {
  readonly sheet: Sheet | null;
  readonly collapsed: ReadonlySet<TopicId>;
  readonly view: ViewTransform;
  readonly selection: ReadonlySet<TopicId>;
  readonly matches?: ReadonlySet<TopicId> | null;
}

const FONT_STACK = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
const RADIUS = 8;

function traceTopicPath(
  ctx: CanvasRenderingContext2D,
  shape: ShapeKind | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  isRoot: boolean
): void {
  ctx.beginPath();
  if (shape === 'ellipse') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    return;
  }
  if (shape === 'diamond') {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
    return;
  }
  if (shape === 'hexagon') {
    const cut = Math.min(16, w * 0.18, h * 0.5);
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w - cut, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
    return;
  }
  const radius = shape === 'pill' ? h / 2 : shape === 'rect' ? 0 : RADIUS + (isRoot ? 1 : 0);
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
}

const MARKER_STYLE: Record<MarkerId, { glyph: string; color: string }> = {
  flag: { glyph: '⚑', color: '#c0562a' },
  star: { glyph: '★', color: '#b8860b' },
  done: { glyph: '✓', color: '#2b7a4b' },
  wait: { glyph: '△', color: '#7a7f86' },
  question: { glyph: '?', color: '#2f6f9f' },
  idea: { glyph: '✦', color: '#b8860b' },
  heart: { glyph: '♥', color: '#c0392b' },
  warn: { glyph: '!', color: '#d35400' },
  pin: { glyph: '●', color: '#6b4b8a' },
  clock: { glyph: '◷', color: '#5f7d95' },
  prio1: { glyph: '1', color: '#b3261e' },
  prio2: { glyph: '2', color: '#c0392b' },
  prio3: { glyph: '3', color: '#d35400' },
  prio4: { glyph: '4', color: '#e67e22' },
  prio5: { glyph: '5', color: '#b7791f' },
  prio6: { glyph: '6', color: '#9a7b1f' },
  prio7: { glyph: '7', color: '#6f7d2f' },
  prio8: { glyph: '8', color: '#2b7a4b' },
  prio9: { glyph: '9', color: '#2f6f9f' },
  progress0: { glyph: '⓪', color: '#98a4b1' },
  progress1: { glyph: '①', color: '#8aa0a8' },
  progress2: { glyph: '②', color: '#7a9a9f' },
  progress3: { glyph: '③', color: '#6a9496' },
  progress4: { glyph: '④', color: '#5a8e8d' },
  progress5: { glyph: '⑤', color: '#4a8884' },
  progress6: { glyph: '⑥', color: '#3a827b' },
  progress7: { glyph: '⑦', color: '#2b7a72' },
  progress8: { glyph: '⑧', color: '#2b7a4b' }
};

export class CanvasRenderer {
  private readonly staticCanvas: HTMLCanvasElement;
  private readonly overlayCanvas: HTMLCanvasElement;
  private readonly staticCtx: CanvasRenderingContext2D;
  private readonly overlayCtx: CanvasRenderingContext2D;

  readonly measure: TextMeasurer;

  private sheet: Sheet | null = null;
  private collapsed: ReadonlySet<TopicId> = new Set();
  private view: ViewTransform = { zoom: 1, panX: 0, panY: 0 };
  private selection: ReadonlySet<TopicId> = new Set();
  private matches: ReadonlySet<TopicId> | null = null;
  private layout: LayoutResult | null = null;

  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;
  private textCache = new Map<string, string>();
  private images = new Map<string, HTMLImageElement>();
  private drag: DragVisual | null = null;
  private zonePreview: { x: number; y: number; w: number; h: number } | null = null;
  private boxPreview: { x: number; y: number; w: number; h: number } | null = null;
  private marquee: { x: number; y: number; w: number; h: number; crossing: boolean } | null = null;

  constructor(staticCanvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement) {
    this.staticCanvas = staticCanvas;
    this.overlayCanvas = overlayCanvas;
    const sctx = staticCanvas.getContext('2d');
    const octx = overlayCanvas.getContext('2d');
    if (!sctx || !octx) throw new Error('Canvas 2D 上下文不可用');
    this.staticCtx = sctx;
    this.overlayCtx = octx;

    const probe = document.createElement('canvas').getContext('2d');
    if (!probe) throw new Error('Canvas 2D 上下文不可用');
    this.measure = createCanvasMeasurer((text, font) => {
      probe.font = font;
      return probe.measureText(text).width;
    });
  }

  get currentLayout(): LayoutResult | null {
    return this.layout;
  }

  resize(width: number, height: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssWidth = Math.max(1, Math.floor(width));
    this.cssHeight = Math.max(1, Math.floor(height));
    for (const canvas of [this.staticCanvas, this.overlayCanvas]) {
      canvas.width = Math.floor(this.cssWidth * this.dpr);
      canvas.height = Math.floor(this.cssHeight * this.dpr);
      canvas.style.width = `${this.cssWidth}px`;
      canvas.style.height = `${this.cssHeight}px`;
    }
    this.render();
  }

  update(input: Partial<RenderInput>): void {
    let relayout = false;

    if (input.sheet !== undefined && input.sheet !== this.sheet) {
      this.sheet = input.sheet;
      relayout = true;
    }
    if (input.collapsed !== undefined && input.collapsed !== this.collapsed) {
      this.collapsed = input.collapsed;
      relayout = true;
    }
    if (input.view !== undefined) this.view = input.view;
    if (input.selection !== undefined) this.selection = input.selection;
    if (input.matches !== undefined) this.matches = input.matches;

    if (relayout) {
      this.layout = this.sheet
        ? layoutSheet(this.sheet, this.collapsed, this.measure)
        : null;
    }
    this.render();
  }

  relayout(): void {
    this.layout = this.sheet ? layoutSheet(this.sheet, this.collapsed, this.measure) : null;
    this.render();
  }

  setDrag(drag: DragVisual | null): void {
    this.drag = drag;
    this.drawOverlay();
  }

  setZonePreview(rect: { x: number; y: number; w: number; h: number } | null): void {
    this.zonePreview = rect;
    this.drawOverlay();
  }

  setBoxPreview(rect: { x: number; y: number; w: number; h: number } | null): void {
    this.boxPreview = rect;
    this.drawOverlay();
  }

  setMarquee(rect: { x: number; y: number; w: number; h: number; crossing: boolean } | null): void {
    this.marquee = rect;
    this.drawOverlay();
  }

  topicsInRect(rect: { x: number; y: number; w: number; h: number }, crossing: boolean): TopicId[] {
    const ids: TopicId[] = [];
    const layout = this.layout;
    if (!layout) return ids;
    for (const box of layout.boxes.values()) {
      if (crossing) {
        const intersects =
          box.x < rect.x + rect.w && box.x + box.w > rect.x &&
          box.y < rect.y + rect.h && box.y + box.h > rect.y;
        if (intersects) ids.push(box.id);
      } else {
        const inside =
          box.x >= rect.x && box.y >= rect.y &&
          box.x + box.w <= rect.x + rect.w && box.y + box.h <= rect.y + rect.h;
        if (inside) ids.push(box.id);
      }
    }
    return ids;
  }

  resizeHandleAt(worldX: number, worldY: number): TopicId | null {
    if (this.selection.size !== 1) return null;
    const layout = this.layout;
    if (!layout) return null;
    const id = [...this.selection][0];
    if (!id) return null;
    const box = layout.boxes.get(id);
    if (!box) return null;
    const handleX = box.x + box.w;
    const handleY = box.y + box.h / 2;
    return Math.abs(worldX - handleX) <= 8 && Math.abs(worldY - handleY) <= 14 ? id : null;
  }

  heightHandleAt(worldX: number, worldY: number): TopicId | null {
    if (this.selection.size !== 1) return null;
    const layout = this.layout;
    if (!layout) return null;
    const id = [...this.selection][0];
    if (!id) return null;
    const box = layout.boxes.get(id);
    if (!box) return null;
    const handleX = box.x + box.w / 2;
    const handleY = box.y + box.h;
    return Math.abs(worldX - handleX) <= 16 && Math.abs(worldY - handleY) <= 8 ? id : null;
  }

  boundaryAt(worldX: number, worldY: number): string | null {
    const layout = this.layout;
    if (!layout) return null;
    for (let index = layout.boundaries.length - 1; index >= 0; index -= 1) {
      const boundary = layout.boundaries[index]!;
      const inside =
        worldX >= boundary.x && worldX <= boundary.x + boundary.w &&
        worldY >= boundary.y && worldY <= boundary.y + boundary.h;
      if (inside) return boundary.id;
    }
    return null;
  }

  boundaryTitleRect(id: string): { x: number; y: number; w: number; h: number } | null {
    const boundary = this.layout?.boundaries.find((item) => item.id === id);
    if (!boundary) return null;
    const width = Math.max(28, this.measure.width(boundary.title || '外框', 11, 600));
    return { x: boundary.x + 12, y: boundary.y + 8, w: width, h: 14 };
  }

  boundaryTitleAt(worldX: number, worldY: number): string | null {
    const layout = this.layout;
    if (!layout) return null;
    for (let index = layout.boundaries.length - 1; index >= 0; index -= 1) {
      const boundary = layout.boundaries[index]!;
      const rect = this.boundaryTitleRect(boundary.id);
      if (!rect) continue;
      const inside =
        worldX >= rect.x - 6 && worldX <= rect.x + rect.w + 6 &&
        worldY >= rect.y - 5 && worldY <= rect.y + rect.h + 5;
      if (inside) return boundary.id;
    }
    return null;
  }

  boundaryTitleScreenRect(id: string): { x: number; y: number; w: number; h: number } | null {
    const rect = this.boundaryTitleRect(id);
    if (!rect) return null;
    return {
      x: rect.x * this.view.zoom + this.view.panX,
      y: rect.y * this.view.zoom + this.view.panY,
      w: rect.w * this.view.zoom,
      h: rect.h * this.view.zoom
    };
  }

  zoneAt(worldX: number, worldY: number): { id: string; mode: 'move' | 'resize' } | null {
    const layout = this.layout;
    if (!layout) return null;
    for (let index = layout.zones.length - 1; index >= 0; index -= 1) {
      const zone = layout.zones[index]!;
      if (worldX < zone.x || worldX > zone.x + zone.w || worldY < zone.y || worldY > zone.y + zone.h) continue;
      const handle = 16;
      const inHandle =
        worldX >= zone.x + zone.w - handle && worldY >= zone.y + zone.h - handle;
      return { id: zone.id, mode: inHandle ? 'resize' : 'move' };
    }
    return null;
  }

  private render(): void {
    this.drawStatic();
    this.drawOverlay();
  }

  private worldViewport(): { x: number; y: number; w: number; h: number } {
    const { zoom, panX, panY } = this.view;
    return {
      x: -panX / zoom,
      y: -panY / zoom,
      w: this.cssWidth / zoom,
      h: this.cssHeight / zoom
    };
  }

  private drawStatic(): void {
    const ctx = this.staticCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const sheet = this.sheet;
    const layout = this.layout;
    if (!sheet || !layout) return;

    const style = sheet.style;
    const dark = style.darkCanvas;
    ctx.fillStyle = style.background;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    const { zoom, panX, panY } = this.view;
    this.drawGrid(ctx, dark);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    const viewport = this.worldViewport();
    const visible = (box: { x: number; y: number; w: number; h: number }) =>
      box.x + box.w >= viewport.x && box.x <= viewport.x + viewport.w &&
      box.y + box.h >= viewport.y && box.y <= viewport.y + viewport.h;

    for (const zone of layout.zones) {
      ctx.save();
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.035)' : 'rgba(47,111,159,0.05)';
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(47,111,159,0.34)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(zone.x, zone.y, zone.w, zone.h, 10);
      else ctx.rect(zone.x, zone.y, zone.w, zone.h);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = dark ? '#9fb3c8' : '#5f7d95';
      ctx.font = `600 11px ${FONT_STACK}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(zone.title, zone.x + 12, zone.y + 8);

      ctx.setLineDash([]);
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.32)' : 'rgba(47,111,159,0.42)';
      ctx.lineWidth = 1.2;
      const hx = zone.x + zone.w - 6;
      const hy = zone.y + zone.h - 6;
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy);
      ctx.lineTo(hx, hy - 8);
      ctx.moveTo(hx - 4, hy);
      ctx.lineTo(hx, hy - 4);
      ctx.stroke();
      ctx.restore();
    }

    for (const boundary of layout.boundaries) {
      ctx.save();
      ctx.fillStyle = dark ? 'rgba(224,122,47,0.12)' : 'rgba(224,122,47,0.07)';
      ctx.strokeStyle = 'rgba(224,122,47,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(boundary.x, boundary.y, boundary.w, boundary.h, 12);
      else ctx.rect(boundary.x, boundary.y, boundary.w, boundary.h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(196,86,26,0.95)';
      ctx.font = `600 11px ${FONT_STACK}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(boundary.title, boundary.x + 12, boundary.y + 8);
      ctx.restore();
    }

    if (layout.spine) {
      ctx.strokeStyle = dark ? '#46566a' : '#c3d0dc';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(layout.spine.x1, layout.spine.y1);
      ctx.lineTo(layout.spine.x2, layout.spine.y2);
      ctx.stroke();
    }

    const lod = zoom < 0.28 ? 0 : zoom < 0.5 ? 1 : 2;

    for (const edge of layout.edges) {
      const from = layout.boxes.get(edge.from);
      const to = layout.boxes.get(edge.to);
      if (!from || !to) continue;

      const union = {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        w: Math.max(from.x + from.w, to.x + to.w) - Math.min(from.x, to.x),
        h: Math.max(from.y + from.h, to.y + to.h) - Math.min(from.y, to.y)
      };
      if (!visible(union)) continue;

      const color = paletteColor(sheet, edge.to);
      ctx.strokeStyle = dark ? rgba(color, 0.62) : rgba(color, 0.5);
      ctx.lineWidth = Math.max(1, style.lineWidth * Math.max(0.55, 1 - to.depth * 0.12));
      ctx.lineJoin = 'round';
      const edgeStyle = sheet.style.edgeStyle ?? 'curve';
      ctx.beginPath();
      ctx.moveTo(edge.x1, edge.y1);
      if (edgeStyle === 'straight') {
        ctx.lineTo(edge.x2, edge.y2);
      } else if (edgeStyle === 'elbow') {
        if (edge.orientation === 'v') {
          const midY = (edge.y1 + edge.y2) / 2;
          ctx.lineTo(edge.x1, midY);
          ctx.lineTo(edge.x2, midY);
          ctx.lineTo(edge.x2, edge.y2);
        } else {
          const midX = (edge.x1 + edge.x2) / 2;
          ctx.lineTo(midX, edge.y1);
          ctx.lineTo(midX, edge.y2);
          ctx.lineTo(edge.x2, edge.y2);
        }
      } else if (edge.orientation === 'v') {
        const midY = (edge.y1 + edge.y2) / 2;
        ctx.bezierCurveTo(edge.x1, midY, edge.x2, midY, edge.x2, edge.y2);
      } else {
        const midX = (edge.x1 + edge.x2) / 2;
        ctx.bezierCurveTo(midX, edge.y1, midX, edge.y2, edge.x2, edge.y2);
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = dark ? 'rgba(178,150,214,0.75)' : 'rgba(107,75,138,0.70)';
    ctx.fillStyle = dark ? 'rgba(178,150,214,0.92)' : 'rgba(107,75,138,0.92)';
    ctx.lineWidth = 1.4;
    ctx.font = `500 10.5px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const relation of layout.relationships) {
      const midX = (relation.x1 + relation.x2) / 2;
      const midY = (relation.y1 + relation.y2) / 2;
      ctx.beginPath();
      ctx.moveTo(relation.x1, relation.y1);
      ctx.bezierCurveTo(midX, relation.y1, midX, relation.y2, relation.x2, relation.y2);
      ctx.stroke();
      if (relation.label) ctx.fillText(relation.label, midX, midY - 4);
    }

    ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.restore();

    const hasQuery = this.matches !== null;

    for (const box of layout.boxes.values()) {
      if (!visible(box)) continue;
      const dim = hasQuery && !this.matches!.has(box.id);
      ctx.globalAlpha = dim ? 0.24 : 1;
      this.drawNode(ctx, sheet, box, lod, dark);
      ctx.globalAlpha = 1;

      if (hasQuery && this.matches!.has(box.id)) {
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6, RADIUS + 3);
        } else {
          ctx.rect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
        }
        ctx.strokeStyle = 'rgba(224, 122, 47, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, dark: boolean): void {
    const { zoom, panX, panY } = this.view;
    if (zoom < 0.22) return;
    const step = 28 * zoom;
    if (step < 12) return;
    const offsetX = panX % step;
    const offsetY = panY % step;

    ctx.save();
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.055)' : 'rgba(24,42,64,0.07)';
    for (let x = offsetX; x < this.cssWidth; x += step) {
      for (let y = offsetY; y < this.cssHeight; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawNode(
    ctx: CanvasRenderingContext2D,
    sheet: Sheet,
    box: NodeBox,
    lod: number,
    dark: boolean
  ): void {
    const topic = sheet.topics[box.id];
    if (!topic) return;

    const isRoot = box.id === sheet.rootId;
    const colors = nodeColors(sheet, box.id, dark);
    const style = topic.styleOverride;

    const x = box.x;
    const y = box.y;
    traceTopicPath(ctx, style?.shape, x, y, box.w, box.h, isRoot);
    ctx.fillStyle = style?.fill ?? colors.fill;
    ctx.fill();
    ctx.strokeStyle = style?.stroke ?? colors.stroke;
    ctx.lineWidth = style?.strokeWidth ?? 1;
    ctx.stroke();

    if (lod === 0) return;

    const textColor = style?.textColor ?? colors.text;
    const weight = style?.fontWeight ?? (isRoot ? 700 : 500);
    const italic = Boolean(style?.italic);
    const underline = Boolean(style?.underline);
    const strike = Boolean(style?.strike);
    const align = style?.align ?? 'left';
    const fontSize = topic.fontSize ?? (isRoot ? 15 : 13);

    let textX = x + 13;
    const markers = topic.markers?.length
      ? topic.markers
      : topic.marker
        ? [topic.marker]
        : [];
    for (const marker of markers) {
      const markerStyle = MARKER_STYLE[marker];
      if (!markerStyle) continue;
      const chipX = textX - 2;
      const chipY = y + box.h / 2 - 9;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(chipX, chipY, 18, 18, 5);
      else ctx.rect(chipX, chipY, 18, 18);
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(24,42,64,0.06)';
      ctx.fill();
      ctx.fillStyle = markerStyle.color;
      ctx.font = `600 12px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(markerStyle.glyph, chipX + 9, chipY + 9.5);
      ctx.textAlign = 'left';
      textX += 22;
    }

    if (topic.image) {
      const thumb = 24;
      const iy = y + (box.h - thumb) / 2;
      const image = this.imageOf(topic.image.dataUrl);
      if (image && image.complete && image.naturalWidth > 0) {
        ctx.drawImage(image, x + 8, iy, thumb, thumb);
      } else {
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(24,42,64,0.08)';
        ctx.fillRect(x + 8, iy, thumb, thumb);
      }
      textX += thumb + 6;
    }

    const rightIcons =
      (topic.link ? 14 : 0) +
      ((topic.attachments?.length ?? 0) > 0 ? 14 : 0) +
      ((topic.audio?.length ?? 0) > 0 ? 14 : 0);
    const maxWidth = box.w - (textX - x) - 12 - rightIcons;

    const baseFont = `${italic ? 'italic ' : ''}${weight} ${fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = textColor;
    ctx.font = baseFont;
    ctx.textBaseline = 'middle';

    const rawText = topic.text || ' ';
    const measureFn = (value: string, size: number, weightValue: number): number => {
      ctx.font = `${italic ? 'italic ' : ''}${weightValue} ${size}px ${FONT_STACK}`;
      return ctx.measureText(value).width;
    };
    const lines = hasRichMarkup(rawText)
      ? rawText.split('\n')
      : wrapText(stripRich(rawText), maxWidth, fontSize, weight, measureFn);
    const lineHeight = Math.round(fontSize * 1.35);
    const blockHeight = lines.length * lineHeight;
    const centerOffset = topic.equation ? -9 : 0;
    const firstCenter = (box.h - blockHeight) / 2 + lineHeight / 2 + centerOffset;
    const alignStart = (lineWidth: number): number => {
      if (align === 'center') return textX + Math.max(0, (maxWidth - lineWidth) / 2);
      if (align === 'right') return textX + Math.max(0, maxWidth - lineWidth);
      return textX;
    };
    const decorations = (startX: number, width: number, centerY: number): void => {
      const thick = Math.max(1, fontSize * 0.06);
      if (underline) ctx.fillRect(startX, centerY + fontSize * 0.42, width, thick);
      if (strike) ctx.fillRect(startX, centerY, width, thick);
    };

    lines.forEach((line, index) => {
      const centerY = y + firstCenter + index * lineHeight;
      const runs = parseRich(line || ' ');
      const fontOf = (bold: boolean, runItalic: boolean): string =>
        `${runItalic || italic ? 'italic ' : ''}${bold ? 700 : weight} ${fontSize}px ${FONT_STACK}`;

      let total = 0;
      for (const run of runs) {
        ctx.font = fontOf(Boolean(run.bold), Boolean(run.italic));
        total += ctx.measureText(run.text).width;
      }

      if (total > maxWidth) {
        const label = this.fit(ctx, stripRich(line) || ' ', maxWidth, weight, fontSize);
        ctx.font = baseFont;
        ctx.fillStyle = textColor;
        const labelWidth = ctx.measureText(label).width;
        const startX = alignStart(labelWidth);
        ctx.fillText(label, startX, centerY);
        decorations(startX, labelWidth, centerY);
        return;
      }

      let cursorX = alignStart(total);
      for (const run of runs) {
        ctx.font = fontOf(Boolean(run.bold), Boolean(run.italic));
        ctx.fillStyle = textColor;
        ctx.fillText(run.text, cursorX, centerY);
        const runWidth = ctx.measureText(run.text).width;
        decorations(cursorX, runWidth, centerY);
        cursorX += runWidth;
      }
    });

    if (topic.equation) {
      ctx.font = `italic 10px ${FONT_STACK}`;
      ctx.fillStyle = dark ? '#9fb3c8' : '#5d6b7a';
      const latex = formatLatex(topic.equation.latex);
      const shown = latex.length > 42 ? `${latex.slice(0, 42)}…` : latex;
      ctx.fillText(`∑ ${shown}`, textX, y + box.h - 10);
    }

    if (rightIcons > 0) {
      ctx.font = `11px ${FONT_STACK}`;
      ctx.textAlign = 'right';
      let rx = x + box.w - 8;
      if ((topic.audio?.length ?? 0) > 0) {
        ctx.fillStyle = dark ? '#c7b3e6' : '#6b4b8a';
        ctx.fillText('▶', rx, y + box.h / 2 + 0.5);
        rx -= 14;
      }
      if ((topic.attachments?.length ?? 0) > 0) {
        ctx.fillStyle = dark ? '#9fb3c8' : '#5f7d95';
        ctx.fillText('📎', rx, y + box.h / 2 + 0.5);
        rx -= 14;
      }
      if (topic.link) {
        ctx.fillStyle = dark ? '#8fc0e2' : '#2f6f9f';
        ctx.fillText('↗', rx, y + box.h / 2 + 0.5);
      }
      ctx.textAlign = 'left';
    }

    if (box.collapsedCount > 0) {
      const cx = x + box.w - 2;
      const cy = y + box.h - 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#e07a2f';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 9.5px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(box.collapsedCount), cx, cy + 0.5);
      ctx.textAlign = 'left';
    }

    if (topic.task) {
      const pct = Math.max(0, Math.min(100, topic.task.progress));
      const barW = box.w - 20;
      const barY = y + box.h - 4;
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(24,42,64,0.10)';
      ctx.fillRect(x + 10, barY, barW, 2);
      ctx.fillStyle = colors.base;
      ctx.fillRect(x + 10, barY, (barW * pct) / 100, 2);
    }
  }

  private imageOf(src: string): HTMLImageElement | null {
    if (typeof Image === 'undefined') return null;
    let image = this.images.get(src);
    if (!image) {
      image = new Image();
      image.onload = () => this.render();
      image.src = src;
      this.images.set(src, image);
    }
    return image;
  }

  private fit(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    weight: number,
    fontSize: number
  ): string {
    const key = `${weight}|${fontSize}|${Math.round(maxWidth)}|${text}`;
    const cached = this.textCache.get(key);
    if (cached !== undefined) return cached;

    ctx.font = `${weight} ${fontSize}px ${FONT_STACK}`;
    let out = text;
    if (ctx.measureText(text).width > maxWidth) {
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        const candidate = `${text.slice(0, mid)}…`;
        if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
        else hi = mid - 1;
      }
      out = lo > 0 ? `${text.slice(0, lo)}…` : '…';
    }

    if (this.textCache.size > 4000) this.textCache.clear();
    this.textCache.set(key, out);
    return out;
  }

  private drawOverlay(): void {
    const ctx = this.overlayCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const layout = this.layout;
    if (!layout) return;

    const { zoom, panX, panY } = this.view;
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    for (const id of this.selection) {
      const box = layout.boxes.get(id);
      if (!box) continue;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6, RADIUS + 3);
      } else {
        ctx.rect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
      }
      ctx.strokeStyle = '#e07a2f';
      ctx.lineWidth = 2 / Math.max(zoom, 0.4);
      ctx.stroke();
    }

    if (this.selection.size === 1) {
      const only = [...this.selection][0];
      const box = only ? layout.boxes.get(only) : null;
      if (box) {
        const hx = box.x + box.w;
        const hy = box.y + box.h / 2;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(hx - 3, hy - 10, 6, 20, 3);
        else ctx.rect(hx - 3, hy - 10, 6, 20);
        ctx.fillStyle = 'rgba(47,111,159,0.85)';
        ctx.fill();

        const bx = box.x + box.w / 2;
        const by = box.y + box.h;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') ctx.roundRect(bx - 10, by - 3, 20, 6, 3);
        else ctx.rect(bx - 10, by - 3, 20, 6);
        ctx.fillStyle = 'rgba(47,111,159,0.85)';
        ctx.fill();
      }
    }

    if (this.boxPreview) {
      const rect = this.boxPreview;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(47,111,159,0.85)';
      ctx.lineWidth = 1.4 / Math.max(zoom, 0.4);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }

    if (this.zonePreview) {
      const zone = this.zonePreview;
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(47,111,159,0.9)';
      ctx.lineWidth = 1.5 / Math.max(zoom, 0.4);
      ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
      ctx.restore();
    }

    if (this.marquee) {
      const rect = this.marquee;
      ctx.save();
      ctx.fillStyle = rect.crossing ? 'rgba(43,122,75,0.08)' : 'rgba(47,111,159,0.08)';
      ctx.strokeStyle = rect.crossing ? 'rgba(43,122,75,0.9)' : 'rgba(47,111,159,0.9)';
      ctx.lineWidth = 1.2 / Math.max(zoom, 0.4);
      if (rect.crossing) ctx.setLineDash([6, 4]);
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }

    if (this.drag) {
      const target = this.drag.targetId ? layout.boxes.get(this.drag.targetId) : null;
      if (target) {
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(target.x - 4, target.y - 4, target.w + 8, target.h + 8, RADIUS + 4);
        } else {
          ctx.rect(target.x - 4, target.y - 4, target.w + 8, target.h + 8);
        }
        ctx.strokeStyle = this.drag.valid ? '#2b7a4b' : '#b3261e';
        ctx.lineWidth = 2 / Math.max(zoom, 0.4);
        ctx.stroke();
      }

      const text = this.sheet?.topics[this.drag.fromId]?.text ?? '移动';
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#2f6f9f';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(this.drag.x - 58, this.drag.y - 17, 116, 34, 8);
      } else {
        ctx.rect(this.drag.x - 58, this.drag.y - 17, 116, 34);
      }
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#22303d';
      ctx.font = `500 12px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.length > 8 ? `${text.slice(0, 8)}…` : text, this.drag.x, this.drag.y);
      ctx.textAlign = 'left';
      ctx.restore();
    }

    ctx.restore();
  }

  hitTest(worldX: number, worldY: number): TopicId | null {
    const layout = this.layout;
    if (!layout) return null;
    let found: TopicId | null = null;
    for (const box of layout.boxes.values()) {
      if (
        worldX >= box.x && worldX <= box.x + box.w &&
        worldY >= box.y && worldY <= box.y + box.h
      ) {
        found = box.id;
      }
    }
    return found;
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.view.panX) / this.view.zoom,
      y: (screenY - this.view.panY) / this.view.zoom
    };
  }

  nodeScreenRect(id: TopicId): { x: number; y: number; w: number; h: number } | null {
    const box = this.layout?.boxes.get(id);
    if (!box) return null;
    return {
      x: box.x * this.view.zoom + this.view.panX,
      y: box.y * this.view.zoom + this.view.panY,
      w: box.w * this.view.zoom,
      h: box.h * this.view.zoom
    };
  }

  contentBounds(): { x: number; y: number; w: number; h: number } | null {
    return this.layout ? this.layout.bounds : null;
  }

  size(): { w: number; h: number } {
    return { w: this.cssWidth, h: this.cssHeight };
  }
}
