import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addChild,
  addSibling,
  createSheet,
  createWorkbook,
  descendants,
  getSheet,
  removeSingle,
  removeSubtree,
  resetIdSequence,
  setMarker,
  setStructure,
  setText,
  topBranchOf
} from '../src/model.ts';
import { History } from '../src/history.ts';

function build() {
  resetIdSequence();
  const sheet = createSheet('s1');
  const a = addChild(sheet, 'root', 'A', 'a');
  const b = addChild(a.sheet, 'root', 'B', 'b');
  const a1 = addChild(b.sheet, 'a', 'A1', 'a1');
  const a2 = addChild(a1.sheet, 'a', 'A2', 'a2');
  const b1 = addChild(a2.sheet, 'b', 'B1', 'b1');
  return { sheet: b1.sheet, a: 'a', b: 'b', a1: 'a1', a2: 'a2', b1: 'b1' };
}

test('新建文档：唯一中心主题，无父节点', () => {
  const doc = createWorkbook('测试');
  const sheet = getSheet(doc);
  assert.equal(Object.keys(sheet.topics).length, 1);
  assert.equal(sheet.topics[sheet.rootId]?.parentId, null);
  assert.equal(doc.sheetOrder.length, 1);
});

test('添加子主题：父子双向引用正确，类型自动降级', () => {
  const { sheet } = build();
  assert.deepEqual(sheet.topics['root']?.children, ['a', 'b']);
  assert.equal(sheet.topics['a']?.kind, 'branch');
  assert.equal(sheet.topics['a1']?.kind, 'sub');
  assert.equal(sheet.topics['a1']?.parentId, 'a');
});

test('添加同级主题：插入到目标之后', () => {
  let { sheet } = build();
  const r = addSibling(sheet, 'a1', 'A1.5', 'mid');
  sheet = r.sheet;
  assert.deepEqual(sheet.topics['a']?.children, ['a1', 'mid', 'a2']);
});

test('删除子树：连同后代一并移除，父级引用清理', () => {
  const { sheet } = build();
  const next = removeSubtree(sheet, 'a');
  assert.equal(next.topics['a'], undefined);
  assert.equal(next.topics['a1'], undefined);
  assert.equal(next.topics['a2'], undefined);
  assert.deepEqual(next.topics['root']?.children, ['b']);
});

test('删除单个主题：子主题按原序上提', () => {
  const { sheet } = build();
  const next = removeSingle(sheet, 'a');
  assert.equal(next.topics['a'], undefined);
  assert.deepEqual(next.topics['root']?.children, ['a1', 'a2', 'b']);
  assert.equal(next.topics['a1']?.parentId, 'root');
  assert.equal(next.topics['a2']?.parentId, 'root');
});

test('根主题不可删除', () => {
  const { sheet } = build();
  assert.throws(() => removeSubtree(sheet, 'root'));
  assert.throws(() => removeSingle(sheet, 'root'));
});

test('结构共享：未修改子树保持同一引用', () => {
  const { sheet } = build();
  const next = setText(sheet, 'a1', 'A1 改名');
  assert.equal(next.topics['a1'] === sheet.topics['a1'], false);
  assert.equal(next.topics['b1'], sheet.topics['b1']);
  assert.equal(next.topics['a2'], sheet.topics['a2']);
});

test('标记、结构、文本写入不污染原文档', () => {
  const { sheet } = build();
  const withMarker = setMarker(sheet, 'a', 'flag');
  const withStructure = setStructure(withMarker, 'a', 'org-down');
  assert.equal(sheet.topics['a']?.marker, null);
  assert.equal(withStructure.topics['a']?.marker, 'flag');
  assert.equal(withStructure.topics['a']?.structure, 'org-down');
});

test('后代集合与一级分支归属', () => {
  const { sheet } = build();
  assert.deepEqual(descendants(sheet, 'a').sort(), ['a1', 'a2']);
  assert.equal(topBranchOf(sheet, 'a1'), 'a');
  assert.equal(topBranchOf(sheet, 'b1'), 'b');
});

test('撤销栈：入栈、回退、重做、分支截断与容量上限', () => {
  const { sheet } = build();
  const h = new History(sheet, 3);
  const s1 = setText(sheet, 'a', 'v1');
  const s2 = setText(s1, 'a', 'v2');

  h.push(s1, '改文本 1');
  h.push(s2, '改文本 2');
  assert.equal(h.undoLabel, '改文本 2');

  assert.equal(h.undo(), s1);
  assert.equal(h.undoLabel, '改文本 1');
  assert.equal(h.current.topics['a']?.text, 'v1');

  assert.equal(h.redo(), s2);
  assert.equal(h.canRedo, false);

  h.undo();
  const s3 = setText(s1, 'a', 'v3');
  h.push(s3, '改文本 3');
  assert.equal(h.canRedo, false, '新分支应截断原有重做链');

  h.push(setText(s3, 'a', 'v4'), '4');
  h.push(setText(s3, 'a', 'v5'), '5');
  assert.ok(h.size <= 3, '容量上限应生效');
});

test('历史：相同引用不入栈', () => {
  const { sheet } = build();
  const h = new History(sheet, 10);
  h.push(sheet, '无变化');
  assert.equal(h.size, 1);
  assert.equal(h.canUndo, false);
});
