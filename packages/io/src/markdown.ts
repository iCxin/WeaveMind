/**
 * Markdown 互操作。
 *
 * 导入：标题（#）与列表（- / * / +）统一按缩进层级建树；`>` 行作为上一节点的备注。
 * 导出：根为一级标题，其余为嵌套无序列表，备注以引用块跟在节点后。
 */

import type { MarkerId, Sheet, TopicId } from '../../core/src/types.ts';
import type { TreeInput } from './tree.ts';

interface Frame {
  indent: number;
  node: TreeInput;
}

const MARKER_MAP: Record<string, MarkerId> = {
  '⚑': 'flag',
  '★': 'star',
  '✓': 'done',
  '△': 'wait',
  '?': 'question',
  '✦': 'idea',
  '♥': 'heart',
  '!': 'warn',
  '●': 'pin',
  '◷': 'clock'
};

export function parseMarkdown(markdown: string): TreeInput {
  const roots: TreeInput[] = [];
  const stack: Frame[] = [];
  let lastNode: TreeInput | null = null;
  let headingIndent = -1;

  for (const raw of markdown.split(/\r?\n/)) {
    if (!raw.trim()) continue;

    const noteMatch = raw.match(/^\s*>\s?(.*)$/);
    if (noteMatch) {
      if (lastNode) {
        const text = noteMatch[1].trim();
        lastNode.note = lastNode.note ? `${lastNode.note}\n${text}` : text;
      }
      continue;
    }

    let indent = 0;
    let text = '';
    let todo: boolean | undefined;
    let marker: MarkerId | undefined;

    const heading = raw.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      indent = (heading[1]?.length ?? 1) - 1;
      headingIndent = indent;
      text = (heading[2] ?? '').trim();
    } else {
      const bullet = raw.match(/^(\s*)[-*+]\s+(.*)$/);
      if (!bullet) continue;
      const extra = Math.floor((bullet[1]?.length ?? 0) / 2);
      indent = headingIndent + 1 + extra;
      text = (bullet[2] ?? '').trim();
    }

    if (!text) continue;

    // 依次剥离标记与任务框，两种顺序都支持
    for (let pass = 0; pass < 2; pass += 1) {
      const mark = text.match(/^([⚑★✓△?✦♥!●◷])\s+(.*)$/);
      if (mark && MARKER_MAP[mark[1]!]) {
        marker = MARKER_MAP[mark[1]!];
        text = mark[2] ?? '';
        continue;
      }
      const task = text.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        todo = (task[1] ?? '').toLowerCase() === 'x';
        text = task[2] ?? '';
      }
    }

    text = text.replace(/^\*\*(.+)\*\*$/, '$1').replace(/^_(.+)_$/, '$1').trim();
    if (!text) continue;

    const node: TreeInput = { text };
    if (todo !== undefined) node.todo = todo;
    if (marker) node.marker = marker;

    while (stack.length && indent <= (stack[stack.length - 1]?.indent ?? 0)) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.node.children = parent.node.children ?? [];
      parent.node.children.push(node);
    } else {
      roots.push(node);
    }
    stack.push({ indent, node });
    lastNode = node;
  }

  if (roots.length === 0) return { text: '导入的文档', children: [] };
  if (roots.length === 1) return roots[0]!;
  return { text: '导入的文档', children: roots };
}

export function toMarkdown(sheet: Sheet): string {
  const lines: string[] = [];
  const root = sheet.topics[sheet.rootId];
  if (!root) return '';

  lines.push(`# ${escapeInline(root.text)}`);
  if (root.note) for (const line of root.note.split('\n')) lines.push(`> ${line}`);
  lines.push('');

  const walk = (id: TopicId, depth: number) => {
    const topic = sheet.topics[id];
    if (!topic) return;
    for (const childId of topic.children) {
      const child = sheet.topics[childId];
      if (!child) continue;
      const pad = '  '.repeat(depth);
      const markers = child.markers?.length
        ? child.markers
        : child.marker
          ? [child.marker]
          : [];
      const marker = markers.length > 0
        ? `${markers.map(markerGlyph).filter(Boolean).join(' ')} `
        : '';
      const todo = child.todo === undefined ? '' : child.todo ? '[x] ' : '[ ] ';
      lines.push(`${pad}- ${marker}${todo}${escapeInline(child.text)}`);
      if (child.note) {
        for (const line of child.note.split('\n')) lines.push(`${pad}  > ${line}`);
      }
      walk(childId, depth + 1);
    }
  };

  walk(sheet.rootId, 0);
  return lines.join('\n');
}

function escapeInline(text: string): string {
  return text.replace(/\n/g, ' ');
}

function markerGlyph(marker: string): string {
  const map: Record<string, string> = {
    flag: '⚑',
    star: '★',
    done: '✓',
    wait: '△',
    question: '?',
    idea: '✦',
    heart: '♥',
    warn: '!',
    pin: '●',
    clock: '◷'
  };
  if (marker.startsWith('prio')) return marker.slice(4);
  if (marker.startsWith('progress')) {
    return '⓪①②③④⑤⑥⑦⑧'[Number(marker.slice(8))] ?? '';
  }
  return map[marker] ?? '';
}
