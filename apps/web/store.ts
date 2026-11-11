import { History } from '../../packages/core/src/history.ts';
import { getSheet } from '../../packages/core/src/model.ts';
import type { Sheet, TopicId, Workbook } from '../../packages/core/src/types.ts';

export type ViewMode = 'map' | 'outline' | 'pitch' | 'gantt';

export type FilterMode = 'all' | 'marker' | 'todo' | 'done' | 'overdue' | 'note' | 'media';

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
  collapsed: Set<TopicId>;
  selection: Set<TopicId>;
  editing: TopicId | null;
  mode: ViewMode;
  query: string;
  filter: FilterMode;
}

/**
 * 应用状态：文档（可撤销）+ 视图态（不可撤销）分离。
 * 视图变化不进入历史栈，符合 PRD 6.5。
 */
export class AppStore {
  private docValue: Workbook;
  private viewValue: ViewState;
  private readonly history: History<Workbook>;
  private readonly listeners = new Set<() => void>();
  private dirtyValue = false;
  private fileNameValue: string;

  constructor(doc: Workbook, view?: Partial<ViewState>) {
    this.docValue = doc;
    this.viewValue = {
      zoom: 1,
      panX: 0,
      panY: 0,
      collapsed: new Set(),
      selection: new Set(),
      editing: null,
      mode: 'map',
      query: '',
      filter: 'all',
      ...view
    };
    this.history = new History(doc, 100);
    this.fileNameValue = `${doc.title || '未命名导图'}.wvm`;
  }

  get doc(): Workbook {
    return this.docValue;
  }

  get view(): ViewState {
    return this.viewValue;
  }

  get sheet(): Sheet {
    return getSheet(this.docValue);
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  get undoLabel(): string | null {
    return this.history.undoLabel;
  }

  get redoLabel(): string | null {
    return this.history.redoLabel;
  }

  get dirty(): boolean {
    return this.dirtyValue;
  }

  get fileName(): string {
    return this.fileNameValue;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  commit(label: string, mutate: (doc: Workbook) => Workbook): void {
    const next = mutate(this.docValue);
    if (next === this.docValue) return;
    this.docValue = next;
    this.history.push(next, label);
    this.dirtyValue = true;
    this.pruneSelection();
    this.emit();
  }

  undo(): boolean {
    const value = this.history.undo();
    if (!value) return false;
    this.docValue = value;
    this.dirtyValue = true;
    this.pruneSelection();
    this.emit();
    return true;
  }

  redo(): boolean {
    const value = this.history.redo();
    if (!value) return false;
    this.docValue = value;
    this.dirtyValue = true;
    this.pruneSelection();
    this.emit();
    return true;
  }

  setView(patch: Partial<ViewState>): void {
    this.viewValue = { ...this.viewValue, ...patch };
    this.emit();
  }

  setSelection(ids: Iterable<TopicId>): void {
    this.viewValue = { ...this.viewValue, selection: new Set(ids) };
    this.emit();
  }

  toggleSelection(id: TopicId): void {
    const next = new Set(this.viewValue.selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.viewValue = { ...this.viewValue, selection: next };
    this.emit();
  }

  toggleCollapse(id: TopicId): void {
    const next = new Set(this.viewValue.collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.viewValue = { ...this.viewValue, collapsed: next };
    this.emit();
  }

  setCollapsedAll(collapsed: boolean): void {
    const next = new Set<TopicId>();
    if (collapsed) {
      for (const topic of Object.values(this.sheet.topics)) {
        if (topic.children.length > 0 && topic.id !== this.sheet.rootId) next.add(topic.id);
      }
    }
    this.viewValue = { ...this.viewValue, collapsed: next };
    this.emit();
  }

  replace(doc: Workbook, view: Partial<ViewState> = {}, fileName?: string): void {
    this.docValue = doc;
    this.history.reset(doc);
    this.viewValue = {
      zoom: 1,
      panX: 0,
      panY: 0,
      collapsed: new Set(view.collapsed ?? []),
      selection: new Set(),
      editing: null,
      mode: 'map',
      query: '',
      filter: 'all',
      ...view
    };
    this.dirtyValue = false;
    this.fileNameValue = fileName ?? `${doc.title || '未命名导图'}.wvm`;
    this.emit();
  }

  markSaved(fileName?: string): void {
    this.dirtyValue = false;
    if (fileName) this.fileNameValue = fileName;
    this.emit();
  }

  private pruneSelection(): void {
    const topics = this.sheet.topics;
    let changed = false;
    const next = new Set<TopicId>();
    for (const id of this.viewValue.selection) {
      if (topics[id]) next.add(id);
      else changed = true;
    }
    if (this.viewValue.editing && !topics[this.viewValue.editing]) {
      this.viewValue = { ...this.viewValue, editing: null };
      changed = true;
    }
    if (changed) this.viewValue = { ...this.viewValue, selection: next };
  }
}
