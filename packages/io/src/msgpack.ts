/**
 * 极简 MessagePack 编解码。
 *
 * 覆盖文档模型所需的子集：nil / bool / int / float64 / str / bin / array / map。
 * 相比 JSON：体积更小、数字无需解析、二进制资产零拷贝（技术方案 4.4）。
 */

class Writer {
  private buf = new Uint8Array(4096);
  private view = new DataView(this.buf.buffer);
  private pos = 0;

  private ensure(n: number): void {
    if (this.pos + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.pos));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): void { this.ensure(1); this.view.setUint8(this.pos, v); this.pos += 1; }
  u16(v: number): void { this.ensure(2); this.view.setUint16(this.pos, v); this.pos += 2; }
  u32(v: number): void { this.ensure(4); this.view.setUint32(this.pos, v); this.pos += 4; }
  i8(v: number): void { this.ensure(1); this.view.setInt8(this.pos, v); this.pos += 1; }
  i16(v: number): void { this.ensure(2); this.view.setInt16(this.pos, v); this.pos += 2; }
  i32(v: number): void { this.ensure(4); this.view.setInt32(this.pos, v); this.pos += 4; }
  f64(v: number): void { this.ensure(8); this.view.setFloat64(this.pos, v); this.pos += 8; }

  raw(bytes: Uint8Array): void {
    this.ensure(bytes.length);
    this.buf.set(bytes, this.pos);
    this.pos += bytes.length;
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function writeString(w: Writer, s: string): void {
  const bytes = encoder.encode(s);
  const len = bytes.length;
  if (len <= 31) w.u8(0xa0 | len);
  else if (len <= 0xff) { w.u8(0xd9); w.u8(len); }
  else if (len <= 0xffff) { w.u8(0xda); w.u16(len); }
  else { w.u8(0xdb); w.u32(len); }
  w.raw(bytes);
}

function writeArray(w: Writer, arr: readonly unknown[]): void {
  const len = arr.length;
  if (len <= 15) w.u8(0x90 | len);
  else if (len <= 0xffff) { w.u8(0xdc); w.u16(len); }
  else { w.u8(0xdd); w.u32(len); }
  for (const item of arr) writeValue(w, item);
}

function writeMap(w: Writer, obj: Record<string, unknown>): void {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const len = keys.length;
  if (len <= 15) w.u8(0x80 | len);
  else if (len <= 0xffff) { w.u8(0xde); w.u16(len); }
  else { w.u8(0xdf); w.u32(len); }
  for (const key of keys) {
    writeString(w, key);
    writeValue(w, obj[key]);
  }
}

function writeValue(w: Writer, value: unknown): void {
  if (value === null || value === undefined) { w.u8(0xc0); return; }
  if (value === true) { w.u8(0xc3); return; }
  if (value === false) { w.u8(0xc2); return; }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (value >= 0 && value <= 0x7f) { w.u8(value); return; }
      if (value < 0 && value >= -32) { w.u8(0xe0 | (value + 32)); return; }
      if (value >= 0 && value <= 0xff) { w.u8(0xcc); w.u8(value); return; }
      if (value >= 0 && value <= 0xffff) { w.u8(0xcd); w.u16(value); return; }
      if (value >= 0 && value <= 0xffffffff) { w.u8(0xce); w.u32(value); return; }
      if (value >= -128 && value < 0) { w.u8(0xd0); w.i8(value); return; }
      if (value >= -32768 && value < 0) { w.u8(0xd1); w.i16(value); return; }
      if (value >= -2147483648 && value < 0) { w.u8(0xd2); w.i32(value); return; }
    }
    w.u8(0xcb);
    w.f64(value);
    return;
  }

  if (typeof value === 'string') { writeString(w, value); return; }

  if (value instanceof Uint8Array) {
    const len = value.length;
    if (len <= 0xff) { w.u8(0xc4); w.u8(len); }
    else if (len <= 0xffff) { w.u8(0xc5); w.u16(len); }
    else { w.u8(0xc6); w.u32(len); }
    w.raw(value);
    return;
  }

  if (Array.isArray(value)) { writeArray(w, value); return; }

  if (typeof value === 'object') { writeMap(w, value as Record<string, unknown>); return; }

  throw new TypeError(`msgpack: unsupported value ${String(value)}`);
}

export function encode(value: unknown): Uint8Array {
  const w = new Writer();
  writeValue(w, value);
  return w.finish();
}

class Reader {
  readonly view: DataView;
  readonly bytes: Uint8Array;
  pos = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  u8(): number { const v = this.view.getUint8(this.pos); this.pos += 1; return v; }
  u16(): number { const v = this.view.getUint16(this.pos); this.pos += 2; return v; }
  u32(): number { const v = this.view.getUint32(this.pos); this.pos += 4; return v; }
  i8(): number { const v = this.view.getInt8(this.pos); this.pos += 1; return v; }
  i16(): number { const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
  i32(): number { const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
  f64(): number { const v = this.view.getFloat64(this.pos); this.pos += 8; return v; }

  str(len: number): string {
    const s = decoder.decode(this.bytes.subarray(this.pos, this.pos + len));
    this.pos += len;
    return s;
  }

  bin(len: number): Uint8Array {
    const out = this.bytes.slice(this.pos, this.pos + len);
    this.pos += len;
    return out;
  }
}

export function decode(bytes: Uint8Array): unknown {
  const r = new Reader(bytes);
  return readValue(r);
}

function readValue(r: Reader): unknown {
  const prefix = r.u8();

  if (prefix <= 0x7f) return prefix;
  if (prefix >= 0xe0) return prefix - 0x100;
  if ((prefix & 0xf0) === 0x80) return readMap(r, prefix & 0x0f);
  if ((prefix & 0xf0) === 0x90) return readArray(r, prefix & 0x0f);
  if ((prefix & 0xe0) === 0xa0) return r.str(prefix & 0x1f);

  switch (prefix) {
    case 0xc0: return null;
    case 0xc2: return false;
    case 0xc3: return true;
    case 0xc4: return r.bin(r.u8());
    case 0xc5: return r.bin(r.u16());
    case 0xc6: return r.bin(r.u32());
    case 0xcb: return r.f64();
    case 0xcc: return r.u8();
    case 0xcd: return r.u16();
    case 0xce: return r.u32();
    case 0xd0: return r.i8();
    case 0xd1: return r.i16();
    case 0xd2: return r.i32();
    case 0xd9: return r.str(r.u8());
    case 0xda: return r.str(r.u16());
    case 0xdb: return r.str(r.u32());
    case 0xdc: return readArray(r, r.u16());
    case 0xdd: return readArray(r, r.u32());
    case 0xde: return readMap(r, r.u16());
    case 0xdf: return readMap(r, r.u32());
    default:
      throw new Error(`msgpack: unsupported prefix 0x${prefix.toString(16)}`);
  }
}

function readArray(r: Reader, len: number): unknown[] {
  const out: unknown[] = new Array(len);
  for (let i = 0; i < len; i += 1) out[i] = readValue(r);
  return out;
}

function readMap(r: Reader, len: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < len; i += 1) {
    const key = readValue(r);
    out[String(key)] = readValue(r);
  }
  return out;
}
