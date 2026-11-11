import type { Sheet, TopicId } from '../../../packages/core/src/types.ts';

/** 视图与宿主之间的最小契约：视图只读文档，写操作一律回调宿主。 */
export interface ViewHost {
  sheet(): Sheet;
  selection(): ReadonlySet<TopicId>;
  query(): string;
  select(id: TopicId): void;
  commitText(id: TopicId, text: string): void;
  addChild(parentId: TopicId): TopicId | null;
  addSibling(id: TopicId): TopicId | null;
  toggleTodo(id: TopicId): void;
  toast(message: string, kind?: 'info' | 'error'): void;
}
