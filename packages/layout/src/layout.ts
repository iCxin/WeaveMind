/**
 * 布局引擎。
 *
 * 当前实现覆盖 PRD 中的四种主力结构（思维导图 / 逻辑图 / 组织结构图 / 鱼骨图）
 * 与树形图；括号图、时间轴、树型表格、矩阵图按技术方案 5.3 的算法预留。
 *
 * 布局为纯函数：输入 Sheet + 折叠集合 + 度量器，输出节点包围盒与连线几何。
 * 增量布局通过“只重排脏子树”在上层实现，引擎本身保持无状态。
 */

import type { Sheet, StructureKind, TopicId, Zone } from '../../core/src/types.ts';
import { hasRichMarkup, stripRich } from '../../core/src/rich.ts';
import { wrapText } from './wrap.ts';
import type { TextMeasurer } from './measure.ts';

export const NODE_H = 34;
export const GAP_X = 56;
export const GAP_Y = 22;
export const PAD_X = 14;
export const MIN_W = 84;
export const MAX_W = 360;
export const COL_GAP = 44;
export const ROW_GAP = 52;
export const COLLISION_PAD = 10;

export interface NodeBox {
  readonly id: TopicId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly depth: number;
  readonly collapsedCount: number;
}

export interface EdgeGeo {
  readonly from: TopicId;
  readonly to: TopicId;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly orientation: 'h' | 'v' | 'free';
}

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface BoundaryBox {
  readonly id: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface RelationshipBox {
  readonly id: string;
  readonly from: TopicId;
  readonly to: TopicId;
  readonly label: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface LayoutResult {
  readonly boxes: Map<TopicId, NodeBox>;
  readonly edges: readonly EdgeGeo[];
  readonly bounds: Bounds;
  readonly boundaries: readonly BoundaryBox[];
  readonly relationships: readonly RelationshipBox[];
  readonly zones: readonly Zone[];
  readonly spine?: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };
}

interface Size {
  w: number;
  h: number;
}

function childIds(sheet: Sheet, id: TopicId, collapsed: ReadonlySet<TopicId>): readonly TopicId[] {
  const t = sheet.topics[id];
  if (!t) return [];
  if (collapsed.has(id)) return [];
  return t.children.filter((childId) => sheet.topics[childId]?.kind !== 'summary');
}

function measureAll(sheet: Sheet, measure: TextMeasurer): Map<TopicId, Size> {
  const sizes = new Map<TopicId, Size>();
  for (const topic of Object.values(sheet.topics)) {
    const weight = topic.styleOverride?.fontWeight ?? (topic.kind === 'root' ? 700 : 500);
    const baseFont = topic.kind === 'root' ? 15 : 13;
    const fontSize = topic.fontSize ?? baseFont;
    const plain = stripRich(topic.text.length ? topic.text : ' ');
    const natural = plain.split('\n');
    const raw = Math.max(...natural.map((line) => measure.width(line || ' ', fontSize, weight)));
    const latex = topic.equation ? measure.width(topic.equation.latex, 10, 400) : 0;
    const markerCount = topic.markers?.length ?? (topic.marker ? 1 : 0);
    const media =
      markerCount * 22 +
      (topic.image ? 26 : 0) +
      ((topic.attachments?.length ?? 0) > 0 ? 18 : 0) +
      ((topic.audio?.length ?? 0) > 0 ? 16 : 0) +
      (topic.equation ? 18 : 0);
    const computed = Math.round(Math.max(raw, latex + 18) + PAD_X * 2 + media);
    const w = topic.width ?? Math.min(MAX_W, Math.max(MIN_W, computed));
    const innerWidth = Math.max(24, w - PAD_X * 2 - media);
    const lines = hasRichMarkup(topic.text)
      ? natural
      : wrapText(plain, innerWidth, fontSize, weight, measure.width);
    const lineHeight = Math.round(fontSize * 1.35);
    const textHeight = lines.length * lineHeight + 14;
    const autoHeight = Math.max(topic.equation ? 46 : NODE_H, textHeight + (topic.equation ? 14 : 0));
    const h = topic.height ?? autoHeight;
    sizes.set(topic.id, { w, h });
  }
  return sizes;
}

function countDescendants(sheet: Sheet, id: TopicId): number {
  let n = 0;
  const walk = (cur: TopicId) => {
    const t = sheet.topics[cur];
    if (!t) return;
    for (const c of t.children) {
      n += 1;
      walk(c);
    }
  };
  walk(id);
  return n;
}

function subtreeHeight(
  sheet: Sheet,
  id: TopicId,
  collapsed: ReadonlySet<TopicId>,
  sizes: Map<TopicId, Size>,
  memo: Map<TopicId, number>
): number {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  const own = sizes.get(id)?.h ?? NODE_H;
  const kids = childIds(sheet, id, collapsed);
  let height = own;
  if (kids.length > 0) {
    let sum = 0;
    kids.forEach((kid, index) => {
      sum += subtreeHeight(sheet, kid, collapsed, sizes, memo);
      if (index > 0) sum += GAP_Y;
    });
    height = Math.max(own, sum);
  }
  memo.set(id, height);
  return height;
}

function subtreeWidth(
  sheet: Sheet,
  id: TopicId,
  collapsed: ReadonlySet<TopicId>,
  sizes: Map<TopicId, Size>,
  memo: Map<TopicId, number>
): number {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  const own = sizes.get(id)?.w ?? MIN_W;
  const kids = childIds(sheet, id, collapsed);
  let width = own;
  if (kids.length > 0) {
    let sum = 0;
    kids.forEach((kid, index) => {
      sum += subtreeWidth(sheet, kid, collapsed, sizes, memo);
      if (index > 0) sum += COL_GAP;
    });
    width = Math.max(own, sum);
  }
  memo.set(id, width);
  return width;
}

interface Ctx {
  sheet: Sheet;
  collapsed: ReadonlySet<TopicId>;
  sizes: Map<TopicId, Size>;
  heightMemo: Map<TopicId, number>;
  boxes: Map<TopicId, NodeBox>;
  depth: number;
}

function placeHorizontal(ctx: Ctx, id: TopicId, cx: number, cy: number, dir: 1 | -1, depth: number): void {
  const size = ctx.sizes.get(id);
  if (!size) return;
  ctx.boxes.set(id, {
    id,
    x: cx - size.w / 2,
    y: cy - size.h / 2,
    w: size.w,
    h: size.h,
    depth,
    collapsedCount: ctx.collapsed.has(id) ? countDescendants(ctx.sheet, id) : 0
  });

  const kids = childIds(ctx.sheet, id, ctx.collapsed);
  if (kids.length === 0) return;

  let total = 0;
  kids.forEach((kid, index) => {
    total += subtreeHeight(ctx.sheet, kid, ctx.collapsed, ctx.sizes, ctx.heightMemo);
    if (index > 0) total += GAP_Y;
  });

  let cursor = cy - total / 2;
  for (const kid of kids) {
    const kh = subtreeHeight(ctx.sheet, kid, ctx.collapsed, ctx.sizes, ctx.heightMemo);
    const kw = ctx.sizes.get(kid)?.w ?? MIN_W;
    const kidCx = cx + dir * (size.w / 2 + GAP_X + kw / 2);
    placeHorizontal(ctx, kid, kidCx, cursor + kh / 2, dir, depth + 1);
    cursor += kh + GAP_Y;
  }
}

function placeVertical(
  ctx: Ctx,
  id: TopicId,
  cx: number,
  cy: number,
  depth: number,
  direction: 1 | -1 = 1
): void {
  const size = ctx.sizes.get(id);
  if (!size) return;
  ctx.boxes.set(id, {
    id,
    x: cx - size.w / 2,
    y: cy - size.h / 2,
    w: size.w,
    h: size.h,
    depth,
    collapsedCount: ctx.collapsed.has(id) ? countDescendants(ctx.sheet, id) : 0
  });

  const kids = childIds(ctx.sheet, id, ctx.collapsed);
  if (kids.length === 0) return;

  const widthMemo = new Map<TopicId, number>();
  let total = 0;
  kids.forEach((kid, index) => {
    total += subtreeWidth(ctx.sheet, kid, ctx.collapsed, ctx.sizes, widthMemo);
    if (index > 0) total += COL_GAP;
  });

  let cursor = cx - total / 2;
  for (const kid of kids) {
    const kw = subtreeWidth(ctx.sheet, kid, ctx.collapsed, ctx.sizes, widthMemo);
    const kh = ctx.sizes.get(kid)?.h ?? NODE_H;
    const kidCx = cursor + kw / 2;
    const kidCy = cy + direction * (size.h / 2 + ROW_GAP + kh / 2);
    placeVertical(ctx, kid, kidCx, kidCy, depth + 1, direction);
    cursor += kw + COL_GAP;
  }
}

/** 水平时间轴：主分支沿轴线上下交替，后代沿同一侧纵向展开。 */
function placeTimeline(ctx: Ctx, rootSize: { w: number; h: number }): number {
  const kids = childIds(ctx.sheet, ctx.sheet.rootId, ctx.collapsed);
  let lastX = rootSize.w / 2 + 120;

  kids.forEach((kid, index) => {
    const size = ctx.sizes.get(kid) ?? { w: MIN_W, h: NODE_H };
    const cx = 170 + index * 210;
    const direction: 1 | -1 = index % 2 === 0 ? -1 : 1;
    const cy = direction * 78;
    lastX = Math.max(lastX, cx + size.w / 2);

    ctx.boxes.set(kid, {
      id: kid,
      x: cx - size.w / 2,
      y: cy - size.h / 2,
      w: size.w,
      h: size.h,
      depth: 1,
      collapsedCount: ctx.collapsed.has(kid) ? countDescendants(ctx.sheet, kid) : 0
    });

    const placeStack = (parentId: TopicId, parentCx: number, startY: number, depth: number): void => {
      let cursor = startY;
      for (const child of childIds(ctx.sheet, parentId, ctx.collapsed)) {
        const childSize = ctx.sizes.get(child) ?? { w: MIN_W, h: NODE_H };
        const childCx = parentCx + 18;
        const childCy = cursor + direction * childSize.h / 2;
        ctx.boxes.set(child, {
          id: child,
          x: childCx - childSize.w / 2,
          y: childCy - childSize.h / 2,
          w: childSize.w,
          h: childSize.h,
          depth,
          collapsedCount: ctx.collapsed.has(child) ? countDescendants(ctx.sheet, child) : 0
        });
        placeStack(child, childCx, childCy + direction * (childSize.h / 2 + 12), depth + 1);
        cursor += direction * (childSize.h + 12);
      }
    };

    placeStack(kid, cx, cy + direction * (size.h / 2 + 24), 2);
  });

  return lastX + 80;
}

function edgeOf(parent: NodeBox, child: NodeBox): EdgeGeo {
  const dx = child.x + child.w / 2 - (parent.x + parent.w / 2);
  const dy = child.y + child.h / 2 - (parent.y + parent.h / 2);

  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 24) {
    const down = dy > 0;
    return {
      from: parent.id,
      to: child.id,
      x1: parent.x + parent.w / 2,
      y1: parent.y + (down ? parent.h : 0),
      x2: child.x + child.w / 2,
      y2: child.y + (down ? 0 : child.h),
      orientation: 'v'
    };
  }

  const right = dx >= 0;
  return {
    from: parent.id,
    to: child.id,
    x1: parent.x + (right ? parent.w : 0),
    y1: parent.y + parent.h / 2,
    x2: child.x + (right ? 0 : child.w),
    y2: child.y + child.h / 2,
    orientation: 'h'
  };
}

interface MutableBox {
  id: TopicId;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  collapsedCount: number;
}

/**
 * 手动定位主题的自动排斥：只推离被手动移动过的节点，避免破坏自动布局。
 * 两两 AABB 检测，沿重叠较浅的轴分离；迭代若干轮以处理链式重叠。
 */
function separateOverlaps(boxes: Map<TopicId, NodeBox>, movableIds: ReadonlySet<TopicId>): void {
  if (movableIds.size === 0 || boxes.size < 2) return;

  const items: MutableBox[] = [...boxes.values()].map((box) => ({ ...box }));
  const movable = items.filter((item) => movableIds.has(item.id));
  const passes = movableIds.size > 200 ? 4 : 8;

  for (let pass = 0; pass < passes; pass += 1) {
    let changed = false;
    for (const a of movable) {
      for (const b of items) {
        if (a.id === b.id) continue;
        const bMovable = movableIds.has(b.id);
        // 双可动节点只处理一次，避免同一轮内重复推挤
        if (bMovable && a.id >= b.id) continue;

        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + COLLISION_PAD;
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + COLLISION_PAD;
        if (overlapX <= 0 || overlapY <= 0) continue;

        changed = true;
        const share = bMovable ? 0.5 : 1;
        if (overlapX < overlapY) {
          const dir = a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1;
          a.x += dir * overlapX * share;
          if (bMovable) b.x -= dir * overlapX * share;
        } else {
          const dir = a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1;
          a.y += dir * overlapY * share;
          if (bMovable) b.y -= dir * overlapY * share;
        }
      }
    }
    if (!changed) break;
  }

  for (const item of items) {
    const original = boxes.get(item.id);
    if (!original) continue;
    if (item.x !== original.x || item.y !== original.y) {
      boxes.set(item.id, { ...original, x: item.x, y: item.y });
    }
  }
}

export function layoutSheet(
  sheet: Sheet,
  collapsed: ReadonlySet<TopicId>,
  measure: TextMeasurer,
  overrideStructure?: StructureKind
): LayoutResult {
  const structure = overrideStructure ?? sheet.structure;
  const sizes = measureAll(sheet, measure);
  const ctx: Ctx = {
    sheet,
    collapsed,
    sizes,
    heightMemo: new Map(),
    boxes: new Map(),
    depth: 0
  };

  const rootSize = sizes.get(sheet.rootId) ?? { w: MIN_W, h: NODE_H };

  if (structure === 'org-down') {
    placeVertical(ctx, sheet.rootId, 0, 0, 0, 1);
  } else if (structure === 'org-up') {
    placeVertical(ctx, sheet.rootId, 0, 0, 0, -1);
  } else if (structure === 'fishbone-right' || structure === 'fishbone-left') {
    const sideDir: 1 | -1 = structure === 'fishbone-left' ? -1 : 1;
    ctx.boxes.set(sheet.rootId, {
      id: sheet.rootId,
      x: -rootSize.w / 2,
      y: -rootSize.h / 2,
      w: rootSize.w,
      h: rootSize.h,
      depth: 0,
      collapsedCount: 0
    });
    const kids = childIds(sheet, sheet.rootId, collapsed);
    kids.forEach((kid, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      const bx = sideDir * (120 + index * 178);
      const by = side * 84;
      const ks = sizes.get(kid) ?? { w: MIN_W, h: NODE_H };
      ctx.boxes.set(kid, {
        id: kid,
        x: bx - ks.w / 2,
        y: by - ks.h / 2,
        w: ks.w,
        h: ks.h,
        depth: 1,
        collapsedCount: collapsed.has(kid) ? countDescendants(sheet, kid) : 0
      });
      const grandKids = childIds(sheet, kid, collapsed);
      grandKids.forEach((gk, gi) => {
        const gs = sizes.get(gk) ?? { w: MIN_W, h: NODE_H };
        const gy = by + side * (46 + gi * 44);
        ctx.boxes.set(gk, {
          id: gk,
          x: bx - gs.w / 2,
          y: gy - gs.h / 2,
          w: gs.w,
          h: gs.h,
          depth: 2,
          collapsedCount: collapsed.has(gk) ? countDescendants(sheet, gk) : 0
        });
      });
    });
  } else {
    const dir: 1 | -1 = structure === 'logic-left' || structure === 'tree-left' ? -1 : 1;
    ctx.boxes.set(sheet.rootId, {
      id: sheet.rootId,
      x: -rootSize.w / 2,
      y: -rootSize.h / 2,
      w: rootSize.w,
      h: rootSize.h,
      depth: 0,
      collapsedCount: 0
    });

    const kids = childIds(sheet, sheet.rootId, collapsed);
    if (structure === 'timeline-right') {
      placeTimeline(ctx, rootSize);
    } else if (structure === 'mindmap') {
      const right: TopicId[] = [];
      const left: TopicId[] = [];
      kids.forEach((kid, index) => (index % 2 === 0 ? right : left).push(kid));

      const placeSide = (list: TopicId[], sign: 1 | -1) => {
        if (!list.length) return;
        let total = 0;
        list.forEach((kid, index) => {
          total += subtreeHeight(sheet, kid, collapsed, sizes, ctx.heightMemo);
          if (index > 0) total += GAP_Y;
        });
        let cursor = -total / 2;
        for (const kid of list) {
          const kh = subtreeHeight(sheet, kid, collapsed, sizes, ctx.heightMemo);
          const kw = sizes.get(kid)?.w ?? MIN_W;
          const kidCx = sign * (rootSize.w / 2 + GAP_X + kw / 2);
          placeHorizontal(ctx, kid, kidCx, cursor + kh / 2, sign, 1);
          cursor += kh + GAP_Y;
        }
      };

      placeSide(right, 1);
      placeSide(left, -1);
    } else {
      let total = 0;
      kids.forEach((kid, index) => {
        total += subtreeHeight(sheet, kid, collapsed, sizes, ctx.heightMemo);
        if (index > 0) total += GAP_Y;
      });
      let cursor = -total / 2;
      for (const kid of kids) {
        const kh = subtreeHeight(sheet, kid, collapsed, sizes, ctx.heightMemo);
        const kw = sizes.get(kid)?.w ?? MIN_W;
        const kidCx = dir * (rootSize.w / 2 + GAP_X + kw / 2);
        placeHorizontal(ctx, kid, kidCx, cursor + kh / 2, dir, 1);
        cursor += kh + GAP_Y;
      }
    }
  }

  // 浮动主题：以 offsetX/offsetY 为绝对中心，子树向下展开
  for (const topic of Object.values(sheet.topics)) {
    if (topic.kind !== 'floating' || ctx.boxes.has(topic.id)) continue;
    placeVertical(
      ctx,
      topic.id,
      topic.offsetX ?? 240,
      topic.offsetY ?? 160,
      0,
      1
    );
  }

  // 概要节点：置于被覆盖主题右侧，连线在坐标最终确定后统一生成
  for (const topic of Object.values(sheet.topics)) {
    if (topic.kind !== 'summary' || !topic.summaryOf || topic.summaryOf.length === 0) continue;
    const covered = topic.summaryOf
      .map((id) => ctx.boxes.get(id))
      .filter((box): box is NodeBox => Boolean(box));
    if (covered.length === 0) continue;
    const size = ctx.sizes.get(topic.id) ?? { w: MIN_W, h: NODE_H };
    const right = Math.max(...covered.map((box) => box.x + box.w));
    const top = Math.min(...covered.map((box) => box.y));
    const bottom = Math.max(...covered.map((box) => box.y + box.h));
    const box: NodeBox = {
      id: topic.id,
      x: right + GAP_X,
      y: (top + bottom) / 2 - size.h / 2,
      w: size.w,
      h: size.h,
      depth: covered[0]?.depth ?? 1,
      collapsedCount: 0
    };
    ctx.boxes.set(topic.id, box);
  }

  // 手动位置微调：仅移动自身，连线随最终坐标重算
  const offsetIds = new Set<TopicId>();
  for (const box of ctx.boxes.values()) {
    const topic = sheet.topics[box.id];
    if (!topic) continue;
    if (topic.kind === 'floating') {
      offsetIds.add(box.id);
      continue;
    }
    const dx = topic.offsetX ?? 0;
    const dy = topic.offsetY ?? 0;
    if (dx === 0 && dy === 0) continue;
    offsetIds.add(box.id);
    ctx.boxes.set(box.id, { ...box, x: box.x + dx, y: box.y + dy });
  }

  // 自动排斥：被拖动的主题与其它主题重叠时自动分离
  separateOverlaps(ctx.boxes, offsetIds);

  // 连线在最终坐标确定后生成，确保线条始终跟随节点位置
  const edges: EdgeGeo[] = [];
  for (const box of ctx.boxes.values()) {
    const topic = sheet.topics[box.id];
    if (!topic) continue;
    for (const childId of topic.children) {
      if (sheet.topics[childId]?.kind === 'summary') continue;
      const childBox = ctx.boxes.get(childId);
      if (childBox) edges.push(edgeOf(box, childBox));
    }
  }
  for (const topic of Object.values(sheet.topics)) {
    if (topic.kind !== 'summary' || !topic.summaryOf) continue;
    const summaryBox = ctx.boxes.get(topic.id);
    if (!summaryBox) continue;
    for (const coveredId of topic.summaryOf) {
      const coveredBox = ctx.boxes.get(coveredId);
      if (coveredBox) edges.push(edgeOf(coveredBox, summaryBox));
    }
  }

  const boundaries: BoundaryBox[] = [];
  for (const boundary of sheet.boundaries ?? []) {
    const boxes = boundary.topicIds
      .map((id) => ctx.boxes.get(id))
      .filter((box): box is NodeBox => Boolean(box));
    if (boxes.length === 0) continue;
    const left = Math.min(...boxes.map((box) => box.x)) - 16;
    const top = Math.min(...boxes.map((box) => box.y)) - 30;
    const right = Math.max(...boxes.map((box) => box.x + box.w)) + 16;
    const bottom = Math.max(...boxes.map((box) => box.y + box.h)) + 14;
    boundaries.push({
      id: boundary.id,
      title: boundary.title,
      x: left,
      y: top,
      w: right - left,
      h: bottom - top
    });
  }

  const relationships: RelationshipBox[] = [];
  for (const relation of sheet.relationships ?? []) {
    const a = ctx.boxes.get(relation.from);
    const b = ctx.boxes.get(relation.to);
    if (!a || !b) continue;
    const acx = a.x + a.w / 2;
    const acy = a.y + a.h / 2;
    const bcx = b.x + b.w / 2;
    const bcy = b.y + b.h / 2;
    const dx = bcx - acx;
    const dy = bcy - acy;
    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const rightward = dx >= 0;
      x1 = a.x + (rightward ? a.w : 0);
      y1 = acy;
      x2 = b.x + (rightward ? 0 : b.w);
      y2 = bcy;
    } else {
      const downward = dy >= 0;
      x1 = acx;
      y1 = a.y + (downward ? a.h : 0);
      x2 = bcx;
      y2 = b.y + (downward ? 0 : b.h);
    }
    relationships.push({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      label: relation.label,
      x1,
      y1,
      x2,
      y2
    });
  }

  const zones = sheet.zones ?? [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number, w: number, h: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };
  for (const box of ctx.boxes.values()) grow(box.x, box.y, box.w, box.h);
  for (const boundary of boundaries) grow(boundary.x, boundary.y, boundary.w, boundary.h);
  for (const zone of zones) grow(zone.x, zone.y, zone.w, zone.h);
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = MIN_W; maxY = NODE_H;
  }

  let spine;
  if (structure === 'fishbone-right' || structure === 'fishbone-left') {
    const sideDir: 1 | -1 = structure === 'fishbone-left' ? -1 : 1;
    const kids = childIds(sheet, sheet.rootId, collapsed);
    const lastX = sideDir * (kids.length ? 120 + (kids.length - 1) * 178 + 60 : 200);
    spine = { x1: (sideDir * rootSize.w) / 2, y1: 0, x2: lastX, y2: 0 };
  } else if (structure === 'timeline-right') {
    const kids = childIds(sheet, sheet.rootId, collapsed);
    const lastX = kids.length ? 170 + (kids.length - 1) * 210 + 110 : rootSize.w / 2 + 120;
    spine = { x1: rootSize.w / 2, y1: 0, x2: lastX, y2: 0 };
  }

  return {
    boxes: ctx.boxes,
    edges,
    bounds: {
      x: minX - 56,
      y: minY - 56,
      w: maxX - minX + 112,
      h: maxY - minY + 112
    },
    boundaries,
    relationships,
    zones,
    spine
  };
}
