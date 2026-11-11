/**
 * 多画布（Sheet）管理。
 * 一个 Workbook 至少保留一张画布；画布内的主题标识在画布范围内唯一。
 */

import { createSheet } from './model.ts';
import type { Sheet, Workbook } from './types.ts';

export type ViewMode = 'map' | 'outline' | 'pitch' | 'gantt';

/** 由单张画布构造一个全新文档（导入时使用）。 */
export function workbookFromSheet(sheet: Sheet, title?: string): Workbook {
  const root = sheet.topics[sheet.rootId];
  return {
    id: 'wb-' + Math.random().toString(36).slice(2, 10),
    schemaVersion: 1,
    title: (title ?? root?.text ?? '导入的文档').slice(0, 80),
    sheets: { [sheet.id]: sheet },
    sheetOrder: [sheet.id],
    activeSheetId: sheet.id,
    createdAt: Date.now(),
    modifiedAt: Date.now()
  };
}

let sheetSeq = 1;

function nextSheetId(doc: Workbook): string {
  let id = '';
  do {
    sheetSeq += 1;
    id = `sheet-${sheetSeq}`;
  } while (doc.sheets[id]);
  return id;
}

function touch(doc: Workbook, patch: Partial<Workbook>): Workbook {
  return { ...doc, ...patch, modifiedAt: Date.now() };
}

export function addSheet(doc: Workbook, title?: string): { doc: Workbook; sheetId: string } {
  const id = nextSheetId(doc);
  const sheet: Sheet = {
    ...createSheet(id),
    title: title ?? `画布 ${doc.sheetOrder.length + 1}`
  };
  const next = touch(doc, {
    sheets: { ...doc.sheets, [id]: sheet },
    sheetOrder: [...doc.sheetOrder, id],
    activeSheetId: id
  });
  return { doc: next, sheetId: id };
}

export function removeSheet(doc: Workbook, id: string): Workbook {
  if (!doc.sheets[id]) throw new Error(`sheet not found: ${id}`);
  if (doc.sheetOrder.length <= 1) throw new Error('文件至少保留一张画布');
  const order = doc.sheetOrder.filter((item) => item !== id);
  const sheets = { ...doc.sheets };
  delete sheets[id];
  return touch(doc, {
    sheets,
    sheetOrder: order,
    activeSheetId: doc.activeSheetId === id ? order[0] ?? id : doc.activeSheetId
  });
}

export function renameSheet(doc: Workbook, id: string, title: string): Workbook {
  const sheet = doc.sheets[id];
  if (!sheet) throw new Error(`sheet not found: ${id}`);
  const value = title.trim().slice(0, 50);
  if (!value) return doc;
  return touch(doc, { sheets: { ...doc.sheets, [id]: { ...sheet, title: value } } });
}

export function activateSheet(doc: Workbook, id: string): Workbook {
  if (!doc.sheets[id]) throw new Error(`sheet not found: ${id}`);
  if (doc.activeSheetId === id) return doc;
  return touch(doc, { activeSheetId: id });
}

export function duplicateSheet(doc: Workbook, id: string): { doc: Workbook; sheetId: string } {
  const source = doc.sheets[id];
  if (!source) throw new Error(`sheet not found: ${id}`);
  const newId = nextSheetId(doc);
  const copy: Sheet = {
    ...source,
    id: newId,
    title: `${source.title} 副本`,
    topics: { ...source.topics }
  };
  const index = doc.sheetOrder.indexOf(id);
  const order = [...doc.sheetOrder];
  order.splice(index + 1, 0, newId);
  const next = touch(doc, {
    sheets: { ...doc.sheets, [newId]: copy },
    sheetOrder: order,
    activeSheetId: newId
  });
  return { doc: next, sheetId: newId };
}

export function moveSheet(doc: Workbook, id: string, toIndex: number): Workbook {
  const from = doc.sheetOrder.indexOf(id);
  if (from < 0) return doc;
  const order = [...doc.sheetOrder];
  order.splice(from, 1);
  const target = Math.max(0, Math.min(order.length, toIndex));
  order.splice(target, 0, id);
  return touch(doc, { sheetOrder: order });
}
