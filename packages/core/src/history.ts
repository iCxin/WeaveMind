/**
 * 快照式撤销栈。
 *
 * 命令本身是纯函数 `(doc) => doc`；由于模型采用结构共享，快照只是根对象指针，
 * 因此“快照撤销”在内存上等价于“逆命令”，实现却简单得多（技术方案 5.2）。
 */

export interface HistoryEntry<T> {
  readonly value: T;
  readonly label: string;
}

export class History<T> {
  private entries: HistoryEntry<T>[];
  private index = 0;
  private readonly limit: number;

  constructor(initial: T, limit = 100) {
    this.entries = [{ value: initial, label: '初始状态' }];
    this.limit = Math.max(1, limit);
  }

  get current(): T {
    return this.entries[this.index]!.value;
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.entries.length - 1;
  }

  get size(): number {
    return this.entries.length;
  }

  get position(): number {
    return this.index;
  }

  get undoLabel(): string | null {
    return this.canUndo ? this.entries[this.index]!.label : null;
  }

  get redoLabel(): string | null {
    return this.canRedo ? this.entries[this.index + 1]!.label : null;
  }

  push(value: T, label: string): void {
    if (value === this.current) return;
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push({ value, label });
    if (this.entries.length > this.limit) {
      this.entries = this.entries.slice(this.entries.length - this.limit);
    }
    this.index = this.entries.length - 1;
  }

  undo(): T | null {
    if (!this.canUndo) return null;
    this.index -= 1;
    return this.entries[this.index]!.value;
  }

  redo(): T | null {
    if (!this.canRedo) return null;
    this.index += 1;
    return this.entries[this.index]!.value;
  }

  reset(value: T, label = '初始状态'): void {
    this.entries = [{ value, label }];
    this.index = 0;
  }
}
