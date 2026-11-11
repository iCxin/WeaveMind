import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addAttachment,
  addAudio,
  addBoundary,
  addChild,
  addRelationship,
  addSummary,
  addZone,
  clearAttachments,
  clearAudio,
  createSheet,
  removeBoundariesAt,
  removeBoundary,
  removeRelationshipsAt,
  removeZone,
  renameBoundary,
  setEquation,
  setImage
} from '../src/model.ts';
import { layoutSheet, GAP_X } from '../../layout/src/layout.ts';
import { createEstimateMeasurer } from '../../layout/src/measure.ts';

const measure = createEstimateMeasurer();

function build() {
  let sheet = createSheet('s1', '根');
  const a = addChild(sheet, 'root', 'A', 'a');
  sheet = a.sheet;
  const a1 = addChild(sheet, 'a', 'A1', 'a1');
  sheet = a1.sheet;
  const a2 = addChild(sheet, 'a', 'A2', 'a2');
  sheet = a2.sheet;
  const b = addChild(sheet, 'root', 'B', 'b');
  sheet = b.sheet;
  return sheet;
}

test('外框：包围成员并输出标题', () => {
  const sheet = build();
  const withBoundary = addBoundary(sheet, ['a1', 'a2'], '关键路径');
  const layout = layoutSheet(withBoundary, new Set(), measure);

  assert.equal(layout.boundaries.length, 1);
  const boundary = layout.boundaries[0]!;
  assert.equal(boundary.title, '关键路径');

  for (const id of ['a1', 'a2']) {
    const box = layout.boxes.get(id)!;
    assert.ok(box.x >= boundary.x && box.y >= boundary.y);
    assert.ok(box.x + box.w <= boundary.x + boundary.w);
    assert.ok(box.y + box.h <= boundary.y + boundary.h);
  }
});

test('外框：中心主题被排除，移除后清空', () => {
  const sheet = build();
  const none = addBoundary(sheet, ['root'], '无效');
  assert.equal(none.boundaries.length, 0);

  const withBoundary = addBoundary(sheet, ['a'], '外框');
  const removed = removeBoundariesAt(withBoundary, 'a');
  assert.equal(removed.boundaries.length, 0);
});

test('外框：可重命名、拒绝空标题、可单独删除', () => {
  const sheet = addBoundary(build(), ['a'], '旧标题');
  const id = sheet.boundaries[0]!.id;

  const renamed = renameBoundary(sheet, id, '  关键路径  ');
  assert.equal(renamed.boundaries[0]?.title, '关键路径');

  const blank = renameBoundary(renamed, id, '   ');
  assert.equal(blank.boundaries[0]?.title, '关键路径', '空标题应忽略');

  const removed = removeBoundary(renamed, id);
  assert.equal(removed.boundaries.length, 0);
});

test('联系：输出端点几何，移除后消失', () => {
  const sheet = addRelationship(build(), 'a1', 'b', '依赖');
  const layout = layoutSheet(sheet, new Set(), measure);
  assert.equal(layout.relationships.length, 1);
  const relation = layout.relationships[0]!;
  assert.equal(relation.label, '依赖');
  assert.ok(Number.isFinite(relation.x1) && Number.isFinite(relation.y2));

  const removed = removeRelationshipsAt(sheet, 'a1');
  assert.equal(removed.relationships.length, 0);
});

test('专区：原样进入布局并参与包围盒', () => {
  const sheet = addZone(build(), { x: -400, y: -300, w: 800, h: 600 }, '分区 A');
  const layout = layoutSheet(sheet, new Set(), measure);
  assert.equal(layout.zones.length, 1);
  assert.equal(layout.zones[0]?.title, '分区 A');
  assert.ok(layout.bounds.x <= -400);
  assert.ok(layout.bounds.y <= -300);

  const removed = removeZone(sheet, layout.zones[0]!.id);
  assert.equal(removed.zones.length, 0);
});

test('概要：生成概要节点，置于覆盖区右侧并引出连线', () => {
  const sheet = build();
  const result = addSummary(sheet, ['a1', 'a2'], '汇总');
  assert.ok(result.id);

  const layout = layoutSheet(result.sheet, new Set(), measure);
  const summary = layout.boxes.get(result.id!);
  assert.ok(summary, '概要节点应参与布局');

  const a1 = layout.boxes.get('a1')!;
  const a2 = layout.boxes.get('a2')!;
  const right = Math.max(a1.x + a1.w, a2.x + a2.w);
  assert.equal(summary!.x, right + GAP_X);

  const summaryEdges = layout.edges.filter((edge) => edge.to === result.id);
  assert.equal(summaryEdges.length, 2, '两个被覆盖主题各引一条连线');
});

test('概要：跨父级或数量不足时拒绝创建', () => {
  const sheet = build();
  assert.equal(addSummary(sheet, ['a1', 'b']).id, null, '不同父级应拒绝');
  assert.equal(addSummary(sheet, ['a1']).id, null, '少于两个应拒绝');
});

test('图片与公式：写入主题并影响节点尺寸', () => {
  let sheet = build();
  sheet = setImage(sheet, 'a', { dataUrl: 'data:image/png;base64,AAA', width: 10, height: 10 });
  sheet = setEquation(sheet, 'a', 'E=mc^2');
  assert.ok(sheet.topics['a']?.image);
  assert.equal(sheet.topics['a']?.equation?.latex, 'E=mc^2');

  const layout = layoutSheet(sheet, new Set(), measure);
  const node = layout.boxes.get('a')!;
  assert.equal(node.h, 46, '含公式的节点应加高');

  sheet = setEquation(sheet, 'a', '   ');
  assert.equal(sheet.topics['a']?.equation, undefined);
  sheet = setImage(sheet, 'a', null);
  assert.equal(sheet.topics['a']?.image, undefined);
});

test('附件与语音：追加与清空', () => {
  let sheet = build();
  sheet = addAttachment(sheet, 'a', { id: 'f1', name: 'a.pdf', mime: 'application/pdf', size: 10, dataUrl: 'data:,' });
  sheet = addAttachment(sheet, 'a', { id: 'f2', name: 'b.pdf', mime: 'application/pdf', size: 20, dataUrl: 'data:,' });
  assert.equal(sheet.topics['a']?.attachments?.length, 2);
  sheet = clearAttachments(sheet, 'a');
  assert.equal(sheet.topics['a']?.attachments, undefined);

  sheet = addAudio(sheet, 'a', { id: 'au1', name: '语音', durationMs: 0, dataUrl: 'data:,' });
  assert.equal(sheet.topics['a']?.audio?.length, 1);
  sheet = clearAudio(sheet, 'a');
  assert.equal(sheet.topics['a']?.audio, undefined);
});
