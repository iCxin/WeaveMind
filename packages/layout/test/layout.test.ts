import test from 'node:test';
import assert from 'node:assert/strict';

import { addChild, createSheet } from '../../core/src/model.ts';
import { layoutSheet, NODE_H } from '../src/layout.ts';
import { createEstimateMeasurer } from '../src/measure.ts';

const measure = createEstimateMeasurer();

function build() {
  let sheet = createSheet('s1');
  for (const [index, name] of ['市场', '产品', '交付', '复盘'].entries()) {
    const added = addChild(sheet, 'root', name, `b${index}`);
    sheet = added.sheet;
    if (index < 3) {
      const c1 = addChild(sheet, `b${index}`, `${name}-1`, `b${index}-1`);
      const c2 = addChild(c1.sheet, `b${index}`, `${name}-2`, `b${index}-2`);
      sheet = c2.sheet;
    }
  }
  return sheet;
}

test('思维导图：根居中，分支左右分布', () => {
  const sheet = build();
  const result = layoutSheet(sheet, new Set(), measure);
  assert.equal(result.boxes.size, 11);

  const root = result.boxes.get('root')!;
  assert.equal(root.x + root.w / 2, 0);
  assert.equal(root.y + root.h / 2, 0);

  assert.ok(result.boxes.get('b0')!.x > 0, '第 1 个分支应在右侧');
  assert.ok(result.boxes.get('b1')!.x < 0, '第 2 个分支应在左侧');
  assert.ok(result.boxes.get('b2')!.x > 0, '第 3 个分支应在右侧');
  assert.ok(result.boxes.get('b3')!.x < 0, '第 4 个分支应在左侧');
});

test('逻辑图：所有后代位于同一侧且逐层后退', () => {
  const sheet = { ...build(), structure: 'logic-right' as const };
  const result = layoutSheet(sheet, new Set(), measure);
  for (const [id, box] of result.boxes) {
    if (id === 'root') continue;
    assert.ok(box.x > 0, `${id} 应在右侧`);
  }
  const root = result.boxes.get('root')!;
  const level1 = result.boxes.get('b0')!;
  const level2 = result.boxes.get('b0-1')!;
  assert.ok(level1.x > root.x + root.w);
  assert.ok(level2.x > level1.x + level1.w);
});

test('组织结构图：子节点在父节点下方', () => {
  const sheet = { ...build(), structure: 'org-down' as const };
  const result = layoutSheet(sheet, new Set(), measure);
  const root = result.boxes.get('root')!;
  const b0 = result.boxes.get('b0')!;
  assert.ok(b0.y > root.y + root.h);
  const c0 = result.boxes.get('b0-1')!;
  assert.ok(c0.y > b0.y + b0.h);
});

test('鱼骨图：主骨交替分布在脊柱两侧', () => {
  const sheet = { ...build(), structure: 'fishbone-right' as const };
  const result = layoutSheet(sheet, new Set(), measure);
  const b0 = result.boxes.get('b0')!;
  const b1 = result.boxes.get('b1')!;
  assert.ok(b0.y + b0.h / 2 < 0, '第 1 根骨在上侧');
  assert.ok(b1.y + b1.h / 2 > 0, '第 2 根骨在下侧');
  assert.ok(b0.x > result.boxes.get('root')!.x);
  assert.ok(result.spine, '应输出脊柱几何');
});

test('组织结构图（向上）：子节点在父节点上方', () => {
  const sheet = { ...build(), structure: 'org-up' as const };
  const result = layoutSheet(sheet, new Set(), measure);
  const root = result.boxes.get('root')!;
  const b0 = result.boxes.get('b0')!;
  assert.ok(b0.y + b0.h < root.y, '分支应在中心主题上方');
  const c0 = result.boxes.get('b0-1')!;
  assert.ok(c0.y + c0.h < b0.y, '子主题应在分支上方');
});

test('树形图（向左）：后代位于左侧', () => {
  const sheet = { ...build(), structure: 'tree-left' as const };
  const result = layoutSheet(sheet, new Set(), measure);
  for (const [id, box] of result.boxes) {
    if (id === 'root') continue;
    assert.ok(box.x + box.w < 0, `${id} 应在左侧`);
  }
});

test('鱼骨图（向左）：主骨与脊柱朝向左侧', () => {
  const sheet = { ...build(), structure: 'fishbone-left' as const };
  const result = layoutSheet(sheet, new Set(), measure);
  const root = result.boxes.get('root')!;
  const b0 = result.boxes.get('b0')!;
  assert.ok(b0.x + b0.w < root.x, '主骨应在中心主题左侧');
  assert.ok(result.spine && result.spine.x2 < result.spine.x1, '脊柱应向左延伸');
});

test('时间轴：主分支沿水平轴上下交替', () => {
  const sheet = { ...build(), structure: 'timeline-right' as const };
  const result = layoutSheet(sheet, new Set(), measure);
  const b0 = result.boxes.get('b0')!;
  const b1 = result.boxes.get('b1')!;
  assert.ok(b0.y + b0.h / 2 < 0, '第 1 个节点在上方');
  assert.ok(b1.y + b1.h / 2 > 0, '第 2 个节点在下方');
  assert.ok(b1.x > b0.x, '节点沿水平方向展开');
  assert.ok(result.spine && result.spine.x2 > result.spine.x1);
});

test('折叠：隐藏后代且记录折叠数量', () => {
  const sheet = build();
  const result = layoutSheet(sheet, new Set(['b0']), measure);
  assert.equal(result.boxes.has('b0'), true);
  assert.equal(result.boxes.has('b0-1'), false);
  assert.equal(result.boxes.has('b0-2'), false);
  assert.equal(result.boxes.get('b0')?.collapsedCount, 2);
});

test('连线数量等于可见父子对', () => {
  const sheet = build();
  const full = layoutSheet(sheet, new Set(), measure);
  assert.equal(full.edges.length, 4 + 6);

  const collapsed = layoutSheet(sheet, new Set(['b0']), measure);
  assert.equal(collapsed.edges.length, 4 + 4);
});

test('包围盒覆盖全部节点并留出内边距', () => {
  const sheet = build();
  const result = layoutSheet(sheet, new Set(), measure);
  for (const box of result.boxes.values()) {
    assert.ok(box.x >= result.bounds.x);
    assert.ok(box.y >= result.bounds.y);
    assert.ok(box.x + box.w <= result.bounds.x + result.bounds.w);
    assert.ok(box.y + box.h <= result.bounds.y + result.bounds.h);
  }
});

test('节点高度固定，宽度受上下限约束', () => {
  const sheet = build();
  const result = layoutSheet(sheet, new Set(), measure);
  for (const box of result.boxes.values()) {
    assert.equal(box.h, NODE_H);
    assert.ok(box.w >= 84 && box.w <= 280);
  }
});
