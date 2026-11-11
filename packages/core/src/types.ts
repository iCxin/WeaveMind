/**
 * 领域类型定义。
 * 只依赖 TypeScript 标准库，不引用任何 DOM / Canvas / Node API，
 * 以便在浏览器、Worker 与 Node 测试中复用（技术方案 5.1）。
 */

export type TopicId = string;
export type SheetId = string;

export type StructureKind =
  | 'mindmap'
  | 'logic-right'
  | 'logic-left'
  | 'org-down'
  | 'org-up'
  | 'tree-right'
  | 'tree-left'
  | 'fishbone-right'
  | 'fishbone-left'
  | 'timeline-right';

export type PriorityMarkerId =
  | 'prio1' | 'prio2' | 'prio3' | 'prio4' | 'prio5'
  | 'prio6' | 'prio7' | 'prio8' | 'prio9';

export type ProgressMarkerId =
  | 'progress0' | 'progress1' | 'progress2' | 'progress3' | 'progress4'
  | 'progress5' | 'progress6' | 'progress7' | 'progress8';

export type MarkerId =
  | 'flag'
  | 'star'
  | 'done'
  | 'wait'
  | 'question'
  | 'idea'
  | 'heart'
  | 'warn'
  | 'pin'
  | 'clock'
  | PriorityMarkerId
  | ProgressMarkerId;

export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest';

export type TopicKind = 'root' | 'branch' | 'sub' | 'floating' | 'summary';

export interface Task {
  readonly progress: number;
  readonly priority: Priority;
  readonly start?: string;
  readonly due?: string;
  readonly assignees?: readonly string[];
  readonly dependsOn?: readonly TopicId[];
}

export type LinkRef =
  | { readonly type: 'web'; readonly url: string }
  | { readonly type: 'topic'; readonly sheetId: string; readonly topicId: TopicId };

export type ShapeKind = 'rounded' | 'rect' | 'pill' | 'ellipse' | 'diamond' | 'hexagon';

export type TextAlign = 'left' | 'center' | 'right';

export interface Boundary {
  readonly id: string;
  readonly topicIds: readonly TopicId[];
  readonly title: string;
  readonly color?: string;
}

export interface Relationship {
  readonly id: string;
  readonly from: TopicId;
  readonly to: TopicId;
  readonly label: string;
}

export interface Zone {
  readonly id: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  readonly size: number;
  readonly dataUrl: string;
}

export interface AudioNote {
  readonly id: string;
  readonly name: string;
  readonly durationMs: number;
  readonly dataUrl: string;
}

export interface TopicImage {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export interface TopicEquation {
  readonly latex: string;
}

export interface TopicStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly textColor?: string;
  readonly shape?: ShapeKind;
  readonly fontWeight?: 400 | 600 | 700;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strike?: boolean;
  readonly align?: TextAlign;
  readonly strokeWidth?: number;
}

export interface Topic {
  readonly id: TopicId;
  readonly parentId: TopicId | null;
  readonly children: readonly TopicId[];
  readonly kind: TopicKind;
  readonly text: string;
  readonly structure?: StructureKind;
  readonly marker?: MarkerId | null;
  readonly markers?: readonly MarkerId[];
  readonly note?: string;
  readonly todo?: boolean;
  readonly labels?: readonly string[];
  readonly link?: LinkRef;
  readonly task?: Task;
  readonly styleOverride?: TopicStyle;
  /** 手动微调位置（相对自动布局坐标，世界单位） */
  readonly offsetX?: number;
  readonly offsetY?: number;
  /** 手动宽度（像素），用于容纳更多内容 */
  readonly width?: number;
  /** 手动高度（像素） */
  readonly height?: number;
  /** 字号覆盖，12–20 */
  readonly fontSize?: number;
  readonly summaryOf?: readonly TopicId[];
  readonly image?: TopicImage;
  readonly equation?: TopicEquation;
  readonly attachments?: readonly Attachment[];
  readonly audio?: readonly AudioNote[];
}

export interface SheetStyle {
  readonly background: string;
  readonly palette: readonly string[];
  readonly rainbow: boolean;
  readonly lineWidth: number;
  readonly globalFont: string;
  readonly skeletonId: string;
  readonly darkCanvas: boolean;
  readonly edgeStyle?: 'curve' | 'elbow' | 'straight';
}

export interface Sheet {
  readonly id: SheetId;
  readonly title: string;
  readonly rootId: TopicId;
  readonly topics: Readonly<Record<TopicId, Topic>>;
  readonly structure: StructureKind;
  readonly style: SheetStyle;
  readonly boundaries: readonly Boundary[];
  readonly relationships: readonly Relationship[];
  readonly zones: readonly Zone[];
}

export interface Workbook {
  readonly id: string;
  readonly schemaVersion: number;
  readonly title: string;
  readonly sheets: Readonly<Record<SheetId, Sheet>>;
  readonly sheetOrder: readonly SheetId[];
  readonly activeSheetId: SheetId;
  readonly createdAt: number;
  readonly modifiedAt: number;
}

/** 视图态：不进入文档结构，单独持久化（技术方案 5.1 第 1 条）。 */
export interface PersistedView {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly collapsed: readonly TopicId[];
}

export const SCHEMA_VERSION = 1;

export const DEFAULT_PALETTE: readonly string[] = [
  '#2f6f9f',
  '#3f7d5a',
  '#8a5a2b',
  '#6b4b8a',
  '#b0552f',
  '#4a6fa5'
];

export const STRUCTURE_LABELS: Readonly<Record<StructureKind, string>> = {
  mindmap: '思维导图',
  'logic-right': '逻辑图（向右）',
  'logic-left': '逻辑图（向左）',
  'org-down': '组织结构图（向下）',
  'org-up': '组织结构图（向上）',
  'tree-right': '树形图（向右）',
  'tree-left': '树形图（向左）',
  'fishbone-right': '鱼骨图（向右）',
  'fishbone-left': '鱼骨图（向左）',
  'timeline-right': '时间轴（水平）'
};

export const PRIORITY_LABELS: Readonly<Record<Priority, string>> = {
  highest: '最高',
  high: '高',
  medium: '中',
  low: '低',
  lowest: '最低'
};
