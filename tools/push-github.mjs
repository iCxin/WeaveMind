/**
 * 通过 GitHub Git Data API 上传当前工作区。
 *
 * 适用场景：本机到 github.com 的 443 端口不可达，但 api.github.com 可用。
 * 凭据从 `git credential fill` 读取，不写入仓库；也可用 GH_TOKEN 环境变量兜底。
 *
 * 用法：
 *   npm run push:github
 *   node tools/push-github.mjs "feat: 更新功能"
 */

import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const API = 'https://api.github.com';
const ROOT = process.cwd();
const SKIP_DIRS = new Set(['.git', 'dist', 'node_modules', '.trae', 'desktop', 'docs']);
const SKIP_FILES = new Set(['.DS_Store']);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function credentials() {
  try {
    const raw = execFileSync('git', ['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const pairs = new Map(
      raw
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        })
    );
    const username = pairs.get('username');
    const password = pairs.get('password');
    if (username && password) return { username, password };
  } catch {
    /* 继续尝试环境变量 */
  }
  if (process.env.GH_TOKEN) return { username: 'x-access-token', password: process.env.GH_TOKEN };
  throw new Error('未找到 GitHub 凭据：请先配置 git credential 或 GH_TOKEN');
}

function remoteRepo() {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/);
    if (match) return { owner: match[1], repo: match[2] };
  } catch {
    /* 使用默认仓库 */
  }
  return { owner: 'iCxin', repo: 'weavemind' };
}

function skipped(name) {
  return SKIP_FILES.has(name) || name === '.env' || name.startsWith('.env.') ||
    name.endsWith('.wvm') || name.endsWith('.log');
}

async function collect(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collect(join(dir, entry.name), out);
    } else if (!skipped(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

async function main() {
  const { username, password } = credentials();
  const { owner, repo } = remoteRepo();
  const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

  const request = async (path, init = {}) => {
    const headers = {
      Authorization: auth,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'weavemind-upload'
    };
    if (init.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${API}${path}`, { ...init, headers });
    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }
    return response.json();
  };

  const repoInfo = await request(`/repos/${owner}/${repo}`);
  const branch = repoInfo.default_branch || 'main';

  let parent = null;
  try {
    const ref = await request(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    parent = ref.object.sha;
  } catch (error) {
    if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 409)) throw error;
    // 空仓库无法创建 blob：先用 Contents API 写入一个初始 README
    const readme = await readFile(join(ROOT, 'README.md'));
    await request(`/repos/${owner}/${repo}/contents/README.md`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'chore: initialize repository',
        content: readme.toString('base64')
      })
    });
    const ref = await request(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    parent = ref.object.sha;
  }

  const files = await collect(ROOT);
  console.log(`准备上传 ${files.length} 个文件到 ${owner}/${repo}（${branch}）...`);

  const tree = [];
  for (const file of files) {
    const path = relative(ROOT, file).replace(/\\/g, '/');
    const content = await readFile(file);
    const blob = await request(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' })
    });
    tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  const treeResult = await request(`/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree })
  });

  const message = process.argv[2] || 'chore: update WeaveMind';
  const commit = await request(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: treeResult.sha,
      parents: parent ? [parent] : []
    })
  });

  if (parent) {
    await request(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: true })
    });
  } else {
    await request(`/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha })
    });
  }

  console.log(`已上传：https://github.com/${owner}/${repo}/commit/${commit.sha}`);
  console.log(`仓库地址：https://github.com/${owner}/${repo}`);
}

main().catch((error) => {
  console.error('上传失败：', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
