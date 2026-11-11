/** 导入分发：按扩展名选择解析器，统一产出文档。 */

import { workbookFromSheet } from '../../packages/core/src/sheets.ts';
import type { Workbook } from '../../packages/core/src/types.ts';
import { decodeWvm } from '../../packages/io/src/codec.ts';
import { parseMarkdown } from '../../packages/io/src/markdown.ts';
import { parseOpml } from '../../packages/io/src/opml.ts';
import { sheetFromTree } from '../../packages/io/src/tree.ts';
import { readXmind } from '../../packages/io/src/xmind.ts';

export interface ImportResult {
  readonly doc: Workbook;
  readonly collapsed: readonly string[];
  readonly format: string;
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}

export async function importFile(file: File): Promise<ImportResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.xmind')) {
    const doc = await readXmind(new Uint8Array(await file.arrayBuffer()));
    return { doc, collapsed: [], format: 'xmind' };
  }

  if (name.endsWith('.wvm')) {
    const parsed = await decodeWvm(new Uint8Array(await file.arrayBuffer()));
    return { doc: parsed.doc, collapsed: parsed.view.collapsed, format: 'wvm' };
  }

  const text = await file.text();

  if (/\.(md|markdown|txt)$/.test(name)) {
    const sheet = sheetFromTree(baseName(file.name), parseMarkdown(text));
    return { doc: workbookFromSheet(sheet, baseName(file.name)), collapsed: [], format: 'markdown' };
  }

  if (/\.(opml|xml)$/.test(name)) {
    const sheet = sheetFromTree(baseName(file.name), parseOpml(text));
    return { doc: workbookFromSheet(sheet, baseName(file.name)), collapsed: [], format: 'opml' };
  }

  throw new Error('不支持的文件类型，请使用 .wvm / .md / .opml');
}
