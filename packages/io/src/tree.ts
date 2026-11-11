/**
 * 中间树结构：所有导入格式先解析为 TreeInput，再统一由 sheetFromTree 生成领域模型。
 */

import { addChild, createSheet, setMarker, setMarkers, setNote, setTodo } from '../../core/src/model.ts';
import type { MarkerId, Sheet } from '../../core/src/types.ts';

export interface TreeInput {
  text: string;
  note?: string;
  todo?: boolean;
  marker?: MarkerId;
  markers?: MarkerId[];
  children?: TreeInput[];
}

export function sheetFromTree(title: string, tree: TreeInput, sheetId = 'sheet-1'): Sheet {
  const rootText = (tree.text || title || '导入的文档').trim().slice(0, 200) || '导入的文档';
  let sheet = createSheet(sheetId, rootText);
  if (tree.note) sheet = setNote(sheet, 'root', tree.note);
  if (tree.todo !== undefined) sheet = setTodo(sheet, 'root', tree.todo);
  if (tree.markers?.length) sheet = setMarkers(sheet, 'root', tree.markers);
  else if (tree.marker) sheet = setMarker(sheet, 'root', tree.marker);

  const walk = (parentId: string, node: TreeInput) => {
    for (const child of node.children ?? []) {
      const created = addChild(sheet, parentId, (child.text || '未命名').slice(0, 500));
      sheet = created.sheet;
      if (child.note) sheet = setNote(sheet, created.id, child.note);
      if (child.todo !== undefined) sheet = setTodo(sheet, created.id, child.todo);
      if (child.markers?.length) sheet = setMarkers(sheet, created.id, child.markers);
      else if (child.marker) sheet = setMarker(sheet, created.id, child.marker);
      walk(created.id, child);
    }
  };

  walk('root', tree);
  return sheet;
}

export function countTree(node: TreeInput): number {
  let n = 1;
  for (const child of node.children ?? []) n += countTree(child);
  return n;
}
