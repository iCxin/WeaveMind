import test from 'node:test';
import assert from 'node:assert/strict';

import { flatten } from '../../core/src/query.ts';
import { parseXmindContent, readXmind, writeXmind } from '../src/xmind.ts';
import { zipRead, zipWrite } from '../src/zip.ts';

const CONTENT = JSON.stringify([
  {
    title: '项目 A',
    rootTopic: {
      title: '项目 A',
      structureClass: 'org.xmind.ui.logic.right',
      children: {
        attached: [
          {
            title: '阶段一',
            children: {
              attached: [
                {
                  title: '调研',
                  notes: { plain: { content: '三家公司' } },
                  markers: [{ markerId: 'priority-1' }]
                },
                { title: '访谈' }
              ]
            }
          }
        ]
      }
    }
  },
  {
    title: '画布 B',
    rootTopic: { title: '画布 B', children: { attached: [] } }
  }
]);

async function buildXmind(json = CONTENT): Promise<Uint8Array> {
  return zipWrite([
    { name: 'content.json', data: new TextEncoder().encode(json), compress: true },
    { name: 'metadata.json', data: new TextEncoder().encode('{"creator":"test"}'), compress: false }
  ]);
}

test('.xmind：解析画布、结构与主题树', () => {
  const sheets = parseXmindContent(CONTENT);
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0]?.title, '项目 A');
  assert.equal(sheets[0]?.structure, 'logic-right');
  assert.equal(sheets[1]?.title, '画布 B');
  assert.equal(sheets[1]?.structure, 'mindmap');
});

test('.xmind：读取为多画布文档并保留备注与标记', async () => {
  const doc = await readXmind(await buildXmind());
  assert.equal(doc.sheetOrder.length, 2);
  assert.equal(doc.sheets[doc.sheetOrder[0]!]?.title, '项目 A');
  assert.equal(doc.activeSheetId, doc.sheetOrder[0]);

  const first = doc.sheets[doc.sheetOrder[0]!]!;
  const rows = flatten(first);
  assert.deepEqual(rows.map((row) => row.topic.text), ['项目 A', '阶段一', '调研', '访谈']);

  const research = rows.find((row) => row.topic.text === '调研');
  assert.equal(research?.topic.note, '三家公司');
  assert.equal(research?.topic.marker, 'prio1');
});

test('.xmind：结构映射到支持的结构', () => {
  const make = (structureClass: string) => JSON.stringify([
    { title: 's', rootTopic: { title: 's', structureClass, children: { attached: [] } } }
  ]);
  assert.equal(parseXmindContent(make('org.xmind.ui.map.unbalanced'))[0]?.structure, 'mindmap');
  assert.equal(parseXmindContent(make('org.xmind.ui.logic.left'))[0]?.structure, 'logic-left');
  assert.equal(parseXmindContent(make('org.xmind.ui.org-chart.down'))[0]?.structure, 'org-down');
  assert.equal(parseXmindContent(make('org.xmind.ui.org-chart.up'))[0]?.structure, 'org-up');
  assert.equal(parseXmindContent(make('org.xmind.ui.tree.left'))[0]?.structure, 'tree-left');
  assert.equal(parseXmindContent(make('org.xmind.ui.fishbone.rightHeaded'))[0]?.structure, 'fishbone-right');
  assert.equal(parseXmindContent(make('org.xmind.ui.fishbone.leftHeaded'))[0]?.structure, 'fishbone-left');
  assert.equal(parseXmindContent(make('org.xmind.ui.timeline.horizontal'))[0]?.structure, 'timeline-right');
});

test('.xmind：缺少 content.json 时给出明确错误', async () => {
  const bytes = await zipWrite([{ name: 'metadata.json', data: new TextEncoder().encode('{}') }]);
  await assert.rejects(() => readXmind(bytes), /content\.xml|暂不支持旧版/);
});

test('.xmind：非法 JSON 被拒绝', () => {
  assert.throws(() => parseXmindContent('{oops'), /不是合法 JSON/);
});

test('.xmind 导出：可被重新读取并保留结构、备注与标记', async () => {
  const original = await readXmind(await buildXmind());
  const exported = await writeXmind(original);
  const roundtrip = await readXmind(exported);

  assert.equal(roundtrip.sheetOrder.length, 2);
  const first = roundtrip.sheets[roundtrip.sheetOrder[0]!]!;
  assert.equal(first.title, '项目 A');
  assert.equal(first.structure, 'logic-right');

  const rows = flatten(first);
  assert.deepEqual(rows.map((row) => row.topic.text), ['项目 A', '阶段一', '调研', '访谈']);
  const research = rows.find((row) => row.topic.text === '调研');
  assert.equal(research?.topic.note, '三家公司');
  assert.equal(research?.topic.marker, 'prio1');
});

test('.xmind 导出：压缩包内含 content.json 与 metadata.json', async () => {
  const doc = await readXmind(await buildXmind());
  const bytes = await writeXmind(doc);
  const entries = await zipRead(bytes);
  const names = entries.map((entry) => entry.name).sort();
  assert.deepEqual(names, ['content.json', 'manifest.json', 'metadata.json']);
});
