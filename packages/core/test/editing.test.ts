import test from 'node:test';
import assert from 'node:assert/strict';

import { addChild, addFloatingTopic, createSheet, moveTopic } from '../src/model.ts';
import {
  clearMarkers,
  clearTopicOffsets,
  copySubtrees,
  insertClipboard,
  replaceText,
  setLink,
  setMarker,
  setText,
  setTopicFontSize,
  setTopicHeight,
  setTopicOffset,
  setTopicStyle,
  setTopicWidth,
  toggleMarker
} from '../src/model.ts';
import { formatLatex } from '../src/latex.ts';
import { parseRich, stripRich } from '../src/rich.ts';
import { flatten } from '../src/query.ts';
import { layoutSheet } from '../../layout/src/layout.ts';
import { createEstimateMeasurer } from '../../layout/src/measure.ts';
import { wrapText } from '../../layout/src/wrap.ts';

function build() {
  let sheet = createSheet('s1', '根');
  const a = addChild(sheet, 'root', 'A', 'a');
  sheet = a.sheet;
  const a1 = addChild(sheet, 'a', 'A1', 'a1');
  sheet = a1.sheet;
  const b = addChild(sheet, 'root', 'B', 'b');
  sheet = b.sheet;
  return sheet;
}

test('移动主题：改挂到新父级并保持唯一引用', () => {
  const sheet = build();
  const next = moveTopic(sheet, 'a1', 'b');
  assert.equal(next.topics['a1']?.parentId, 'b');
  assert.deepEqual(next.topics['b']?.children, ['a1']);
  assert.deepEqual(next.topics['a']?.children, []);
  assert.equal(flatten(next).filter((row) => row.id === 'a1').length, 1);
});

test('移动主题：挂到中心主题时升级为分支', () => {
  const sheet = build();
  const next = moveTopic(sheet, 'a1', 'root');
  assert.equal(next.topics['a1']?.kind, 'branch');
  assert.deepEqual(next.topics['root']?.children, ['a', 'b', 'a1']);
});

test('移动主题：拒绝自身、后代与中心主题', () => {
  const sheet = build();
  assert.throws(() => moveTopic(sheet, 'a', 'a'), /自身/);
  assert.throws(() => moveTopic(sheet, 'a', 'a1'), /子级/);
  assert.throws(() => moveTopic(sheet, 'root', 'a'), /中心主题/);
});

test('移动主题：可指定插入位置', () => {
  const sheet = build();
  const next = moveTopic(sheet, 'b', 'root', 0);
  assert.deepEqual(next.topics['root']?.children, ['b', 'a']);
});

test('LaTeX 美化：常见命令转 Unicode', () => {
  assert.equal(formatLatex('E=mc^2'), 'E=mc²');
  assert.equal(formatLatex('x_1 + y_2'), 'x₁ + y₂');
  assert.equal(formatLatex('\\alpha + \\beta'), 'α + β');
  assert.equal(formatLatex('\\frac{a}{b}'), 'a/b');
  assert.equal(formatLatex('\\sqrt{x}'), '√(x)');
  assert.equal(formatLatex('a \\cdot b'), 'a · b');
  assert.equal(formatLatex('x \\le 10'), 'x ≤ 10');
  assert.equal(formatLatex('  '), '');
});

test('LaTeX 美化：不可映射的上下标保留可读形式', () => {
  assert.equal(formatLatex('x^{ab}'), 'x^ab');
  assert.equal(formatLatex('a_{ij}'), 'a_ij');
});

const measure = createEstimateMeasurer();

test('自由布局：手动偏移精确作用于节点且连线随之重算', () => {
  const base = build();
  const layoutA = layoutSheet(base, new Set(), measure);
  const before = layoutA.boxes.get('a1')!;

  const moved = setTopicOffset(base, 'a1', 40, 25);
  const layoutB = layoutSheet(moved, new Set(), measure);
  const after = layoutB.boxes.get('a1')!;

  assert.equal(after.x, before.x + 40);
  assert.equal(after.y, before.y + 25);
  assert.equal(after.w, before.w);

  const edge = layoutB.edges.find((item) => item.to === 'a1');
  assert.ok(edge, '连线应存在');
  const parent = layoutB.boxes.get('a')!;
  assert.equal(edge!.x1, parent.x + parent.w, '连线起点应为父节点右缘');
  assert.equal(edge!.x2, after.x, '连线终点应跟随移动后的子节点');
});

test('自由布局：可批量重置偏移', () => {
  let sheet = build();
  sheet = setTopicOffset(sheet, 'a', 30, 10);
  sheet = setTopicOffset(sheet, 'b', -20, 14);
  const cleared = clearTopicOffsets(sheet);
  assert.equal(cleared.topics['a']?.offsetX, undefined);
  assert.equal(cleared.topics['b']?.offsetY, undefined);

  const layout = layoutSheet(cleared, new Set(), measure);
  const original = layoutSheet(build(), new Set(), measure);
  assert.equal(layout.boxes.get('a')!.x, original.boxes.get('a')!.x);
});

test('自动排斥：拖到其它主题上会被推开', () => {
  let sheet = build();
  const base = layoutSheet(sheet, new Set(), measure);
  const child = base.boxes.get('a1')!;
  const parent = base.boxes.get('a')!;
  sheet = setTopicOffset(
    sheet,
    'a1',
    parent.x + parent.w / 2 - (child.x + child.w / 2),
    parent.y + parent.h / 2 - (child.y + child.h / 2)
  );

  const layout = layoutSheet(sheet, new Set(), measure);
  const moved = layout.boxes.get('a1')!;
  const target = layout.boxes.get('a')!;
  const gapX = Math.max(moved.x - (target.x + target.w), target.x - (moved.x + moved.w));
  const gapY = Math.max(moved.y - (target.y + target.h), target.y - (moved.y + moved.h));
  assert.ok(gapX >= 9 || gapY >= 9, `应保持排斥间距，实际 ${gapX}/${gapY}`);
});

test('复制粘贴：克隆子树并重映射内部引用', () => {
  let sheet = build();
  sheet = setMarker(sheet, 'a1', 'star');
  sheet = setLink(sheet, 'a1', { type: 'topic', sheetId: 's1', topicId: 'a' });

  const clip = copySubtrees(sheet, ['a', 'a1']);
  assert.deepEqual(clip.roots, ['a'], '祖先被选中时只保留最外层');
  assert.ok(clip.topics['a'] && clip.topics['a1']);

  const pasted = insertClipboard(sheet, 'b', clip);
  const clonedId = pasted.ids[0]!;
  const cloned = pasted.sheet.topics[clonedId]!;
  assert.notEqual(clonedId, 'a');
  assert.equal(cloned.parentId, 'b');
  assert.equal(cloned.kind, 'sub');

  const clonedChild = pasted.sheet.topics[cloned.children[0]!]!;
  assert.equal(clonedChild.text, 'A1');
  assert.equal(clonedChild.marker, 'star');
  assert.equal(clonedChild.link?.type, 'topic');
  if (clonedChild.link?.type === 'topic') {
    assert.equal(clonedChild.link.topicId, cloned.id, '内部主题链接应重映射');
    assert.equal(clonedChild.link.sheetId, 's1');
  }
});

test('节点宽度：手动宽度覆盖自动测量', () => {
  const sheet = setTopicWidth(build(), 'a', 220);
  const layout = layoutSheet(sheet, new Set(), measure);
  assert.equal(layout.boxes.get('a')!.w, 220);

  const clamped = setTopicWidth(build(), 'a', 9999);
  assert.equal(clamped.topics['a']?.width, 620);
});

test('节点高度：手动高度覆盖自动高度并可恢复', () => {
  const sheet = setTopicHeight(build(), 'a', 120);
  assert.equal(layoutSheet(sheet, new Set(), measure).boxes.get('a')!.h, 120);

  assert.equal(setTopicHeight(build(), 'a', 9999).topics['a']?.height, 400);
  assert.equal(setTopicHeight(build(), 'a', 5).topics['a']?.height, 34);
  assert.equal(setTopicHeight(sheet, 'a', null).topics['a']?.height, undefined);
});

test('浮动主题：按绝对坐标放置并进入大纲', () => {
  const created = addFloatingTopic(build(), 800, 600, '浮动主题');
  const layout = layoutSheet(created.sheet, new Set(), measure);
  const box = layout.boxes.get(created.id)!;
  assert.equal(box.x + box.w / 2, 800);
  assert.equal(box.y + box.h / 2, 600);
  assert.ok(flatten(created.sheet).some((row) => row.id === created.id), '应出现在扁平化结构');
});

test('标记：可叠加多个并逐个切换', () => {
  let sheet = build();
  sheet = toggleMarker(sheet, 'a', 'prio1');
  sheet = toggleMarker(sheet, 'a', 'star');
  assert.deepEqual(sheet.topics['a']?.markers, ['prio1', 'star']);
  assert.equal(sheet.topics['a']?.marker, 'prio1');

  sheet = toggleMarker(sheet, 'a', 'prio1');
  assert.deepEqual(sheet.topics['a']?.markers, ['star']);
  assert.equal(sheet.topics['a']?.marker, 'star');

  sheet = clearMarkers(sheet, 'a');
  assert.equal(sheet.topics['a']?.markers, undefined);
  assert.equal(sheet.topics['a']?.marker, null);
});

test('主题样式：加粗影响布局宽度', () => {
  const sheet = setText(build(), 'a', '一个比较长的主题名称用于测量宽度');
  const normal = layoutSheet(sheet, new Set(), measure).boxes.get('a')!.w;
  const boldSheet = setTopicStyle(sheet, 'a', { fontWeight: 700 });
  const bold = layoutSheet(boldSheet, new Set(), measure).boxes.get('a')!.w;
  assert.ok(bold > normal, `加粗后应更宽：${normal} → ${bold}`);
});

test('多行内容：节点高度随行数增长', () => {
  let sheet = build();
  const single = layoutSheet(sheet, new Set(), measure).boxes.get('a1')!.h;

  sheet = setText(sheet, 'a1', '第一行\n第二行\n第三行');
  const multi = layoutSheet(sheet, new Set(), measure).boxes.get('a1')!.h;
  assert.ok(multi > single, '多行应更高');
  assert.equal(multi, 3 * 18 + 14);
});

test('字号：影响节点尺寸且被限制在合理区间', () => {
  let sheet = build();
  const before = layoutSheet(sheet, new Set(), measure).boxes.get('a')!;
  sheet = setTopicFontSize(sheet, 'a', 20);
  assert.equal(sheet.topics['a']?.fontSize, 20);

  const after = layoutSheet(sheet, new Set(), measure).boxes.get('a')!;
  assert.ok(after.h > before.h, '大字号应提高节点高度');

  const clamped = setTopicFontSize(sheet, 'a', 99);
  assert.equal(clamped.topics['a']?.fontSize, 22);
});

test('查找替换：统计命中并替换全部', () => {
  let sheet = build();
  sheet = setText(sheet, 'a1', '竞品调研 A');
  const added = addChild(sheet, 'a', '竞品复盘', 'a3');
  sheet = added.sheet;

  const result = replaceText(sheet, '竞品', '对手');
  assert.equal(result.count, 2);
  assert.equal(result.sheet.topics['a1']?.text, '对手调研 A');
  assert.equal(result.sheet.topics['a3']?.text, '对手复盘');
  assert.equal(result.sheet.topics['a']?.text, 'A', '未命中的主题保持不变');

  assert.equal(replaceText(sheet, '不存在的', 'x').count, 0);
  assert.equal(replaceText(sheet, '   ', 'x').count, 0);
});

test('富文本：解析粗体、斜体与纯文本段', () => {
  const runs = parseRich('**71 项** 测试与 *回归*');
  assert.deepEqual(runs, [
    { text: '71 项', bold: true, italic: false },
    { text: ' 测试与 ', bold: false, italic: false },
    { text: '回归', bold: false, italic: true }
  ]);
  assert.equal(stripRich('**71 项** 单元测试'), '71 项 单元测试');
  assert.deepEqual(parseRich('普通文本'), [{ text: '普通文本', bold: false, italic: false }]);
});

test('富文本：布局宽度按去除标记后的文本计算', () => {
  const plain = setText(build(), 'a1', '普通文本');
  const rich = setText(build(), 'a1', '**普通**文本');
  const plainWidth = layoutSheet(plain, new Set(), measure).boxes.get('a1')!.w;
  const richWidth = layoutSheet(rich, new Set(), measure).boxes.get('a1')!.w;
  assert.equal(richWidth, plainWidth);
});

test('自动换行：中文按宽度断行', () => {
  const lines = wrapText('一二三四五六七八九十一二三四五', 50, 13, 500, (text) => text.length * 10);
  assert.equal(lines.length, 3);
  assert.ok(lines.every((line) => line.length <= 5));
});

test('自动换行：英文按单词断行', () => {
  const lines = wrapText('alpha beta gamma delta', 50, 13, 500, (text) => text.length * 10);
  assert.deepEqual(lines, ['alpha', 'beta', 'gamma', 'delta']);
});

test('自动换行：超长文本提升节点高度而非截断', () => {
  const longText = '这是一段用于验证自动换行的较长主题文本内容'.repeat(3);
  const sheet = setText(build(), 'a1', longText);
  const layout = layoutSheet(sheet, new Set(), measure);
  assert.ok(layout.boxes.get('a1')!.h > 34, '换行后节点应变高');
  assert.ok(layout.boxes.get('a1')!.w <= 360, '宽度仍受上限约束');
});
