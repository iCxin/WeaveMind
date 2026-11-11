import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addChild,
  addLabel,
  createWorkbook,
  getSheet,
  patchTask,
  removeLabel,
  setLink,
  setNote,
  setTodo,
  updateSheet
} from '../src/model.ts';
import {
  activateSheet,
  addSheet,
  duplicateSheet,
  moveSheet,
  removeSheet,
  renameSheet
} from '../src/sheets.ts';
import {
  derivedProgress,
  flatten,
  isOverdue,
  searchTopics,
  statsOf,
  tasksOf,
  collectSubtrees
} from '../src/query.ts';

function docWithTree() {
  let doc = createWorkbook('结构测试');
  const sheetId = doc.activeSheetId;
  let sheet = getSheet(doc);
  const a = addChild(sheet, 'root', '市场', 'a');
  sheet = a.sheet;
  const b = addChild(sheet, 'a', '竞品调研', 'a1');
  sheet = b.sheet;
  const c = addChild(sheet, 'root', '产品', 'b');
  sheet = c.sheet;
  doc = updateSheet(doc, sheet);
  return { doc, sheetId };
}

test('多画布：新增自动激活并追加顺序', () => {
  const { doc } = docWithTree();
  const result = addSheet(doc, '第二画布');
  assert.equal(result.doc.sheetOrder.length, 2);
  assert.equal(result.doc.activeSheetId, result.sheetId);
  assert.equal(result.doc.sheets[result.sheetId]?.title, '第二画布');
});

test('多画布：重命名、激活、移动、删除', () => {
  let { doc } = docWithTree();
  const added = addSheet(doc, 'B');
  doc = renameSheet(added.doc, added.sheetId, '画布 B');
  assert.equal(doc.sheets[added.sheetId]?.title, '画布 B');

  const first = doc.sheetOrder[0]!;
  doc = activateSheet(doc, first);
  assert.equal(doc.activeSheetId, first);

  doc = moveSheet(doc, added.sheetId, 0);
  assert.equal(doc.sheetOrder[0], added.sheetId);

  doc = removeSheet(doc, added.sheetId);
  assert.equal(doc.sheetOrder.length, 1);
  assert.equal(doc.activeSheetId, first);
});

test('多画布：至少保留一张，删除不存在画布报错', () => {
  const { doc } = docWithTree();
  assert.throws(() => removeSheet(doc, doc.sheetOrder[0]!), /至少保留/);
  assert.throws(() => removeSheet(doc, 'missing'), /sheet not found/);
});

test('多画布：复制保留内容与结构且互不影响', () => {
  const { doc, sheetId } = docWithTree();
  const result = duplicateSheet(doc, sheetId);
  const copy = result.doc.sheets[result.sheetId]!;
  assert.equal(Object.keys(copy.topics).length, 4);
  assert.equal(copy.title, '画布 1 副本');
  assert.notEqual(copy.id, sheetId);
  assert.equal(result.doc.sheetOrder.length, 2);
});

test('元素：笔记为空时自动清除', () => {
  const { doc, sheetId } = docWithTree();
  let sheet = setNote(getSheet(doc), 'a', '  这是一段备注  ');
  assert.equal(sheet.topics['a']?.note, '这是一段备注');
  sheet = setNote(sheet, 'a', '   ');
  assert.equal(sheet.topics['a']?.note, undefined);
  assert.equal(getSheet(doc).topics['a']?.note, undefined);
});

test('元素：待办、标签去重与上限、链接', () => {
  let { doc } = docWithTree();
  let sheet = getSheet(doc);
  sheet = setTodo(sheet, 'a', true);
  assert.equal(sheet.topics['a']?.todo, true);
  sheet = setTodo(sheet, 'a', null);
  assert.equal(sheet.topics['a']?.todo, undefined);

  sheet = addLabel(sheet, 'a', '高优先');
  sheet = addLabel(sheet, 'a', '高优先');
  sheet = addLabel(sheet, 'a', '   ');
  assert.deepEqual(sheet.topics['a']?.labels, ['高优先']);

  sheet = removeLabel(sheet, 'a', '高优先');
  assert.equal(sheet.topics['a']?.labels, undefined);

  sheet = setLink(sheet, 'a', { type: 'web', url: 'https://example.com' });
  assert.equal(sheet.topics['a']?.link?.type, 'web');
  sheet = setLink(sheet, 'a', null);
  assert.equal(sheet.topics['a']?.link, undefined);
});

test('任务：patchTask 保留既有字段并校验默认值', () => {
  let { doc } = docWithTree();
  let sheet = getSheet(doc);
  sheet = patchTask(sheet, 'a', { progress: 40 });
  assert.equal(sheet.topics['a']?.task?.progress, 40);
  assert.equal(sheet.topics['a']?.task?.priority, 'medium');
  sheet = patchTask(sheet, 'a', { start: '2026-11-01', due: '2026-11-05' });
  assert.equal(sheet.topics['a']?.task?.start, '2026-11-01');
  assert.equal(sheet.topics['a']?.task?.progress, 40);
});

test('查询：扁平化按深度优先顺序', () => {
  const { doc, sheetId } = docWithTree();
  const rows = flatten(doc.sheets[sheetId]!);
  assert.deepEqual(rows.map((r) => r.id), ['root', 'a', 'a1', 'b']);
  assert.deepEqual(rows.map((r) => r.depth), [0, 1, 2, 1]);

  const collapsed = flatten(doc.sheets[sheetId]!, new Set(['a']));
  assert.deepEqual(collapsed.map((r) => r.id), ['root', 'a', 'b']);
});

test('查询：搜索覆盖文本、备注、标签', () => {
  let { doc } = docWithTree();
  let sheet = getSheet(doc);
  sheet = setNote(sheet, 'a1', '包含 竞对 一词');
  sheet = addLabel(sheet, 'b', '关键路径');

  assert.deepEqual(searchTopics(sheet, '竞品'), ['a1']);
  assert.deepEqual(searchTopics(sheet, '竞对'), ['a1']);
  assert.deepEqual(searchTopics(sheet, '关键'), ['b']);
  assert.deepEqual(searchTopics(sheet, '  '), []);
});

test('查询：统计主题、字符、词数与任务数', () => {
  let { doc } = docWithTree();
  let sheet = getSheet(doc);
  sheet = patchTask(sheet, 'a1', { progress: 50 });
  const stats = statsOf(sheet);
  assert.equal(stats.topics, 4);
  assert.equal(stats.tasks, 1);
  assert.ok(stats.chars > 0);
  assert.ok(stats.words > 0);
});

test('查询：父任务进度按工期加权', () => {
  let { doc } = docWithTree();
  let sheet = getSheet(doc);
  const child = addChild(sheet, 'a', '任务 B', 'a2');
  sheet = child.sheet;
  sheet = patchTask(sheet, 'a1', { progress: 100, start: '2026-11-01', due: '2026-11-01' });
  sheet = patchTask(sheet, 'a2', { progress: 0, start: '2026-11-01', due: '2026-11-03' });

  const progress = derivedProgress(sheet, 'a');
  assert.equal(progress, 25, '1 天 100% 与 3 天 0% 加权后应为 25%');
  assert.deepEqual(tasksOf(sheet).map((t) => t.id).sort(), ['a1', 'a2']);
});

test('查询：逾期判定', () => {
  assert.equal(isOverdue({ progress: 40, priority: 'high', due: '2020-01-01' }, new Date('2026-11-11')), true);
  assert.equal(isOverdue({ progress: 100, priority: 'high', due: '2020-01-01' }, new Date('2026-11-11')), false);
  assert.equal(isOverdue({ progress: 10, priority: 'high', due: '2030-01-01' }, new Date('2026-11-11')), false);
});

test('整枝拖动：收集后代并自动去重', () => {
  const { doc, sheetId } = docWithTree();
  const sheet = doc.sheets[sheetId]!;

  assert.deepEqual(collectSubtrees(sheet, ['a']).sort(), ['a', 'a1']);
  assert.deepEqual(collectSubtrees(sheet, ['a', 'a1']).sort(), ['a', 'a1']);
  assert.deepEqual(collectSubtrees(sheet, ['root']).sort(), ['a', 'a1', 'b', 'root']);
  assert.deepEqual(collectSubtrees(sheet, ['missing']), []);
});
