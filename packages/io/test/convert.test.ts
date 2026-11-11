import test from 'node:test';
import assert from 'node:assert/strict';

import { addChild, createSheet, setMarker, setNote, setTodo } from '../../core/src/model.ts';
import { flatten, statsOf } from '../../core/src/query.ts';
import { layoutSheet } from '../../layout/src/layout.ts';
import { createEstimateMeasurer } from '../../layout/src/measure.ts';
import { toSvg } from '../../render/src/svg.ts';
import { parseMarkdown, toMarkdown } from '../src/markdown.ts';
import { parseOpml, toOpml } from '../src/opml.ts';
import { sheetFromTree } from '../src/tree.ts';

function idByText(sheet: ReturnType<typeof buildSheet>, text: string): string {
  const row = flatten(sheet).find((item) => item.topic.text === text);
  assert.ok(row, `未找到主题：${text}`);
  return row!.id;
}

function buildSheet() {
  let sheet = createSheet('s1', '产品规划');
  const market = addChild(sheet, 'root', '市场', 'a');
  sheet = market.sheet;
  const research = addChild(sheet, 'a', '竞品调研', 'a1');
  sheet = research.sheet;
  const interview = addChild(sheet, 'a', '用户访谈', 'a2');
  sheet = interview.sheet;
  const product = addChild(sheet, 'root', '产品', 'b');
  sheet = product.sheet;
  sheet = setNote(sheet, 'a1', '重点看三家');
  sheet = setTodo(sheet, 'a2', false);
  return sheet;
}

function texts(sheet: ReturnType<typeof buildSheet>): string[] {
  return flatten(sheet).map((row) => row.topic.text);
}

test('Markdown：导出包含层级、标记与备注', () => {
  const sheet = buildSheet();
  const md = toMarkdown(sheet);
  assert.ok(md.startsWith('# 产品规划'));
  assert.ok(md.includes('- 市场'));
  assert.ok(md.includes('  - 竞品调研'));
  assert.ok(md.includes('[ ] 用户访谈'));
  assert.ok(md.includes('> 重点看三家'));
});

test('Markdown：导出后重新导入保留结构与文本', () => {
  const sheet = buildSheet();
  const md = toMarkdown(sheet);
  const tree = parseMarkdown(md);
  const reimported = sheetFromTree('产品规划', tree);
  assert.deepEqual(texts(reimported), texts(sheet));
  assert.equal(reimported.topics[idByText(reimported, '竞品调研')]?.note, '重点看三家');
});

test('Markdown：标题与列表混排、无序顶层自动包根', () => {
  const tree = parseMarkdown('# 一\n- 子\n## 二\n- 子二\n');
  assert.equal(tree.text, '一');
  assert.equal(tree.children?.[0]?.text, '子');
  assert.ok(tree.children?.some((c) => c.text === '二'));

  const multi = parseMarkdown('- A\n- B\n');
  assert.equal(multi.text, '导入的文档');
  assert.equal(multi.children?.length, 2);
});

test('OPML：导出后重新导入保留结构与备注', () => {
  const sheet = buildSheet();
  const xml = toOpml(sheet, '产品规划');
  assert.ok(xml.includes('<opml version="2.0">'));
  assert.ok(xml.includes('text="竞品调研"'));

  const tree = parseOpml(xml);
  const reimported = sheetFromTree('产品规划', tree);
  assert.deepEqual(texts(reimported), texts(sheet));
  assert.equal(reimported.topics[idByText(reimported, '竞品调研')]?.note, '重点看三家');
});

test('OPML：自闭合节点与实体转义', () => {
  const tree = parseOpml('<opml><body><outline text="A &amp; B"><outline text="C"/></outline></body></opml>');
  assert.equal(tree.text, 'A & B');
  assert.equal(tree.children?.[0]?.text, 'C');
  assert.ok(toOpml(createSheet('s', 'a & b')).includes('a &amp; b'));
});

test('SVG：输出包含画布、节点与转义文本', () => {
  const sheet = buildSheet();
  sheet.topics['a'] = { ...sheet.topics['a']!, text: 'A < B & C' };
  const layout = layoutSheet(sheet, new Set(), createEstimateMeasurer());
  const svg = toSvg(sheet, layout, { measure: createEstimateMeasurer() });

  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('<rect'));
  assert.ok(svg.includes('A &lt; B &amp; C'), '文本应被转义');
  assert.equal((svg.match(/<rect/g) ?? []).length >= 4, true);
  assert.ok(svg.includes('<path'), '应包含连线路径');
});

test('统计：导入后的结构与文本计数一致', () => {
  const sheet = buildSheet();
  const stats = statsOf(sheet);
  assert.equal(stats.topics, 5);
  assert.equal(stats.notes, 1);
});

test('Markdown：新增标记类型可往返', () => {
  let sheet = createSheet('s1', '根');
  const created = addChild(sheet, 'root', '灵感点', 'i1');
  sheet = created.sheet;
  sheet = setMarker(sheet, 'i1', 'idea');

  const md = toMarkdown(sheet);
  assert.ok(md.includes('✦ 灵感点'));

  const reimported = sheetFromTree('根', parseMarkdown(md));
  const row = flatten(reimported).find((item) => item.topic.text === '灵感点');
  assert.equal(row?.topic.marker, 'idea');
});
