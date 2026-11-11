/**
 * OPML 互操作。
 *
 * 采用手写标签扫描而非 DOM 解析，使同一份代码可运行在浏览器、Worker 与 Node 测试中。
 */

import type { Sheet, TopicId } from '../../core/src/types.ts';
import type { TreeInput } from './tree.ts';

interface Frame {
  node: TreeInput;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

function encodeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrsOf(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:_.-]+)\s*=\s*"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    out[match[1]!.toLowerCase()] = decodeEntities(match[2] ?? '');
  }
  return out;
}

export function parseOpml(xml: string): TreeInput {
  const roots: TreeInput[] = [];
  const stack: Frame[] = [];
  const tokenRe = /<outline\b([^>]*?)(\/?)>|<\/outline\s*>/gi;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(xml))) {
    const token = match[0];
    if (/^<\/outline/i.test(token)) {
      stack.pop();
      continue;
    }

    const attrs = attrsOf(match[1] ?? '');
    const text = attrs.text ?? attrs.title ?? '未命名';
    const node: TreeInput = { text };
    if (attrs._note) node.note = attrs._note;

    const parent = stack[stack.length - 1];
    if (parent) {
      parent.node.children = parent.node.children ?? [];
      parent.node.children.push(node);
    } else {
      roots.push(node);
    }

    if (!match[2]) stack.push({ node });
  }

  if (roots.length === 0) return { text: '导入的文档', children: [] };
  if (roots.length === 1) return roots[0]!;
  return { text: '导入的文档', children: roots };
}

export function toOpml(sheet: Sheet, title = 'WeaveMind'): string {
  const root = sheet.topics[sheet.rootId];
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<opml version="2.0">');
  lines.push('  <head>');
  lines.push(`    <title>${encodeXml(title)}</title>`);
  lines.push('  </head>');
  lines.push('  <body>');

  const walk = (id: TopicId, depth: number) => {
    const topic = sheet.topics[id];
    if (!topic) return;
    const pad = '  '.repeat(depth + 2);
    const note = topic.note ? ` _note="${encodeXml(topic.note)}"` : '';
    const hasChildren = topic.children.length > 0;
    if (hasChildren) {
      lines.push(`${pad}<outline text="${encodeXml(topic.text)}"${note}>`);
      for (const childId of topic.children) walk(childId, depth + 1);
      lines.push(`${pad}</outline>`);
    } else {
      lines.push(`${pad}<outline text="${encodeXml(topic.text)}"${note}/>`);
    }
  };

  if (root) walk(root.id, 0);

  lines.push('  </body>');
  lines.push('</opml>');
  return lines.join('\n');
}
