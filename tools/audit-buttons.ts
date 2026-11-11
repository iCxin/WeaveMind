/**
 * 按钮覆盖审计：
 * 1) HTML 中每个 <button id> 是否在 main.ts 中绑定；
 * 2) main.ts 中 must('id') 是否都存在于 HTML（防拼写错误）；
 * 3) 动态生成按钮组是否都有事件委托。
 */

import fs from 'node:fs';

const html = fs.readFileSync('index.html', 'utf8');
const main = fs.readFileSync('apps/web/main.ts', 'utf8');

const buttonIds = [...html.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
const covered = buttonIds.filter((id) => main.includes(`must('${id}')`) || main.includes(`getElementById('${id}')`));
const missing = buttonIds.filter((id) => !covered.includes(id));

const mustIds = [...main.matchAll(/must(?:<[^>]+>)?\('([^']+)'\)/g)].map((m) => m[1]);
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const ghosts = [...new Set(mustIds)].filter((id) => !htmlIds.has(id));

const dynamic = [
  { name: '主题标记按钮', count: (html.match(/data-marker=/g) ?? []).length, wired: main.includes('.markers button') },
  { name: '导出菜单项', count: (html.match(/data-export=/g) ?? []).length, wired: main.includes('[data-export]') },
  { name: '视图页签', count: (html.match(/data-mode=/g) ?? []).length, wired: main.includes('#viewTabs button') },
  { name: '面板页签', count: (html.match(/data-tab=/g) ?? []).length, wired: main.includes('#panelTabs button') },
  { name: '配色色板', count: 10, wired: main.includes('addEventListener') && main.includes('renderSwatches') },
  { name: '画布标签', count: 0, wired: main.includes('syncSheetBar') }
];

const pad = (value: string | number, width: number) => String(value).padEnd(width, ' ');

console.log('== 静态按钮 ==');
console.log(`总数 ${buttonIds.length} · 已绑定 ${covered.length} · 未绑定 ${missing.length}`);
for (const id of missing) console.log(`  MISSING  ${id}`);
for (const id of covered) console.log(`  ok       ${id}`);

console.log('\n== 引用完整性 ==');
console.log(`must() 引用 ${new Set(mustIds).size} 个 · 不存在于 HTML ${ghosts.length}`);
for (const id of ghosts) console.log(`  GHOST    ${id}`);

console.log('\n== 动态按钮组 ==');
for (const group of dynamic) {
  console.log(`  ${pad(group.name, 14)} 数量 ${pad(group.count, 3)} 绑定 ${group.wired ? 'ok' : 'MISSING'}`);
}

if (missing.length > 0 || ghosts.length > 0 || dynamic.some((group) => !group.wired)) {
  process.exitCode = 1;
  console.log('\n结果：存在问题');
} else {
  console.log('\n结果：全部按钮均有绑定，引用无悬空');
}
