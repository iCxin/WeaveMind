/**
 * 只读查询：扁平化、检索、统计、任务派生进度。
 * 全部为纯函数，不修改文档。
 */

import type { Sheet, Task, Topic, TopicId } from './types.ts';

export interface FlatRow {
  readonly id: TopicId;
  readonly depth: number;
  readonly topic: Topic;
}

export function flatten(sheet: Sheet, collapsed?: ReadonlySet<TopicId>): FlatRow[] {
  const rows: FlatRow[] = [];
  const seen = new Set<TopicId>();
  const walk = (id: TopicId, depth: number) => {
    const topic = sheet.topics[id];
    if (!topic || seen.has(id)) return;
    seen.add(id);
    rows.push({ id, depth, topic });
    if (collapsed?.has(id)) return;
    for (const child of topic.children) walk(child, depth + 1);
  };
  walk(sheet.rootId, 0);
  for (const topic of Object.values(sheet.topics)) {
    if (topic.kind === 'floating' && !seen.has(topic.id)) walk(topic.id, 0);
  }
  return rows;
}

export function searchTopics(sheet: Sheet, query: string): TopicId[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: TopicId[] = [];
  for (const topic of Object.values(sheet.topics)) {
    const inText = topic.text.toLowerCase().includes(q);
    const inNote = (topic.note ?? '').toLowerCase().includes(q);
    const inLabels = (topic.labels ?? []).some((label) => label.toLowerCase().includes(q));
    if (inText || inNote || inLabels) out.push(topic.id);
  }
  return out;
}

export interface SheetStats {
  readonly topics: number;
  readonly chars: number;
  readonly words: number;
  readonly tasks: number;
  readonly notes: number;
}

export function statsOf(sheet: Sheet): SheetStats {
  let chars = 0;
  let words = 0;
  let tasks = 0;
  let notes = 0;

  for (const topic of Object.values(sheet.topics)) {
    const text = topic.text ?? '';
    chars += [...text].filter((ch) => !/\s/.test(ch)).length;
    words += countWords(text);
    if (topic.task) tasks += 1;
    if (topic.note) notes += 1;
    for (const label of topic.labels ?? []) words += countWords(label);
  }

  return { topics: Object.keys(sheet.topics).length, chars, words, tasks, notes };
}

function countWords(text: string): number {
  const cjk = text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? [];
  const latin = text
    .replace(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ')
    .split(/[\s\p{P}]+/u)
    .filter(Boolean);
  return cjk.length + latin.length;
}

export function tasksOf(sheet: Sheet): { id: TopicId; topic: Topic; task: Task }[] {
  const out: { id: TopicId; topic: Topic; task: Task }[] = [];
  for (const topic of Object.values(sheet.topics)) {
    if (topic.task) out.push({ id: topic.id, topic, task: topic.task });
  }
  return out;
}

const DAY = 86400000;

export function daySpan(task: Task): number {
  if (!task.start || !task.due) return 1;
  const start = Date.parse(`${task.start}T00:00:00Z`);
  const due = Date.parse(`${task.due}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(due)) return 1;
  return Math.max(1, Math.round((due - start) / DAY) + 1);
}

/** 父任务进度：子任务按工期加权平均；无子任务时返回自身进度。 */
export function derivedProgress(sheet: Sheet, id: TopicId): number {
  const topic = sheet.topics[id];
  if (!topic) return 0;
  const childTasks = topic.children
    .map((childId) => sheet.topics[childId])
    .filter((child): child is Topic => Boolean(child && child.task));
  if (childTasks.length === 0) return topic.task?.progress ?? 0;

  let weighted = 0;
  let weight = 0;
  for (const child of childTasks) {
    const span = daySpan(child.task!);
    weighted += child.task!.progress * span;
    weight += span;
  }
  return weight === 0 ? 0 : Math.round(weighted / weight);
}

export function isOverdue(task: Task, today = new Date()): boolean {
  if (!task.due || task.progress >= 100) return false;
  const due = Date.parse(`${task.due}T23:59:59Z`);
  return Number.isFinite(due) && due < today.getTime();
}

export function findByText(sheet: Sheet, text: string): TopicId | null {
  for (const topic of Object.values(sheet.topics)) {
    if (topic.text === text) return topic.id;
  }
  return null;
}

/** 收集多个主题及其全部后代，去重后返回（用于整枝拖动）。 */
export function collectSubtrees(sheet: Sheet, ids: readonly TopicId[]): TopicId[] {
  const out = new Set<TopicId>();
  const walk = (id: TopicId) => {
    if (out.has(id)) return;
    const topic = sheet.topics[id];
    if (!topic) return;
    out.add(id);
    for (const childId of topic.children) walk(childId);
  };
  for (const id of ids) walk(id);
  return [...out];
}
