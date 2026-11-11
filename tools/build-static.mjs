/**
 * 静态构建：将 TypeScript 源码剥离类型后输出到 dist/。
 *
 * 构建产物用于 EdgeOne Pages 等静态托管：
 *   npm run build → dist/
 *
 * 不引入第三方依赖，直接使用 Node 内置的 stripTypeScriptTypes。
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = resolve(process.cwd());
const OUT = join(ROOT, 'dist');
const SKIP = new Set(['node_modules', 'dist', '.git', '.github', '.trae', 'desktop', 'docs']);
const COPY_ROOTS = ['apps', 'packages', 'assets'];

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

async function emit(rel, content) {
  const target = join(OUT, rel);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

function rewriteSpecifiers(js) {
  return js
    .replace(/(\bfrom\s*['"])([^'"]+)\.ts(['"])/g, '$1$2.js$3')
    .replace(/(\bimport\s*\(\s*['"])([^'"]+)\.ts(['"]\s*\))/g, '$1$2.js$3')
    .replace(/(\bimport\s*['"])([^'"]+)\.ts(['"])/g, '$1$2.js$3');
}

async function build() {
  // 清理上次构建，避免残留文件
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const files = [];
  for (const dir of COPY_ROOTS) {
    try {
      await walk(join(ROOT, dir), files);
    } catch {
      /* 目录不存在时跳过 */
    }
  }

  let scripts = 0;
  let assets = 0;
  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    if (extname(file) === '.ts') {
      const source = await readFile(file, 'utf8');
      const js = rewriteSpecifiers(
        stripTypeScriptTypes(source, { mode: 'strip', sourceUrl: rel })
      );
      await emit(rel.replace(/\.ts$/, '.js'), js);
      scripts += 1;
    } else {
      await emit(rel, await readFile(file));
      assets += 1;
    }
  }

  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  await emit('index.html', html.replace('/apps/web/main.ts', '/apps/web/main.js'));

  console.log(`WeaveMind 静态构建完成 → dist/（${scripts} 个脚本，${assets} 个资源）`);
}

build().catch((error) => {
  console.error('构建失败：', error);
  process.exitCode = 1;
});
