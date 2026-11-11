/**
 * 不可变文档模型。
 *
 * 所有写操作返回新的 Sheet / Workbook，未变化的主题对象复用引用（结构共享）。
 * 一次编辑只复制被修改节点及其祖先链上的对象，因此 2000 节点下撤销快照成本可控。
 */

import {
  DEFAULT_PALETTE,
  SCHEMA_VERSION,
  type Attachment,
  type AudioNote,
  type LinkRef,
  type MarkerId,
  type Sheet,
  type SheetStyle,
  type StructureKind,
  type Task,
  type Topic,
  type TopicId,
  type TopicKind,
  type Workbook
} from './types.ts';

let seq = 0;

export function nextTopicId(prefix = 't'): string {
  seq += 1;
  return `${prefix}${seq.toString(36)}`;
}

export function resetIdSequence(): void {
  seq = 0;
}

export function defaultSheetStyle(): SheetStyle {
  return {
    background: '#ffffff',
    palette: DEFAULT_PALETTE,
    rainbow: true,
    lineWidth: 2,
    globalFont: 'system',
    skeletonId: 'default',
    darkCanvas: false
  };
}

export function createTopic(input: Partial<Topic> & { id: TopicId }): Topic {
  return {
    id: input.id,
    parentId: input.parentId ?? null,
    children: input.children ?? [],
    kind: input.kind ?? 'sub',
    text: input.text ?? '新主题',
    structure: input.structure,
    marker: input.marker ?? null,
    markers: input.markers,
    note: input.note,
    todo: input.todo,
    labels: input.labels,
    link: input.link,
    task: input.task,
    styleOverride: input.styleOverride,
    offsetX: input.offsetX,
    offsetY: input.offsetY,
    width: input.width,
    height: input.height,
    fontSize: input.fontSize,
    summaryOf: input.summaryOf,
    image: input.image,
    equation: input.equation,
    attachments: input.attachments,
    audio: input.audio
  };
}

export function createSheet(id: string, rootText = '中心主题'): Sheet {
  const rootId = 'root';
  const root = createTopic({ id: rootId, kind: 'root', text: rootText });
  return {
    id,
    title: '示例',
    rootId,
    topics: { [rootId]: root },
    structure: 'mindmap',
    style: defaultSheetStyle(),
    boundaries: [],
    relationships: [],
    zones: []
  };
}

export function createWorkbook(title = '未命名导图', now = Date.now()): Workbook {
  const sheet = createSheet('sheet-1');
  return {
    id: 'wb-' + Math.random().toString(36).slice(2, 10),
    schemaVersion: SCHEMA_VERSION,
    title,
    sheets: { [sheet.id]: sheet },
    sheetOrder: [sheet.id],
    activeSheetId: sheet.id,
    createdAt: now,
    modifiedAt: now
  };
}

export function getSheet(doc: Workbook, sheetId?: string): Sheet {
  const id = sheetId ?? doc.activeSheetId;
  const sheet = doc.sheets[id];
  if (!sheet) throw new Error(`sheet not found: ${id}`);
  return sheet;
}

export function getTopic(sheet: Sheet, id: TopicId): Topic | null {
  return sheet.topics[id] ?? null;
}

export function requireTopic(sheet: Sheet, id: TopicId): Topic {
  const t = sheet.topics[id];
  if (!t) throw new Error(`topic not found: ${id}`);
  return t;
}

export function countTopics(sheet: Sheet): number {
  return Object.keys(sheet.topics).length;
}

export function descendants(sheet: Sheet, id: TopicId): TopicId[] {
  const out: TopicId[] = [];
  const walk = (cur: TopicId) => {
    const t = sheet.topics[cur];
    if (!t) return;
    for (const child of t.children) {
      out.push(child);
      walk(child);
    }
  };
  walk(id);
  return out;
}

export function depthOf(sheet: Sheet, id: TopicId): number {
  let depth = 0;
  let cur = sheet.topics[id];
  while (cur && cur.parentId) {
    depth += 1;
    cur = sheet.topics[cur.parentId];
  }
  return depth;
}

export function branchIndexOf(sheet: Sheet, id: TopicId): number {
  let cur = sheet.topics[id];
  if (!cur) return 0;
  while (cur.parentId && cur.parentId !== sheet.rootId) {
    const parent = sheet.topics[cur.parentId];
    if (!parent) break;
    cur = parent;
  }
  const parent = cur.parentId ? sheet.topics[cur.parentId] : null;
  if (!parent) return 0;
  const idx = parent.children.indexOf(cur.id);
  return idx < 0 ? 0 : idx;
}

function replaceSheet(doc: Workbook, sheet: Sheet): Workbook {
  return {
    ...doc,
    sheets: { ...doc.sheets, [sheet.id]: sheet },
    modifiedAt: Date.now()
  };
}

export function updateSheet(doc: Workbook, sheet: Sheet): Workbook {
  return replaceSheet(doc, sheet);
}

function putTopic(sheet: Sheet, topic: Topic): Sheet {
  return { ...sheet, topics: { ...sheet.topics, [topic.id]: topic } };
}

export function addChild(
  sheet: Sheet,
  parentId: TopicId,
  text = '新主题',
  id: TopicId = nextTopicId()
): { sheet: Sheet; id: TopicId } {
  const parent = requireTopic(sheet, parentId);
  const kind = parent.kind === 'root' ? 'branch' : 'sub';
  const child = createTopic({ id, parentId, kind, text });
  const nextParent: Topic = { ...parent, children: [...parent.children, id] };
  let next = putTopic(sheet, child);
  next = putTopic(next, nextParent);
  return { sheet: next, id };
}

export function addFloatingTopic(
  sheet: Sheet,
  x: number,
  y: number,
  text = '浮动主题',
  id: TopicId = nextTopicId()
): { sheet: Sheet; id: TopicId } {
  const topic = createTopic({
    id,
    kind: 'floating',
    text,
    offsetX: x,
    offsetY: y
  });
  return { sheet: putTopic(sheet, topic), id };
}

export function addSibling(
  sheet: Sheet,
  siblingId: TopicId,
  text = '新主题',
  id: TopicId = nextTopicId()
): { sheet: Sheet; id: TopicId } {
  const target = requireTopic(sheet, siblingId);
  if (!target.parentId) throw new Error('cannot add sibling to root topic');
  const parent = requireTopic(sheet, target.parentId);
  const index = parent.children.indexOf(siblingId);
  const children = [...parent.children];
  children.splice(index + 1, 0, id);
  const sibling = createTopic({ id, parentId: parent.id, kind: target.kind, text });
  let next = putTopic(sheet, sibling);
  next = putTopic(next, { ...parent, children });
  return { sheet: next, id };
}

export function removeSubtree(sheet: Sheet, id: TopicId): Sheet {
  if (id === sheet.rootId) throw new Error('cannot delete root topic');
  const target = requireTopic(sheet, id);
  const doomed = new Set([id, ...descendants(sheet, id)]);
  const topics: Record<TopicId, Topic> = {};
  for (const [key, value] of Object.entries(sheet.topics)) {
    if (!doomed.has(key)) topics[key] = value;
  }
  if (target.parentId) {
    const parent = topics[target.parentId];
    if (parent) {
      topics[parent.id] = {
        ...parent,
        children: parent.children.filter((c) => c !== id)
      };
    }
  }
  return { ...sheet, topics };
}

/** 仅删除自身，子主题按原顺序上提（PRD FR-12）。 */
export function removeSingle(sheet: Sheet, id: TopicId): Sheet {
  if (id === sheet.rootId) throw new Error('cannot delete root topic');
  const target = requireTopic(sheet, id);
  const parentId = target.parentId;
  if (!parentId) throw new Error('topic has no parent');
  const parent = requireTopic(sheet, parentId);
  const index = parent.children.indexOf(id);
  const children = [...parent.children];
  children.splice(index, 1, ...target.children);

  const topics: Record<TopicId, Topic> = { ...sheet.topics };
  delete topics[id];
  topics[parentId] = { ...parent, children };
  for (const childId of target.children) {
    const child = topics[childId];
    if (child) topics[childId] = { ...child, parentId };
  }
  return { ...sheet, topics };
}

/* ---------------- 复制 / 粘贴 ---------------- */

export interface TopicClip {
  readonly roots: readonly TopicId[];
  readonly topics: Readonly<Record<TopicId, Topic>>;
}

/** 提取选中子树；若祖先也被选中，则只保留最外层节点。 */
export function copySubtrees(sheet: Sheet, ids: readonly TopicId[]): TopicClip {
  const selected = new Set(ids.filter((id) => Boolean(sheet.topics[id])));
  const roots: TopicId[] = [];
  for (const id of selected) {
    let parent = sheet.topics[id]?.parentId ?? null;
    let covered = false;
    while (parent) {
      if (selected.has(parent)) {
        covered = true;
        break;
      }
      parent = sheet.topics[parent]?.parentId ?? null;
    }
    if (!covered) roots.push(id);
  }

  const topics: Record<TopicId, Topic> = {};
  const walk = (id: TopicId): void => {
    const topic = sheet.topics[id];
    if (!topic || topics[id]) return;
    topics[id] = topic;
    for (const child of topic.children) walk(child);
  };
  for (const root of roots) walk(root);
  return { roots, topics };
}

/** 将剪贴板内容插入到指定父级；返回新画布与新建的顶层主题 id。 */
export function insertClipboard(
  sheet: Sheet,
  parentId: TopicId,
  clip: TopicClip,
  index?: number
): { sheet: Sheet; ids: TopicId[] } {
  const parent = requireTopic(sheet, parentId);
  const idMap = new Map<TopicId, TopicId>();
  for (const oldId of Object.keys(clip.topics)) idMap.set(oldId, nextTopicId());
  const topics: Record<TopicId, Topic> = { ...sheet.topics };

  const clone = (oldId: TopicId, newParentId: TopicId): TopicId | null => {
    const old = clip.topics[oldId];
    const newId = idMap.get(oldId);
    if (!old || !newId) return null;
    const children: TopicId[] = [];
    for (const childOld of old.children) {
      const childNew = clone(childOld, newId);
      if (childNew) children.push(childNew);
    }
    const kind: TopicKind = newParentId === sheet.rootId ? 'branch' : 'sub';
    let link = old.link;
    if (link?.type === 'topic') {
      const mapped = idMap.get(link.topicId);
      link = mapped ? { type: 'topic', sheetId: sheet.id, topicId: mapped } : undefined;
    }
    let task = old.task;
    if (task?.dependsOn?.length) {
      const dependsOn = task.dependsOn
        .map((dep) => idMap.get(dep))
        .filter((dep): dep is TopicId => Boolean(dep));
      task = { ...task, dependsOn: dependsOn.length ? dependsOn : undefined };
    }
    topics[newId] = {
      ...old,
      id: newId,
      parentId: newParentId,
      children,
      kind,
      link,
      task,
      summaryOf: undefined,
      offsetX: undefined,
      offsetY: undefined
    };
    return newId;
  };

  const created: TopicId[] = [];
  for (const root of clip.roots) {
    const newId = clone(root, parentId);
    if (newId) created.push(newId);
  }
  if (created.length === 0) return { sheet, ids: [] };

  const children = [...parent.children];
  const at = index === undefined ? children.length : Math.max(0, Math.min(children.length, index));
  children.splice(at, 0, ...created);
  topics[parentId] = { ...parent, children };
  return { sheet: { ...sheet, topics }, ids: created };
}

export function setText(sheet: Sheet, id: TopicId, text: string): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, text });
}

/** 全局查找替换：返回新画布与命中主题数。 */
export function replaceText(sheet: Sheet, from: string, to: string): { sheet: Sheet; count: number } {
  const needle = from.trim();
  if (!needle) return { sheet, count: 0 };
  let count = 0;
  let next = sheet;
  for (const topic of Object.values(sheet.topics)) {
    if (!topic.text.includes(needle)) continue;
    next = putTopic(next, { ...topic, text: topic.text.split(needle).join(to) });
    count += 1;
  }
  return { sheet: next, count };
}

export function setMarker(sheet: Sheet, id: TopicId, marker: MarkerId | null): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, {
    ...topic,
    marker,
    markers: marker ? [marker] : undefined
  });
}

export function setMarkers(sheet: Sheet, id: TopicId, markers: readonly MarkerId[]): Sheet {
  const topic = requireTopic(sheet, id);
  const unique = [...new Set(markers)];
  return putTopic(sheet, {
    ...topic,
    marker: unique[0] ?? null,
    markers: unique.length > 0 ? unique : undefined
  });
}

/** 切换单个标记，支持一个主题同时拥有多个图标。 */
export function toggleMarker(sheet: Sheet, id: TopicId, marker: MarkerId): Sheet {
  const topic = requireTopic(sheet, id);
  const current = topic.markers?.length
    ? [...topic.markers]
    : topic.marker
      ? [topic.marker]
      : [];
  const index = current.indexOf(marker);
  if (index >= 0) current.splice(index, 1);
  else current.push(marker);
  return putTopic(sheet, {
    ...topic,
    marker: current[0] ?? null,
    markers: current.length > 0 ? current : undefined
  });
}

export function clearMarkers(sheet: Sheet, id: TopicId): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, marker: null, markers: undefined });
}

export function setTask(sheet: Sheet, id: TopicId, task: Topic['task']): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, task });
}

export function patchTask(sheet: Sheet, id: TopicId, patch: Partial<Task>): Sheet {
  const topic = requireTopic(sheet, id);
  const base: Task = topic.task ?? { progress: 0, priority: 'medium' };
  return putTopic(sheet, { ...topic, task: { ...base, ...patch } });
}

export function setNote(sheet: Sheet, id: TopicId, note: string): Sheet {
  const topic = requireTopic(sheet, id);
  const trimmed = note.trim();
  return putTopic(sheet, { ...topic, note: trimmed.length ? trimmed : undefined });
}

export function setTodo(sheet: Sheet, id: TopicId, done: boolean | null): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, todo: done === null ? undefined : done });
}

export function toggleTodo(sheet: Sheet, id: TopicId): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, todo: !topic.todo });
}

export function addLabel(sheet: Sheet, id: TopicId, label: string): Sheet {
  const topic = requireTopic(sheet, id);
  const value = label.trim().slice(0, 20);
  if (!value) return sheet;
  const labels = topic.labels ?? [];
  if (labels.includes(value) || labels.length >= 20) return sheet;
  return putTopic(sheet, { ...topic, labels: [...labels, value] });
}

export function removeLabel(sheet: Sheet, id: TopicId, label: string): Sheet {
  const topic = requireTopic(sheet, id);
  const labels = (topic.labels ?? []).filter((item) => item !== label);
  return putTopic(sheet, { ...topic, labels: labels.length ? labels : undefined });
}

export function setLink(sheet: Sheet, id: TopicId, link: LinkRef | null): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, link: link ?? undefined });
}

export function setTopicStyle(
  sheet: Sheet,
  id: TopicId,
  style: Topic['styleOverride'] | null
): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, styleOverride: style ?? undefined });
}

export function setTopicOffset(sheet: Sheet, id: TopicId, x: number, y: number): Sheet {
  const topic = requireTopic(sheet, id);
  const round = (value: number) => Math.round(value);
  const offsetX = round(x);
  const offsetY = round(y);
  return putTopic(sheet, {
    ...topic,
    offsetX: Math.abs(offsetX) < 1 ? undefined : offsetX,
    offsetY: Math.abs(offsetY) < 1 ? undefined : offsetY
  });
}

export function clearTopicOffsets(sheet: Sheet, ids?: readonly TopicId[]): Sheet {
  const target = ids ?? Object.keys(sheet.topics);
  let next = sheet;
  for (const id of target) {
    const topic = next.topics[id];
    if (!topic || (topic.offsetX === undefined && topic.offsetY === undefined)) continue;
    next = putTopic(next, { ...topic, offsetX: undefined, offsetY: undefined });
  }
  return next;
}

export function setTopicWidth(sheet: Sheet, id: TopicId, width: number | null): Sheet {
  const topic = requireTopic(sheet, id);
  if (width === null) return putTopic(sheet, { ...topic, width: undefined });
  return putTopic(sheet, { ...topic, width: Math.max(90, Math.min(620, Math.round(width))) });
}

export function setTopicHeight(sheet: Sheet, id: TopicId, height: number | null): Sheet {
  const topic = requireTopic(sheet, id);
  if (height === null) return putTopic(sheet, { ...topic, height: undefined });
  return putTopic(sheet, { ...topic, height: Math.max(34, Math.min(400, Math.round(height))) });
}

export function setTopicFontSize(sheet: Sheet, id: TopicId, size: number | null): Sheet {
  const topic = requireTopic(sheet, id);
  if (size === null) return putTopic(sheet, { ...topic, fontSize: undefined });
  return putTopic(sheet, { ...topic, fontSize: Math.max(11, Math.min(22, Math.round(size))) });
}

/* ---------------- 外框 / 联系 / 专区 / 概要 ---------------- */

let decoSeq = 0;

function decoId(prefix: string): string {
  decoSeq += 1;
  return `${prefix}${decoSeq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function addBoundary(sheet: Sheet, topicIds: readonly TopicId[], title = '外框'): Sheet {
  const ids = topicIds.filter((id) => id !== sheet.rootId && sheet.topics[id]);
  if (ids.length === 0) return sheet;
  return {
    ...sheet,
    boundaries: [...sheet.boundaries, { id: decoId('bd'), topicIds: ids, title }]
  };
}

export function removeBoundariesAt(sheet: Sheet, topicId: TopicId): Sheet {
  const next = sheet.boundaries.filter((boundary) => !boundary.topicIds.includes(topicId));
  return next.length === sheet.boundaries.length ? sheet : { ...sheet, boundaries: next };
}

export function renameBoundary(sheet: Sheet, id: string, title: string): Sheet {
  const value = title.trim().slice(0, 40);
  if (!value) return sheet;
  return {
    ...sheet,
    boundaries: sheet.boundaries.map((boundary) =>
      boundary.id === id ? { ...boundary, title: value } : boundary
    )
  };
}

export function removeBoundary(sheet: Sheet, id: string): Sheet {
  return { ...sheet, boundaries: sheet.boundaries.filter((boundary) => boundary.id !== id) };
}

export function addRelationship(sheet: Sheet, from: TopicId, to: TopicId, label = ''): Sheet {
  if (from === to || !sheet.topics[from] || !sheet.topics[to]) return sheet;
  return {
    ...sheet,
    relationships: [...sheet.relationships, { id: decoId('rel'), from, to, label }]
  };
}

export function removeRelationshipsAt(sheet: Sheet, topicId: TopicId): Sheet {
  const next = sheet.relationships.filter(
    (relationship) => relationship.from !== topicId && relationship.to !== topicId
  );
  return next.length === sheet.relationships.length ? sheet : { ...sheet, relationships: next };
}

export function addZone(sheet: Sheet, rect: { x: number; y: number; w: number; h: number }, title = '专区'): Sheet {
  return {
    ...sheet,
    zones: [
      ...sheet.zones,
      { id: decoId('zn'), title, x: rect.x, y: rect.y, w: Math.max(120, rect.w), h: Math.max(90, rect.h) }
    ]
  };
}

export function removeZone(sheet: Sheet, id: string): Sheet {
  return { ...sheet, zones: sheet.zones.filter((zone) => zone.id !== id) };
}

export function setZoneRect(
  sheet: Sheet,
  id: string,
  rect: { x: number; y: number; w: number; h: number }
): Sheet {
  return {
    ...sheet,
    zones: sheet.zones.map((zone) =>
      zone.id === id
        ? { ...zone, x: rect.x, y: rect.y, w: Math.max(120, rect.w), h: Math.max(90, rect.h) }
        : zone
    )
  };
}

/** 移动主题到新的父级（拖拽落点）。禁止移到自身或后代之下。 */
export function moveTopic(
  sheet: Sheet,
  id: TopicId,
  newParentId: TopicId,
  index?: number
): Sheet {
  if (id === sheet.rootId) throw new Error('中心主题不可移动');
  const topic = requireTopic(sheet, id);
  const newParent = requireTopic(sheet, newParentId);
  if (id === newParentId) throw new Error('不能移动到自身');
  if (descendants(sheet, id).includes(newParentId)) throw new Error('不能移动到自己的子级');

  const oldParentId = topic.parentId;
  if (!oldParentId) throw new Error('自由主题暂不支持拖拽');

  const oldParent = requireTopic(sheet, oldParentId);
  let next = putTopic(sheet, {
    ...oldParent,
    children: oldParent.children.filter((childId) => childId !== id)
  });

  const targetParent = requireTopic(next, newParentId);
  const children = [...targetParent.children];
  const position = index === undefined ? children.length : Math.max(0, Math.min(children.length, index));
  if (!children.includes(id)) children.splice(position, 0, id);
  next = putTopic(next, { ...targetParent, children });

  next = putTopic(next, {
    ...requireTopic(next, id),
    parentId: newParentId,
    kind: newParentId === next.rootId ? 'branch' : 'sub'
  });

  return next;
}

/** 为一组同级连续主题创建概要节点。 */
export function addSummary(sheet: Sheet, topicIds: readonly TopicId[], text = '概要'): { sheet: Sheet; id: TopicId | null } {
  if (topicIds.length < 2) return { sheet, id: null };
  const first = sheet.topics[topicIds[0]!];
  if (!first || !first.parentId) return { sheet, id: null };
  const parentId = first.parentId;
  const sameParent = topicIds.every((id) => sheet.topics[id]?.parentId === parentId);
  if (!sameParent) return { sheet, id: null };

  const parent = requireTopic(sheet, parentId);
  const order = parent.children;
  const indices = topicIds.map((id) => order.indexOf(id)).sort((a, b) => a - b);
  const contiguous = indices.every((value, index) => index === 0 || value === (indices[index - 1] ?? 0) + 1);
  if (!contiguous) return { sheet, id: null };

  const id = nextTopicId('sum');
  const summary = createTopic({
    id,
    parentId,
    kind: 'summary',
    text,
    summaryOf: indices.map((index) => order[index]!)
  });
  let next = putTopic(sheet, summary);
  next = putTopic(next, { ...parent, children: [...parent.children, id] });
  return { sheet: next, id };
}

/* ---------------- 富媒体 ---------------- */

export function setImage(sheet: Sheet, id: TopicId, image: Topic['image'] | null): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, image: image ?? undefined });
}

export function setEquation(sheet: Sheet, id: TopicId, latex: string): Sheet {
  const topic = requireTopic(sheet, id);
  const value = latex.trim();
  return putTopic(sheet, { ...topic, equation: value ? { latex: value } : undefined });
}

export function addAttachment(sheet: Sheet, id: TopicId, attachment: Attachment): Sheet {
  const topic = requireTopic(sheet, id);
  const list = [...(topic.attachments ?? []), attachment];
  return putTopic(sheet, { ...topic, attachments: list });
}

export function clearAttachments(sheet: Sheet, id: TopicId): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, attachments: undefined });
}

export function addAudio(sheet: Sheet, id: TopicId, audio: AudioNote): Sheet {
  const topic = requireTopic(sheet, id);
  const list = [...(topic.audio ?? []), audio];
  return putTopic(sheet, { ...topic, audio: list });
}

export function clearAudio(sheet: Sheet, id: TopicId): Sheet {
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, audio: undefined });
}

export function setStructure(
  sheet: Sheet,
  id: TopicId | null,
  structure: StructureKind
): Sheet {
  if (id === null) return { ...sheet, structure };
  const topic = requireTopic(sheet, id);
  return putTopic(sheet, { ...topic, structure });
}

export function setSheetStyle(sheet: Sheet, patch: Partial<SheetStyle>): Sheet {
  return { ...sheet, style: { ...sheet.style, ...patch } };
}

/** 从任意节点上溯，找到其所属的一级分支；根节点返回自身。 */
export function topBranchOf(sheet: Sheet, id: TopicId): TopicId {
  let cur = sheet.topics[id];
  if (!cur) return id;
  while (cur.parentId && cur.parentId !== sheet.rootId) {
    const parent = sheet.topics[cur.parentId];
    if (!parent) break;
    cur = parent;
  }
  return cur.id;
}
