/**
 * `.xmind` 读取。
 *
 * 现代 .xmind 为 ZIP 容器，主数据在 content.json（旧版为 content.xml，暂不支持）。
 * 只映射主题树、文本、备注与标记；样式与结构做近似映射（技术方案 5.11）。
 */

import type { MarkerId, Sheet, StructureKind, Topic, TopicId, Workbook } from '../../core/src/types.ts';
import { sheetFromTree, type TreeInput } from './tree.ts';
import { zipRead, zipWrite } from './zip.ts';

interface XmindNode {
  title?: string;
  children?: { attached?: XmindNode[] };
  notes?: { plain?: { content?: string }; realHTML?: { content?: string } };
  markers?: { markerId?: string }[];
  structureClass?: string;
}

interface XmindSheet {
  title?: string;
  rootTopic?: XmindNode;
}

const MARKER_MAP: Record<string, MarkerId> = {
  'priority-9': 'prio9',
  'priority-8': 'prio8',
  'priority-7': 'prio7',
  'priority-6': 'prio6',
  'priority-5': 'prio5',
  'priority-4': 'prio4',
  'priority-3': 'prio3',
  'priority-2': 'prio2',
  'priority-1': 'prio1',
  'task-done': 'done',
  'task-3quar': 'progress6',
  'task-half': 'progress4',
  'task-quarter': 'progress2',
  'task-start': 'progress0',
  'symbol-question': 'question',
  'symbol-lightbulb': 'idea',
  'symbol-heart': 'heart',
  'symbol-exclam': 'warn',
  'symbol-pin': 'pin',
  'symbol-clock': 'clock',
  flag: 'flag',
  star: 'star'
};

function mapMarkers(node: XmindNode): MarkerId[] {
  const out: MarkerId[] = [];
  const ids = (node.markers ?? []).map((marker) => marker.markerId ?? '');
  for (const id of ids) {
    for (const [needle, marker] of Object.entries(MARKER_MAP)) {
      if (id.includes(needle)) {
        if (!out.includes(marker)) out.push(marker);
        break;
      }
    }
  }
  return out;
}

function noteOf(node: XmindNode): string | undefined {
  const plain = node.notes?.plain?.content;
  if (plain) return plain;
  const html = node.notes?.realHTML?.content;
  if (!html) return undefined;
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || undefined;
}

function toTree(node: XmindNode): TreeInput {
  const tree: TreeInput = { text: (node.title ?? '未命名').trim() || '未命名' };
  const note = noteOf(node);
  if (note) tree.note = note;
  const markers = mapMarkers(node);
  if (markers.length > 0) {
    tree.markers = markers;
    tree.marker = markers[0];
  }

  const children = node.children?.attached ?? [];
  if (children.length) tree.children = children.map(toTree);
  return tree;
}

function structureOf(node: XmindNode | undefined): StructureKind {
  const value = node?.structureClass ?? '';
  if (value.includes('logic.left')) return 'logic-left';
  if (value.includes('logic')) return 'logic-right';
  if (value.includes('org-chart.up')) return 'org-up';
  if (value.includes('org-chart')) return 'org-down';
  if (value.includes('tree.left')) return 'tree-left';
  if (value.includes('tree')) return 'tree-right';
  if (value.includes('fishbone.left')) return 'fishbone-left';
  if (value.includes('fishbone')) return 'fishbone-right';
  if (value.includes('timeline')) return 'timeline-right';
  return 'mindmap';
}

export function parseXmindContent(json: string): { title: string; structure: StructureKind; tree: TreeInput }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('content.json 不是合法 JSON');
  }

  const list: XmindSheet[] = Array.isArray(parsed)
    ? (parsed as XmindSheet[])
    : Array.isArray((parsed as { sheets?: XmindSheet[] }).sheets)
      ? (parsed as { sheets: XmindSheet[] }).sheets
      : [];

  if (list.length === 0) throw new Error('.xmind 中未找到画布');

  return list
    .filter((sheet) => sheet?.rootTopic)
    .map((sheet, index) => ({
      title: (sheet.title ?? `画布 ${index + 1}`).trim(),
      structure: structureOf(sheet.rootTopic),
      tree: toTree(sheet.rootTopic as XmindNode)
    }));
}

const STRUCTURE_CLASS: Record<StructureKind, string> = {
  mindmap: 'org.xmind.ui.map.unbalanced',
  'logic-right': 'org.xmind.ui.logic.right',
  'logic-left': 'org.xmind.ui.logic.left',
  'org-down': 'org.xmind.ui.org-chart.down',
  'org-up': 'org.xmind.ui.org-chart.up',
  'tree-right': 'org.xmind.ui.tree.right',
  'tree-left': 'org.xmind.ui.tree.left',
  'fishbone-right': 'org.xmind.ui.fishbone.rightHeaded',
  'fishbone-left': 'org.xmind.ui.fishbone.leftHeaded',
  'timeline-right': 'org.xmind.ui.timeline.horizontal'
};

const MARKER_ID: Record<MarkerId, string> = {
  flag: 'flag-red',
  star: 'star-orange',
  done: 'task-done',
  wait: 'task-start',
  question: 'symbol-question',
  idea: 'symbol-lightbulb',
  heart: 'symbol-heart',
  warn: 'symbol-exclam',
  pin: 'symbol-pin',
  clock: 'symbol-clock',
  prio1: 'priority-1',
  prio2: 'priority-2',
  prio3: 'priority-3',
  prio4: 'priority-4',
  prio5: 'priority-5',
  prio6: 'priority-6',
  prio7: 'priority-7',
  prio8: 'priority-8',
  prio9: 'priority-9',
  progress0: 'task-start',
  progress1: 'task-start',
  progress2: 'task-quarter',
  progress3: 'task-quarter',
  progress4: 'task-half',
  progress5: 'task-3quar',
  progress6: 'task-3quar',
  progress7: 'task-done',
  progress8: 'task-done'
};

interface XmindExportNode {
  id?: string;
  title: string;
  children?: { attached: XmindExportNode[] };
  notes?: { plain: { content: string } };
  markers?: { markerId: string }[];
}

function exportNode(sheet: Sheet, id: TopicId): XmindExportNode | null {
  const topic: Topic | undefined = sheet.topics[id];
  if (!topic) return null;
  const node: XmindExportNode = { id: topic.id, title: topic.text };
  if (topic.note) node.notes = { plain: { content: topic.note } };
  const markers = topic.markers?.length
    ? topic.markers
    : topic.marker
      ? [topic.marker]
      : [];
  if (markers.length > 0) {
    node.markers = markers.map((marker) => ({ markerId: MARKER_ID[marker] }));
  }

  const children = topic.children
    .map((childId) => exportNode(sheet, childId))
    .filter((child): child is XmindExportNode => Boolean(child));
  if (children.length > 0) node.children = { attached: children };
  return node;
}

/** 导出为可被 XMind 打开的新版 `.xmind`（ZIP + content.json）。 */
export async function writeXmind(doc: Workbook): Promise<Uint8Array> {
  const sheets = doc.sheetOrder
    .map((id) => doc.sheets[id])
    .filter((sheet): sheet is Sheet => Boolean(sheet))
    .map((sheet) => {
      const root = exportNode(sheet, sheet.rootId);
      return {
        id: sheet.id,
        class: 'sheet',
        title: sheet.title,
        rootTopic: {
          ...(root ?? { title: sheet.title }),
          structureClass: STRUCTURE_CLASS[sheet.structure] ?? STRUCTURE_CLASS.mindmap
        }
      };
    });

  const content = JSON.stringify(sheets, null, 2);
  const metadata = JSON.stringify({ creator: { name: 'WeaveMind', version: '0.4' } });
  const manifest = JSON.stringify({
    'file-entries': { 'content.json': {}, 'metadata.json': {} }
  });

  return zipWrite([
    { name: 'content.json', data: new TextEncoder().encode(content), compress: true },
    { name: 'metadata.json', data: new TextEncoder().encode(metadata), compress: true },
    { name: 'manifest.json', data: new TextEncoder().encode(manifest), compress: true }
  ]);
}

export async function readXmind(bytes: Uint8Array): Promise<Workbook> {
  const entries = await zipRead(bytes);
  const content = entries.find((entry) => entry.name === 'content.json');
  if (!content) {
    throw new Error('暂不支持旧版 .xmind（content.xml），请用新版另存后重试');
  }

  const decoded = new TextDecoder().decode(content.data);
  const sheets = parseXmindContent(decoded);

  const built: Sheet[] = sheets.map((sheet, index) => {
    const base = sheetFromTree(sheet.title, sheet.tree, `xsheet-${index + 1}`);
    return { ...base, title: sheet.title, structure: sheet.structure };
  });

  const first = built[0];
  if (!first) throw new Error('.xmind 中没有可导入的画布');

  const map: Record<string, Sheet> = {};
  for (const sheet of built) map[sheet.id] = sheet;

  return {
    id: 'wb-' + Math.random().toString(36).slice(2, 10),
    schemaVersion: 1,
    title: first.title || '导入的导图',
    sheets: map,
    sheetOrder: built.map((sheet) => sheet.id),
    activeSheetId: first.id,
    createdAt: Date.now(),
    modifiedAt: Date.now()
  };
}
