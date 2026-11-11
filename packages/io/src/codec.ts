/**
 * `.wvm` 容器编解码。
 *
 * 容器结构（技术方案 6.1）：
 *   manifest.json     明文元信息
 *   document.msgpack  文档 + 视图态（deflate 压缩）
 */

import type { PersistedView, Workbook } from '../../core/src/types.ts';
import { decode, encode } from './msgpack.ts';
import { zipRead, zipWrite } from './zip.ts';

export const WVM_FORMAT = 'wvm';
export const WVM_FORMAT_VERSION = 1;
export const WVM_APP = 'WeaveMind/0.1.0';

export interface WvmPayload {
  readonly doc: Workbook;
  readonly view: PersistedView;
}

export interface WvmManifest {
  format: string;
  formatVersion: number;
  app: string;
  createdAt: string;
  encrypted: boolean;
  entries: string[];
}

export async function encodeWvm(payload: WvmPayload): Promise<Uint8Array> {
  const manifest: WvmManifest = {
    format: WVM_FORMAT,
    formatVersion: WVM_FORMAT_VERSION,
    app: WVM_APP,
    createdAt: new Date().toISOString(),
    encrypted: false,
    entries: ['manifest.json', 'document.msgpack']
  };

  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  const docBytes = encode({ doc: payload.doc, view: payload.view });

  return zipWrite([
    { name: 'manifest.json', data: manifestBytes, compress: false },
    { name: 'document.msgpack', data: docBytes, compress: true }
  ]);
}

export async function decodeWvm(bytes: Uint8Array): Promise<WvmPayload> {
  const entries = await zipRead(bytes);
  const byName = new Map(entries.map((e) => [e.name, e.data]));

  const manifestBytes = byName.get('manifest.json');
  if (!manifestBytes) throw new Error('wvm: manifest.json 缺失');

  let manifest: WvmManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as WvmManifest;
  } catch {
    throw new Error('wvm: manifest.json 不是合法 JSON');
  }

  if (manifest.format !== WVM_FORMAT) throw new Error('wvm: 不是受支持的文件格式');
  if (manifest.formatVersion > WVM_FORMAT_VERSION) {
    throw new Error('wvm: 文件由更新版本创建，请升级应用后打开');
  }
  if (manifest.encrypted) {
    throw new Error('wvm: 加密文件需输入密码（本期尚未启用加密容器）');
  }

  const docBytes = byName.get('document.msgpack');
  if (!docBytes) throw new Error('wvm: document.msgpack 缺失');

  const parsed = decode(docBytes) as { doc?: Workbook; view?: PersistedView };
  if (!parsed || typeof parsed !== 'object' || !parsed.doc) {
    throw new Error('wvm: 文档内容损坏');
  }

  return {
    doc: parsed.doc,
    view: parsed.view ?? { zoom: 1, panX: 0, panY: 0, collapsed: [] }
  };
}

export function byteLengthLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
