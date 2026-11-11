import test from 'node:test';
import assert from 'node:assert/strict';

import { addChild, createWorkbook, setText } from '../../core/src/model.ts';
import { decode, encode } from '../src/msgpack.ts';
import { zipRead, zipWrite } from '../src/zip.ts';
import { decodeWvm, encodeWvm } from '../src/codec.ts';

test('msgpack：基础类型往返', () => {
  const source = {
    nil: null,
    yes: true,
    no: false,
    small: 42,
    negative: -17,
    big: 70000,
    float: 3.5,
    text: '思维导图 WeaveMind',
    list: [1, 'two', false, null],
    nested: { a: { b: [1, 2, 3] } }
  };
  const round = decode(encode(source));
  assert.deepEqual(round, source);
});

test('msgpack：二进制与长字符串', () => {
  const bin = new Uint8Array([0, 1, 2, 250, 255]);
  const long = 'x'.repeat(70000);
  const round = decode(encode({ bin, long })) as { bin: Uint8Array; long: string };
  assert.deepEqual([...round.bin], [...bin]);
  assert.equal(round.long.length, long.length);
});

test('zip：多条目往返并保持内容', async () => {
  const a = new TextEncoder().encode('hello weavemind');
  const b = new Uint8Array(2000).map((_, i) => i % 251);
  const bytes = await zipWrite([
    { name: 'a.txt', data: a, compress: false },
    { name: 'b.bin', data: b, compress: true }
  ]);
  const entries = await zipRead(bytes);
  const map = new Map(entries.map((e) => [e.name, e.data]));
  assert.equal(new TextDecoder().decode(map.get('a.txt')), 'hello weavemind');
  assert.deepEqual([...map.get('b.bin')!], [...b]);
});

test('zip：损坏输入被拒绝', async () => {
  await assert.rejects(() => zipRead(new Uint8Array(20)));
});

test('.wvm：文档与视图态往返', async () => {
  let doc = createWorkbook('往返测试');
  const sheetId = doc.activeSheetId;
  const sheet = doc.sheets[sheetId]!;

  const added = addChild(sheet, 'root', '第一分支', 'b1');
  const child = addChild(added.sheet, 'b1', '子主题', 'b1-1');
  doc = {
    ...doc,
    sheets: { ...doc.sheets, [sheetId]: setText(child.sheet, 'root', '中心主题') }
  };

  const bytes = await encodeWvm({
    doc,
    view: { zoom: 1.25, panX: 40, panY: -12, collapsed: ['b1'] }
  });

  const parsed = await decodeWvm(bytes);
  assert.equal(parsed.doc.title, '往返测试');
  assert.equal(Object.keys(parsed.doc.sheets[sheetId]!.topics).length, 3);
  assert.equal(parsed.doc.sheets[sheetId]!.topics['b1']!.text, '第一分支');
  assert.equal(parsed.view.zoom, 1.25);
  assert.deepEqual(parsed.view.collapsed, ['b1']);
});

test('.wvm：manifest 校验与失败路径', async () => {
  const foreign = {
    format: 'other',
    formatVersion: 1,
    app: 'x',
    createdAt: '',
    encrypted: false,
    entries: []
  };
  const wrongFormat = await zipWrite([
    {
      name: 'manifest.json',
      data: new TextEncoder().encode(JSON.stringify(foreign)),
      compress: false
    }
  ]);
  await assert.rejects(() => decodeWvm(wrongFormat), /不是受支持的文件格式/);

  const newer = await zipWrite([
    {
      name: 'manifest.json',
      data: new TextEncoder().encode(JSON.stringify({ ...foreign, format: 'wvm', formatVersion: 99 })),
      compress: false
    }
  ]);
  await assert.rejects(() => decodeWvm(newer), /更新版本/);

  const encrypted = await zipWrite([
    {
      name: 'manifest.json',
      data: new TextEncoder().encode(JSON.stringify({ ...foreign, format: 'wvm', encrypted: true })),
      compress: false
    }
  ]);
  await assert.rejects(() => decodeWvm(encrypted), /密码/);

  const empty = await zipWrite([{ name: 'readme.txt', data: new Uint8Array([1, 2, 3]) }]);
  await assert.rejects(() => decodeWvm(empty), /manifest\.json 缺失/);
});
