import { AppStore, type FilterMode, type ViewMode } from './store.ts';
import { encodeWvm } from '../../packages/io/src/codec.ts';
import { CanvasRenderer } from '../../packages/render/src/renderer.ts';
import { toSvg } from '../../packages/render/src/svg.ts';
import { toMarkdown } from '../../packages/io/src/markdown.ts';
import { toOpml } from '../../packages/io/src/opml.ts';
import { searchTopics, statsOf, flatten, collectSubtrees } from '../../packages/core/src/query.ts';
import {
  addAttachment,
  addAudio,
  addBoundary,
  addChild,
  addFloatingTopic,
  addLabel,
  addRelationship,
  addSibling,
  addSummary,
  addZone,
  clearAttachments,
  clearAudio,
  clearMarkers,
  clearTopicOffsets,
  copySubtrees,
  createWorkbook,
  descendants,
  getSheet,
  insertClipboard,
  moveTopic,
  patchTask,
  removeBoundariesAt,
  removeBoundary,
  removeLabel,
  removeRelationshipsAt,
  removeSubtree,
  removeZone,
  renameBoundary,
  replaceText,
  setEquation,
  setImage,
  setLink,
  setMarker,
  setNote,
  setSheetStyle,
  setStructure,
  setTask,
  setText,
  setTodo,
  toggleMarker,
  setTopicFontSize,
  setTopicHeight,
  setTopicOffset,
  setTopicStyle,
  setTopicWidth,
  setZoneRect,
  toggleTodo,
  updateSheet,
  type TopicClip
} from '../../packages/core/src/model.ts';
import {
  activateSheet,
  addSheet,
  removeSheet,
  renameSheet
} from '../../packages/core/src/sheets.ts';
import type {
  MarkerId,
  ShapeKind,
  Sheet,
  StructureKind,
  TextAlign,
  Topic,
  TopicId,
  TopicStyle,
  Workbook
} from '../../packages/core/src/types.ts';
import { OutlineView } from './views/outline.ts';
import { GanttView } from './views/gantt.ts';
import { PitchView } from './views/pitch.ts';
import type { ViewHost } from './views/host.ts';
import { downloadBlob, downloadText, printSvg, svgToPngBlob } from './exporters.ts';
import { importFile } from './importers.ts';
import { writeXmind } from '../../packages/io/src/xmind.ts';
import { confirmDialog, promptDialog } from './ui/dialog.ts';
import { showContextMenu, type MenuEntry } from './ui/context-menu.ts';
import {
  clearBrowserDocument,
  loadBrowserDocument,
  saveBrowserDocument,
  type BrowserDocument
} from './storage.ts';
import { layoutSheet } from '../../packages/layout/src/layout.ts';
import { createEstimateMeasurer } from '../../packages/layout/src/measure.ts';

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
}

const stage = must('stage');
const staticCanvas = must<HTMLCanvasElement>('c-static');
const overlayCanvas = must<HTMLCanvasElement>('c-overlay');
const editor = must<HTMLTextAreaElement>('editor');
const boundaryEditor = must<HTMLInputElement>('boundaryEditor');
const hint = must('hint');
const toastEl = must('toast');
const fileInput = must<HTMLInputElement>('fileInput');
const structureSelect = must<HTMLSelectElement>('structure');
const sheetbar = must('sheetbar');
const searchInput = must<HTMLInputElement>('search');
const searchCount = must('searchCount');
const filterSelect = must<HTMLSelectElement>('filter');
const viewMap = must('view-map');
const viewOutline = must('view-outline');
const viewPitch = must('view-pitch');
const viewGantt = must('view-gantt');
const exportList = must('exportList');
const autosaveEl = must('autosaveState');

/* ------------------------------------------------------------------ */
/* 演示文档                                                            */
/* ------------------------------------------------------------------ */

function buildDemo(): Workbook {
  let doc = createWorkbook('织思 WeaveMind');
  const sheetId = doc.activeSheetId;
  let sheet = getSheet(doc);

  const add = (parent: string, text: string, id: string, marker?: MarkerId): string => {
    const result = addChild(sheet, parent, text, id);
    sheet = result.sheet;
    if (marker) sheet = setMarker(sheet, id, marker);
    return result.id;
  };

  add('root', '需求与调研', 'b-req', 'done');
  add('b-req', 'XMind 功能盘点', 'r-1');
  add('b-req', '会员边界与取舍', 'r-2');
  add('b-req', 'PRD 编写', 'r-3', 'done');

  add('root', '设计与架构', 'b-design', 'star');
  add('b-design', '技术选型：TS + Canvas + Tauri', 'd-1');
  add('b-design', '数据模型与 .wvm 容器', 'd-2');
  add('b-design', '交互与视觉规范', 'd-3');

  add('root', '开发实现', 'b-dev');
  add('b-dev', '内核 · 布局 · 渲染 · 存储', 'v-1', 'done');
  add('b-dev', '四视图与元素系统', 'v-2', 'done');
  add('b-dev', '拖拽与自由布局', 'v-3');

  add('root', '测试与质量', 'b-qa');
  add('b-qa', '**71 项** 单元测试', 'q-1', 'done');
  add('b-qa', '浏览器端到端回归', 'q-2');
  add('b-qa', '2000 节点性能基准', 'q-3');

  add('root', '迭代与互通', 'b-iter');
  add('b-iter', '自定义弹窗与统一 UI', 'i-1');
  add('b-iter', '查找替换 · 专注模式', 'i-2');
  add('b-iter', '.xmind 双向互通', 'i-3');

  add('root', '发布计划', 'b-release', 'wait');
  add('b-release', 'Tauri 桌面壳', 'p-1');
  add('b-release', '跨浏览器验证', 'p-2');

  sheet = setNote(sheet, 'root', '示例即本项目开发过程：从功能盘点到 71 项测试，再到发布计划。');
  sheet = setNote(sheet, 'r-2', '排除 AI 与在线协作，聚焦本地能力。');
  sheet = setNote(sheet, 'd-2', '.wvm = ZIP + MessagePack + deflate。');

  sheet = setTask(sheet, 'v-1', { progress: 100, priority: 'high', start: '2026-10-29', due: '2026-11-02' });
  sheet = setTask(sheet, 'v-3', { progress: 70, priority: 'medium', start: '2026-11-05', due: '2026-11-09' });
  sheet = setTask(sheet, 'q-2', { progress: 60, priority: 'high', start: '2026-11-08', due: '2026-11-11' });
  sheet = setTask(sheet, 'p-1', { progress: 0, priority: 'high', start: '2026-11-12', due: '2026-11-18' });

  sheet = addLabel(sheet, 'v-2', '核心');
  sheet = addLabel(sheet, 'q-1', '已完成');
  sheet = addLabel(sheet, 'p-1', '待启动');

  sheet = addBoundary(sheet, ['q-1', 'q-2', 'q-3'], '质量门禁');
  sheet = addRelationship(sheet, 'r-3', 'p-1', '需求驱动');
  sheet = setText(sheet, 'root', '织思 WeaveMind');

  doc = updateSheet(doc, sheet);
  return doc;
}

/* ------------------------------------------------------------------ */
/* 状态与渲染                                                          */
/* ------------------------------------------------------------------ */

const store = new AppStore(buildDemo());
const renderer = new CanvasRenderer(staticCanvas, overlayCanvas);

function viewTransform() {
  return { zoom: store.view.zoom, panX: store.view.panX, panY: store.view.panY };
}

let toastTimer: number | undefined;

function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  toastEl.textContent = message;
  toastEl.className = `toast show${kind === 'error' ? ' error' : ''}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.className = 'toast';
  }, 2400);
}

/* ------------------------------------------------------------------ */
/* 视图                                                                */
/* ------------------------------------------------------------------ */

const host: ViewHost = {
  sheet: () => store.sheet,
  selection: () => store.view.selection,
  query: () => store.view.query,
  select: (id) => store.setSelection([id]),
  commitText: (id, text) => {
    store.commit('修改文本', (doc) => updateSheet(doc, setText(getSheet(doc), id, text)));
  },
  addChild: (parentId) => addChildTo(parentId),
  addSibling: (id) => addSiblingTo(id),
  toggleTodo: (id) => {
    store.commit('切换待办', (doc) => updateSheet(doc, toggleTodo(getSheet(doc), id)));
  },
  toast
};

const outline = new OutlineView(viewOutline, host);
const pitch = new PitchView(viewPitch, host);
const gantt = new GanttView(viewGantt, host);

/* ------------------------------------------------------------------ */
/* 刷新                                                                */
/* ------------------------------------------------------------------ */

let lastFilterCount = 0;

function topicMatchesFilter(topic: Topic, filter: FilterMode): boolean {
  switch (filter) {
    case 'marker':
      return Boolean(topic.marker || (topic.markers?.length ?? 0) > 0);
    case 'todo':
      return topic.todo === false || (topic.task ? topic.task.progress < 100 : false);
    case 'done':
      return topic.todo === true ||
        (topic.task ? topic.task.progress >= 100 : false) ||
        topic.marker === 'done' ||
        topic.marker === 'progress8' ||
        Boolean(topic.markers?.includes('done') || topic.markers?.includes('progress8'));
    case 'overdue': {
      const task = topic.task;
      if (!task?.due || task.progress >= 100) return false;
      return task.due < new Date().toISOString().slice(0, 10);
    }
    case 'note':
      return Boolean(topic.note);
    case 'media':
      return Boolean(
        topic.image || topic.equation ||
        (topic.attachments?.length ?? 0) > 0 ||
        (topic.audio?.length ?? 0) > 0
      );
    default:
      return true;
  }
}

function filterTopicIds(sheet: Sheet, filter: FilterMode): Set<TopicId> {
  const out = new Set<TopicId>();
  for (const topic of Object.values(sheet.topics)) {
    if (topicMatchesFilter(topic, filter)) out.add(topic.id);
  }
  return out;
}

function refresh(): void {
  const mode = store.view.mode;
  viewMap.hidden = mode !== 'map';
  viewOutline.hidden = mode !== 'outline';
  viewPitch.hidden = mode !== 'pitch';
  viewGantt.hidden = mode !== 'gantt';

  const searchMatches = store.view.query
    ? new Set(searchTopics(store.sheet, store.view.query))
    : null;
  const filterMatches = store.view.filter !== 'all'
    ? filterTopicIds(store.sheet, store.view.filter)
    : null;
  lastFilterCount = filterMatches ? filterMatches.size : 0;

  let matches: Set<TopicId> | null = null;
  if (searchMatches && filterMatches) {
    matches = new Set([...searchMatches].filter((id) => filterMatches.has(id)));
  } else {
    matches = searchMatches ?? filterMatches;
  }

  renderer.update({
    sheet: store.sheet,
    collapsed: store.view.collapsed,
    view: viewTransform(),
    selection: store.view.selection,
    matches
  });

  if (mode === 'outline') outline.render();
  else if (mode === 'pitch') pitch.render();
  else if (mode === 'gantt') gantt.render();

  syncTabs();
  syncToolbar(matches ? matches.size : 0);
  syncStatus();
  syncPanel();
  syncSheetBar();
  syncEditor();
  syncBoundaryEditor();
  renderA11yTree();
}

function syncTabs(): void {
  document.querySelectorAll<HTMLElement>('#viewTabs button').forEach((button) => {
    button.classList.toggle('on', button.dataset.mode === store.view.mode);
  });
}

function syncToolbar(matchCount: number): void {
  const undo = document.getElementById('btn-undo') as HTMLButtonElement | null;
  const redo = document.getElementById('btn-redo') as HTMLButtonElement | null;
  if (undo) {
    undo.disabled = !store.canUndo;
    undo.title = store.canUndo ? `撤销：${store.undoLabel}（Ctrl+Z）` : '撤销（Ctrl+Z）';
  }
  if (redo) {
    redo.disabled = !store.canRedo;
    redo.title = store.canRedo ? `重做：${store.redoLabel}（Ctrl+Shift+Z）` : '重做（Ctrl+Shift+Z）';
  }
  const zoomLabel = document.getElementById('zoomLabel');
  if (zoomLabel) zoomLabel.textContent = `${Math.round(store.view.zoom * 100)}%`;
  if (structureSelect.value !== store.sheet.structure) structureSelect.value = store.sheet.structure;

  searchCount.textContent = store.view.query ? String(matchCount) : '';
  if (searchInput.value !== store.view.query) searchInput.value = store.view.query;
  if (filterSelect.value !== store.view.filter) filterSelect.value = store.view.filter;
  filterSelect.title = store.view.filter === 'all'
    ? '筛选主题'
    : `筛选：${lastFilterCount} 个主题`;
}

function primarySelection(): TopicId | null {
  const ids = [...store.view.selection];
  return ids.length ? ids[ids.length - 1] ?? null : null;
}

function syncStatus(): void {
  const sheet = store.sheet;
  const stats = statsOf(sheet);
  const selected = [...store.view.selection];
  const metaTopics = document.getElementById('metaTopics');
  const metaWords = document.getElementById('metaWords');
  const metaTasks = document.getElementById('metaTasks');
  const metaSelection = document.getElementById('metaSelection');
  const metaState = document.getElementById('metaState');
  const statusLeft = document.getElementById('statusLeft');

  if (metaTopics) metaTopics.textContent = String(stats.topics);
  if (metaWords) metaWords.textContent = String(stats.words);
  if (metaTasks) metaTasks.textContent = String(stats.tasks);
  if (metaSelection) {
    metaSelection.textContent = selected.length === 0
      ? '无'
      : selected.length === 1
        ? sheet.topics[selected[0]!]?.text ?? '—'
        : `${selected.length} 个`;
  }
  if (metaState) metaState.textContent = store.dirty ? '未保存' : '已保存';
  if (statusLeft) {
    const modeLabel = { map: '导图', outline: '大纲', pitch: '演说', gantt: '甘特' }[store.view.mode];
    statusLeft.textContent =
      `${sheet.title} · ${modeLabel} · ${stats.topics} 个主题` +
      (store.view.collapsed.size ? ` · 折叠 ${store.view.collapsed.size}` : '') +
      (store.view.query ? ` · 匹配 ${searchTopics(sheet, store.view.query).length}` : '') +
      (store.view.filter !== 'all' ? ` · 筛选 ${lastFilterCount}` : '');
  }
}

let noteTimer = 0;

function syncPanel(): void {
  const id = primarySelection();
  const topic = id ? store.sheet.topics[id] : null;
  const topicEmpty = must('topicEmpty');
  const topicFields = must('topicFields');
  const styleSection = must('styleSection');
  topicEmpty.hidden = Boolean(topic);
  topicFields.hidden = !topic;
  styleSection.hidden = !topic;

  const sheet = store.sheet;
  const darkToggle = must('toggle-dark');
  const rainbowToggle = must('toggle-rainbow');
  darkToggle.classList.toggle('on', sheet.style.darkCanvas);
  darkToggle.setAttribute('aria-pressed', String(sheet.style.darkCanvas));
  rainbowToggle.classList.toggle('on', sheet.style.rainbow);
  rainbowToggle.setAttribute('aria-pressed', String(sheet.style.rainbow));
  const lineWidth = must<HTMLInputElement>('line-width');
  if (Number(lineWidth.value) !== sheet.style.lineWidth) lineWidth.value = String(sheet.style.lineWidth);
  const edgeSelect = must<HTMLSelectElement>('edge-style');
  const edgeValue = sheet.style.edgeStyle ?? 'curve';
  if (edgeSelect.value !== edgeValue) edgeSelect.value = edgeValue;

  const toggleTodoBtn = must('toggle-todo');
  const toggleTaskBtn = must('toggle-task');
  const taskFields = must('taskFields');
  const labelList = must('labelList');
  const zoneList = must('zoneList');
  const boundaryList = must('boundaryList');
  const mediaInfo = must('mediaInfo');

  boundaryList.replaceChildren();
  for (const boundary of store.sheet.boundaries) {
    const chip = document.createElement('span');
    chip.className = 'label-chip deco-chip clickable';
    chip.textContent = `外框：${boundary.title}`;
    chip.title = '点击编辑外框标题';
    chip.addEventListener('click', () => beginBoundaryEdit(boundary.id));
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = '删除外框';
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      store.commit('删除外框', (doc) =>
        updateSheet(doc, removeBoundary(getSheet(doc), boundary.id))
      );
    });
    chip.appendChild(remove);
    boundaryList.appendChild(chip);
  }

  zoneList.replaceChildren();
  for (const zone of store.sheet.zones) {
    const chip = document.createElement('span');
    chip.className = 'label-chip';
    chip.textContent = zone.title;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = '删除专区';
    remove.addEventListener('click', () => {
      store.commit('删除专区', (doc) => updateSheet(doc, removeZone(getSheet(doc), zone.id)));
    });
    chip.appendChild(remove);
    zoneList.appendChild(chip);
  }

  if (!topic) {
    toggleTodoBtn.classList.remove('on');
    toggleTaskBtn.classList.remove('on');
    taskFields.hidden = true;
    labelList.replaceChildren();
    mediaInfo.textContent = '—';
    document.querySelectorAll<HTMLButtonElement>('.markers button').forEach((button) => {
      button.classList.remove('on');
    });
    return;
  }

  const noteInput = must<HTMLTextAreaElement>('noteInput');
  if (document.activeElement !== noteInput) noteInput.value = topic.note ?? '';

  const fontSizeInput = must<HTMLInputElement>('font-size');
  const defaultSize = topic.id === sheet.rootId ? 15 : 13;
  if (document.activeElement !== fontSizeInput) {
    fontSizeInput.value = String(topic.fontSize ?? defaultSize);
  }

  const style = topic.styleOverride ?? {};
  const shapeSelect = must<HTMLSelectElement>('topic-shape');
  const shapeValue = style.shape ?? '';
  if (shapeSelect.value !== shapeValue) shapeSelect.value = shapeValue;
  document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((button) => {
    const key = button.dataset.style;
    const active = key === 'bold'
      ? style.fontWeight === 700
      : Boolean(style[(key ?? '') as 'italic' | 'underline' | 'strike']);
    button.classList.toggle('on', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-align]').forEach((button) => {
    const active = (style.align ?? 'left') === button.dataset.align;
    button.classList.toggle('on', active);
    button.setAttribute('aria-pressed', String(active));
  });
  syncStyleDots('fillColors', style.fill ?? '');
  syncStyleDots('textColors', style.textColor ?? '');
  const activeMarkers = topic.markers?.length
    ? topic.markers
    : topic.marker
      ? [topic.marker]
      : [];
  document.querySelectorAll<HTMLButtonElement>('.markers button').forEach((button) => {
    const value = button.dataset.marker;
    if (!value) return;
    button.classList.toggle('on', activeMarkers.includes(value as MarkerId));
  });

  toggleTodoBtn.classList.toggle('on', Boolean(topic.todo));
  toggleTodoBtn.setAttribute('aria-pressed', String(Boolean(topic.todo)));

  labelList.replaceChildren();
  for (const label of topic.labels ?? []) {
    const chip = document.createElement('span');
    chip.className = 'label-chip';
    chip.textContent = label;
    const remove = document.createElement('button');
    remove.textContent = '×';
    remove.title = `移除标签 ${label}`;
    remove.addEventListener('click', () => {
      store.commit('移除标签', (doc) => updateSheet(doc, removeLabel(getSheet(doc), topic.id, label)));
    });
    chip.appendChild(remove);
    labelList.appendChild(chip);
  }

  const linkInput = must<HTMLInputElement>('linkInput');
  if (document.activeElement !== linkInput) {
    linkInput.value = topic.link?.type === 'web' ? topic.link.url : '';
  }

  toggleTaskBtn.classList.toggle('on', Boolean(topic.task));
  toggleTaskBtn.setAttribute('aria-pressed', String(Boolean(topic.task)));
  taskFields.hidden = !topic.task;

  if (topic.task) {
    const progress = must<HTMLInputElement>('task-progress');
    if (document.activeElement !== progress) progress.value = String(topic.task.progress);
    const priority = must<HTMLSelectElement>('task-priority');
    if (priority.value !== topic.task.priority) priority.value = topic.task.priority;
    const start = must<HTMLInputElement>('task-start');
    if (document.activeElement !== start) start.value = topic.task.start ?? '';
    const due = must<HTMLInputElement>('task-due');
    if (document.activeElement !== due) due.value = topic.task.due ?? '';
  }

  const media: string[] = [];
  if (topic.image) media.push('图片');
  if (topic.equation) media.push(`公式 ${topic.equation.latex}`);
  if (topic.attachments?.length) media.push(`附件 ${topic.attachments.length}`);
  if (topic.audio?.length) media.push(`语音 ${topic.audio.length}`);
  mediaInfo.textContent = media.length ? media.join(' · ') : '—';
}

/* ------------------------------------------------------------------ */
/* 画布栏                                                              */
/* ------------------------------------------------------------------ */

let sheetRenaming: string | null = null;

function syncSheetBar(): void {
  if (sheetRenaming && document.activeElement instanceof HTMLInputElement && sheetbar.contains(document.activeElement)) {
    return;
  }

  const frag = document.createDocumentFragment();

  for (const sheetId of store.doc.sheetOrder) {
    const sheet = store.doc.sheets[sheetId];
    if (!sheet) continue;

    if (sheetRenaming === sheetId) {
      const input = document.createElement('input');
      input.className = 'sheet-input';
      input.value = sheet.title;
      input.setAttribute('aria-label', '画布名称');
      input.style.width = `${Math.min(240, Math.max(96, renderer.measure.width(sheet.title, 12, 600) + 30))}px`;
      input.addEventListener('input', () => {
        input.style.width = `${Math.min(240, Math.max(96, renderer.measure.width(input.value || ' ', 12, 600) + 30))}px`;
      });
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.isComposing) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          commitSheetRename(input, sheetId);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          sheetRenaming = null;
          syncSheetBar();
        }
      });
      input.addEventListener('blur', () => commitSheetRename(input, sheetId));
      frag.appendChild(input);
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
      continue;
    }

    const tab = document.createElement('button');
    tab.className = `sheet-tab${sheetId === store.doc.activeSheetId ? ' on' : ''}`;
    tab.textContent = sheet.title;
    tab.title = `${sheet.title}（双击重命名）`;
    tab.addEventListener('click', () => switchSheet(sheetId));
    tab.addEventListener('dblclick', () => beginSheetRename(sheetId));
    if (store.doc.sheetOrder.length > 1) {
      const close = document.createElement('button');
      close.className = 'x';
      close.textContent = '×';
      close.title = '删除该画布';
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        deleteSheet(sheetId);
      });
      tab.appendChild(close);
    }
    frag.appendChild(tab);
  }

  const add = document.createElement('button');
  add.className = 'sheet-add';
  add.textContent = '+';
  add.title = '新建画布';
  add.addEventListener('click', () => {
    let created = '';
    store.commit('新建画布', (doc) => {
      const result = addSheet(doc);
      created = result.sheetId;
      return result.doc;
    });
    store.setView({ selection: new Set(), collapsed: new Set(), zoom: 1, panX: 0, panY: 0 });
    toast('已新建画布');
    if (created) requestAnimationFrame(() => fitToContent());
  });
  frag.appendChild(add);

  sheetbar.replaceChildren(frag);
}

function switchSheet(id: string): void {
  if (id === store.doc.activeSheetId) return;
  cancelBoundaryEdit();
  sheetRenaming = null;
  store.commit('切换画布', (doc) => activateSheet(doc, id));
  store.setView({ selection: new Set(), collapsed: new Set(), zoom: 1, panX: 0, panY: 0 });
  requestAnimationFrame(() => fitToContent());
}

function beginSheetRename(id: string): void {
  if (!store.doc.sheets[id]) return;
  sheetRenaming = id;
  syncSheetBar();
}

function commitSheetRename(input: HTMLInputElement, id: string): void {
  if (sheetRenaming !== id) return;
  const value = input.value.trim();
  const original = store.doc.sheets[id]?.title ?? '';
  sheetRenaming = null;
  if (value && value !== original) {
    store.commit('重命名画布', (doc) => renameSheet(doc, id, value));
  } else {
    syncSheetBar();
  }
}

function deleteSheet(id: string): void {
  if (store.doc.sheetOrder.length <= 1) {
    toast('文件至少保留一张画布', 'error');
    return;
  }
  void confirmDialog('删除画布', '该画布及其全部主题、元素都会被删除，此操作可撤销。', '删除', true)
    .then((ok) => {
      if (!ok) return;
      store.commit('删除画布', (doc) => removeSheet(doc, id));
      store.setView({ selection: new Set(), collapsed: new Set(), zoom: 1, panX: 0, panY: 0 });
      requestAnimationFrame(() => fitToContent());
    });
}

/* ------------------------------------------------------------------ */
/* 文本编辑                                                            */
/* ------------------------------------------------------------------ */

let committing = false;
let cancelled = false;

function editorMetrics() {
  const id = store.view.editing;
  if (!id) return null;
  const topic = store.sheet.topics[id];
  const rect = renderer.nodeScreenRect(id);
  if (!topic || !rect) return null;

  const zoom = store.view.zoom;
  const baseSize = topic.fontSize ?? (id === store.sheet.rootId ? 15 : 13);
  const weight = id === store.sheet.rootId ? 700 : 500;
  const fontSize = Math.max(11, baseSize * zoom);

  const lines = editor.value.split('\n');
  let natural = 0;
  for (const line of lines) {
    natural = Math.max(natural, renderer.measure.width(line || ' ', baseSize, weight) * zoom);
  }

  const width = Math.max(rect.w, Math.min(360 * zoom, natural + 26));
  const lineHeight = Math.round(fontSize * 1.45);
  const height = Math.max(rect.h, lines.length * lineHeight + 14);

  return {
    left: rect.x + rect.w / 2 - width / 2,
    top: rect.y + rect.h / 2 - height / 2,
    width,
    height,
    fontSize,
    lineHeight
  };
}

function syncEditor(): void {
  const id = store.view.editing;
  if (!id || store.view.mode !== 'map') {
    editor.hidden = true;
    editor.style.display = 'none';
    return;
  }

  const metrics = editorMetrics();
  if (!metrics) {
    editor.hidden = true;
    editor.style.display = 'none';
    return;
  }

  editor.hidden = false;
  editor.style.display = 'block';
  editor.style.left = `${metrics.left}px`;
  editor.style.top = `${metrics.top}px`;
  editor.style.width = `${metrics.width}px`;
  editor.style.height = `${metrics.height}px`;
  editor.style.fontSize = `${metrics.fontSize}px`;
  editor.style.lineHeight = `${metrics.lineHeight}px`;
}

function beginEdit(id: TopicId, atWorldX?: number): void {
  const topic = store.sheet.topics[id];
  if (!topic) return;
  if (boundaryEditing) cancelBoundaryEdit();
  if (store.view.mode !== 'map') store.setView({ mode: 'map' });
  store.setView({ editing: id });
  editor.value = topic.text;

  requestAnimationFrame(() => {
    editor.focus();

    let caret = editor.value.length;
    const placeholder = topic.text === '新主题';
    if (atWorldX !== undefined) {
      const box = renderer.currentLayout?.boxes.get(id);
      if (box) {
        const local = atWorldX - (box.x + 13);
        const baseSize = topic.fontSize ?? (id === store.sheet.rootId ? 15 : 13);
        const weight = id === store.sheet.rootId ? 700 : 500;
        let acc = 0;
        caret = 0;
        for (const ch of editor.value) {
          const w = renderer.measure.width(ch, baseSize, weight);
          if (acc + w > local) break;
          acc += w;
          caret += ch.length;
        }
      }
    }

    if (placeholder && atWorldX === undefined) editor.select();
    else editor.setSelectionRange(caret, caret);
    syncEditor();
  });
}

function commitEdit(): void {
  if (committing) return;
  const id = store.view.editing;
  if (!id) return;
  committing = true;
  const value = editor.value.trim();
  const original = store.sheet.topics[id]?.text ?? '';
  store.setView({ editing: null });
  if (!cancelled && value.length > 0 && value !== original) {
    store.commit('修改文本', (doc) => updateSheet(doc, setText(getSheet(doc), id, value)));
  }
  cancelled = false;
  committing = false;
}

editor.addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.isComposing) return;
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    commitEdit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelled = true;
    store.setView({ editing: null });
    cancelled = false;
  }
});
editor.addEventListener('input', () => syncEditor());
editor.addEventListener('blur', () => commitEdit());

/* ------------------------------------------------------------------ */
/* 外框标题编辑                                                        */
/* ------------------------------------------------------------------ */

let boundaryEditing: string | null = null;
let boundaryCommitGuard = false;

function boundaryEditorMetrics() {
  const id = boundaryEditing;
  if (!id) return null;
  const rect = renderer.boundaryTitleScreenRect(id);
  if (!rect) return null;
  const zoom = store.view.zoom;
  const natural = renderer.measure.width(boundaryEditor.value || ' ', 11, 600) * zoom;
  return {
    left: rect.x - 6,
    top: rect.y - 5,
    width: Math.max(90, natural + 28, rect.w + 24),
    height: Math.max(22, rect.h + 8),
    fontSize: Math.max(11, 11 * zoom)
  };
}

function syncBoundaryEditor(): void {
  const metrics = store.view.mode === 'map' ? boundaryEditorMetrics() : null;
  if (!metrics) {
    boundaryEditor.hidden = true;
    boundaryEditor.style.display = 'none';
    return;
  }
  boundaryEditor.hidden = false;
  boundaryEditor.style.display = 'block';
  boundaryEditor.style.left = `${metrics.left}px`;
  boundaryEditor.style.top = `${metrics.top}px`;
  boundaryEditor.style.width = `${metrics.width}px`;
  boundaryEditor.style.height = `${metrics.height}px`;
  boundaryEditor.style.fontSize = `${metrics.fontSize}px`;
}

function cancelBoundaryEdit(): void {
  boundaryEditing = null;
  boundaryCommitGuard = false;
  boundaryEditor.hidden = true;
  boundaryEditor.style.display = 'none';
}

function beginBoundaryEdit(id: string): void {
  const boundary = store.sheet.boundaries.find((item) => item.id === id);
  if (!boundary) return;
  if (store.view.mode !== 'map') store.setView({ mode: 'map' });
  if (store.view.editing) commitEdit();
  boundaryEditing = id;
  boundaryEditor.value = boundary.title;
  syncBoundaryEditor();
  requestAnimationFrame(() => {
    boundaryEditor.focus();
    const end = boundaryEditor.value.length;
    boundaryEditor.setSelectionRange(end, end);
    syncBoundaryEditor();
  });
}

function commitBoundaryEdit(): void {
  if (boundaryCommitGuard) return;
  const id = boundaryEditing;
  if (!id) return;
  boundaryCommitGuard = true;
  const boundary = store.sheet.boundaries.find((item) => item.id === id);
  const original = boundary?.title ?? '';
  const value = boundaryEditor.value.trim();
  boundaryEditing = null;
  boundaryEditor.hidden = true;
  boundaryEditor.style.display = 'none';
  if (boundary && value && value !== original) {
    store.commit('重命名外框', (doc) =>
      updateSheet(doc, renameBoundary(getSheet(doc), id, value))
    );
  }
  boundaryCommitGuard = false;
}

boundaryEditor.addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    commitBoundaryEdit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelBoundaryEdit();
  }
});
boundaryEditor.addEventListener('input', () => syncBoundaryEditor());
boundaryEditor.addEventListener('blur', () => commitBoundaryEdit());

/** 提交所有内联编辑，确保保存/导出拿到最新内容。 */
function flushInlineEditors(): void {
  if (store.view.editing) commitEdit();
  if (boundaryEditing) commitBoundaryEdit();
  if (sheetRenaming) {
    const input = document.querySelector<HTMLInputElement>('.sheet-input');
    if (input) commitSheetRename(input, sheetRenaming);
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.isContentEditable && active.closest('#view-outline')) {
    active.blur();
  }
}

/* ------------------------------------------------------------------ */
/* 文档操作                                                            */
/* ------------------------------------------------------------------ */

function addChildTo(parentId: TopicId): TopicId | null {
  let created: TopicId | null = null;
  store.commit('新增子主题', (doc) => {
    const sheet = getSheet(doc);
    const result = addChild(sheet, parentId, '新主题');
    created = result.id;
    return updateSheet(doc, result.sheet);
  });
  if (created) {
    store.setSelection([created]);
    if (store.view.mode === 'outline') {
      requestAnimationFrame(() => outline.focusSelected());
    } else {
      beginEdit(created);
    }
  }
  return created;
}

function addSiblingTo(target: TopicId): TopicId | null {
  const sheet = store.sheet;
  if (!sheet.topics[target]) return null;
  if (target === sheet.rootId) {
    toast('中心主题没有同级主题', 'error');
    return null;
  }
  if (!sheet.topics[target]?.parentId) {
    toast('浮动主题没有同级主题', 'error');
    return null;
  }
  let created: TopicId | null = null;
  store.commit('新增同级主题', (doc) => {
    const current = getSheet(doc);
    const result = addSibling(current, target, '新主题');
    created = result.id;
    return updateSheet(doc, result.sheet);
  });
  if (created) {
    store.setSelection([created]);
    if (store.view.mode === 'outline') {
      requestAnimationFrame(() => outline.focusSelected());
    } else {
      beginEdit(created);
    }
  }
  return created;
}

function addChildAction(): void {
  const parent = primarySelection() ?? store.sheet.rootId;
  addChildTo(parent);
}

function addSiblingAction(): void {
  const target = primarySelection();
  if (!target) { toast('请先选中一个主题'); return; }
  addSiblingTo(target);
}

function addFloatingAt(x: number, y: number): TopicId | null {
  let created: TopicId | null = null;
  store.commit('新增浮动主题', (doc) => {
    const result = addFloatingTopic(getSheet(doc), x, y);
    created = result.id;
    return updateSheet(doc, result.sheet);
  });
  if (created) {
    store.setSelection([created]);
    beginEdit(created);
  }
  return created;
}

function addFloatingAction(): void {
  const size = renderer.size();
  const center = renderer.screenToWorld(size.w / 2, size.h / 2);
  addFloatingAt(center.x + 180, center.y - 80);
}

function deleteAction(): void {
  const ids = [...store.view.selection];
  if (ids.length === 0) { toast('请先选中主题'); return; }
  const deletable = ids.filter((id) => id !== store.sheet.rootId);
  if (deletable.length === 0) { toast('中心主题不可删除', 'error'); return; }
  store.commit('删除主题', (doc) => {
    let sheet = getSheet(doc);
    for (const id of deletable) {
      if (sheet.topics[id]) sheet = removeSubtree(sheet, id);
    }
    return updateSheet(doc, sheet);
  });
  store.setSelection([]);
}

function setMarkerAction(marker: MarkerId | null): void {
  const ids = [...store.view.selection];
  if (ids.length === 0) { toast('请先选中主题'); return; }
  store.commit(marker ? '切换标记' : '清除标记', (doc) => {
    let sheet = getSheet(doc);
    for (const id of ids) {
      sheet = marker ? toggleMarker(sheet, id, marker) : clearMarkers(sheet, id);
    }
    return updateSheet(doc, sheet);
  });
}

function applyStyle(patch: Parameters<typeof setSheetStyle>[1], label: string): void {
  store.commit(label, (doc) => updateSheet(doc, setSheetStyle(getSheet(doc), patch)));
}

/* ------------------------------------------------------------------ */
/* 文件                                                                */
/* ------------------------------------------------------------------ */

function persistedView() {
  return {
    zoom: store.view.zoom,
    panX: store.view.panX,
    panY: store.view.panY,
    collapsed: [...store.view.collapsed]
  };
}

async function saveFile(): Promise<void> {
  flushInlineEditors();
  const snapshot = store.doc;
  const view = persistedView();
  setAutosaveState('正在保存…');
  try {
    const target = await saveBrowserDocument({
      fileName: store.fileName,
      doc: snapshot,
      view,
      savedAt: Date.now()
    });
    if (store.doc === snapshot) {
      store.markSaved(store.fileName);
      clearAutosave();
      const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
      setAutosaveState(
        target === 'indexeddb' ? `已保存到浏览器 ${time}` : `已保存到浏览器（兼容模式） ${time}`
      );
      toast('已保存到浏览器');
    } else {
      setAutosaveState('已保存快照，有新修改', 'warn');
      toast('已保存到浏览器（保存期间有新修改）');
    }
  } catch (error) {
    setAutosaveState('保存失败', 'warn');
    toast(`保存失败：${(error as Error).message}`, 'error');
  }
}

async function openFromFile(file: File): Promise<void> {
  try {
    const result = await importFile(file);
    store.replace(result.doc, { collapsed: new Set(result.collapsed) }, file.name);
    clearAutosave();
    setAutosaveState('自动保存已开启');
    requestAnimationFrame(() => fitToContent());
    toast(`已导入 ${file.name}（${result.format}）`);
  } catch (error) {
    toast(`打开失败：${(error as Error).message}`, 'error');
  }
}

async function newFile(): Promise<void> {
  if (store.dirty) {
    const ok = await confirmDialog('新建文档', '当前文档有未保存的修改，新建后将丢失。', '新建', true);
    if (!ok) return;
  }
  await clearBrowserDocument();
  store.replace(createWorkbook('未命名导图'));
  clearAutosave();
  setAutosaveState('自动保存已开启');
  requestAnimationFrame(() => fitToContent());
  toast('已新建空白文档');
}

/* ------------------------------------------------------------------ */
/* 导出                                                                */
/* ------------------------------------------------------------------ */

function svgOfCurrent(): string {
  const layout = renderer.currentLayout;
  const sheet = store.sheet;
  if (!layout) {
    throw new Error('画布尚未完成布局');
  }
  return toSvg(sheet, layout, { measure: renderer.measure });
}

async function exportAs(kind: string): Promise<void> {
  flushInlineEditors();
  const base = (store.doc.title || '导图').replace(/[\\/:*?"<>|]/g, '_');
  try {
    if (kind === 'wvm') {
      const bytes = await encodeWvm({ doc: store.doc, view: persistedView() });
      downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), `${base}.wvm`);
      toast('已导出 WVM 工程文件');
    } else if (kind === 'svg') {
      downloadText(svgOfCurrent(), `${base}.svg`, 'image/svg+xml;charset=utf-8');
      toast('已导出 SVG');
    } else if (kind === 'png') {
      const blob = await svgToPngBlob(svgOfCurrent(), 2);
      downloadBlob(blob, `${base}.png`);
      toast('已导出 PNG（2x）');
    } else if (kind === 'md') {
      downloadText(toMarkdown(store.sheet), `${base}.md`, 'text/markdown;charset=utf-8');
      toast('已导出 Markdown');
    } else if (kind === 'opml') {
      downloadText(toOpml(store.sheet, base), `${base}.opml`, 'text/xml;charset=utf-8');
      toast('已导出 OPML');
    } else if (kind === 'xmind') {
      const bytes = await writeXmind(store.doc);
      downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), `${base}.xmind`);
      toast('已导出 XMind 文件');
    } else if (kind === 'print') {
      printSvg(svgOfCurrent(), base);
    }
  } catch (error) {
    toast(`导出失败：${(error as Error).message}`, 'error');
  }
}

/* ------------------------------------------------------------------ */
/* 视图与缩放                                                          */
/* ------------------------------------------------------------------ */

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function zoomAt(screenX: number, screenY: number, factor: number): void {
  const zoom = clamp(store.view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  if (zoom === store.view.zoom) return;
  const world = renderer.screenToWorld(screenX, screenY);
  store.setView({
    zoom,
    panX: screenX - world.x * zoom,
    panY: screenY - world.y * zoom
  });
}

function fitToContent(): void {
  const bounds = renderer.contentBounds();
  const size = renderer.size();
  if (!bounds || size.w < 2) return;
  const zoom = clamp(Math.min((size.w - 96) / bounds.w, (size.h - 96) / bounds.h), MIN_ZOOM, 1.6);
  store.setView({
    zoom,
    panX: size.w / 2 - (bounds.x + bounds.w / 2) * zoom,
    panY: size.h / 2 - (bounds.y + bounds.h / 2) * zoom
  });
}

function setMode(mode: ViewMode): void {
  if (store.view.editing) commitEdit();
  if (mode !== 'map') cancelBoundaryEdit();
  store.setView({ mode });
  if (mode === 'outline') requestAnimationFrame(() => outline.focusSelected());
  if (mode === 'pitch') pitch.reset();
  if (mode === 'map') requestAnimationFrame(() => fitToContent());
}

/* ------------------------------------------------------------------ */
/* 指针与滚轮                                                          */
/* ------------------------------------------------------------------ */

type GestureMode = 'idle' | 'pan' | 'node' | 'zone' | 'marquee';

let gesture: GestureMode = 'idle';
let panStart = { x: 0, y: 0, panX: 0, panY: 0 };
let marquee: {
  startWorldX: number;
  startWorldY: number;
  base: Set<TopicId>;
  additive: boolean;
  moved: boolean;
} | null = null;
let nodeDrag: {
  id: TopicId;
  startX: number;
  startY: number;
  startWorldX: number;
  startWorldY: number;
  moved: boolean;
  reparent: boolean;
  single: boolean;
  base: { id: TopicId; x: number; y: number }[];
} | null = null;
let widthDrag: {
  id: string;
  startWorldX: number;
  startWidth: number;
  box: { x: number; y: number; w: number; h: number };
} | null = null;
let heightDrag: {
  id: string;
  startWorldY: number;
  startHeight: number;
  box: { x: number; y: number; w: number; h: number };
} | null = null;
let zoneDrag: {
  id: string;
  mode: 'move' | 'resize';
  startWorldX: number;
  startWorldY: number;
  rect: { x: number; y: number; w: number; h: number };
} | null = null;

function localPoint(event: PointerEvent | WheelEvent | MouseEvent) {
  const rect = stage.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function sameSelection(current: ReadonlySet<TopicId>, next: ReadonlySet<TopicId>): boolean {
  if (current.size !== next.size) return false;
  for (const id of next) if (!current.has(id)) return false;
  return true;
}

function updateMarquee(world: { x: number; y: number }): void {
  if (!marquee) return;
  const dx = world.x - marquee.startWorldX;
  const dy = world.y - marquee.startWorldY;
  if (!marquee.moved && Math.hypot(dx, dy) * store.view.zoom < 3) return;
  marquee.moved = true;
  const rect = {
    x: Math.min(marquee.startWorldX, world.x),
    y: Math.min(marquee.startWorldY, world.y),
    w: Math.abs(dx),
    h: Math.abs(dy)
  };
  const crossing = world.x < marquee.startWorldX;
  renderer.setMarquee({ ...rect, crossing });
  const hits = renderer.topicsInRect(rect, crossing);
  const next = marquee.additive
    ? new Set<TopicId>([...marquee.base, ...hits])
    : new Set<TopicId>(hits);
  if (!sameSelection(store.view.selection, next)) store.setSelection(next);
}

function previewZone(drag: NonNullable<typeof zoneDrag>, world: { x: number; y: number }) {
  const dx = world.x - drag.startWorldX;
  const dy = world.y - drag.startWorldY;
  if (drag.mode === 'move') {
    return { x: drag.rect.x + dx, y: drag.rect.y + dy, w: drag.rect.w, h: drag.rect.h };
  }
  return {
    x: drag.rect.x,
    y: drag.rect.y,
    w: Math.max(120, drag.rect.w + dx),
    h: Math.max(90, drag.rect.h + dy)
  };
}

stage.addEventListener('pointerdown', (event) => {
  if (event.target === editor || event.target === boundaryEditor) return;
  if (event.button === 2) return;
  if (store.view.editing) commitEdit();
  const point = localPoint(event);
  const world = renderer.screenToWorld(point.x, point.y);
  const hit = renderer.hitTest(world.x, world.y);
  const zoneHit = hit ? null : renderer.zoneAt(world.x, world.y);

  const heightId = renderer.heightHandleAt(world.x, world.y);
  if (heightId) {
    const box = renderer.currentLayout?.boxes.get(heightId);
    if (box) {
      heightDrag = {
        id: heightId,
        startWorldY: world.y,
        startHeight: box.h,
        box: { x: box.x, y: box.y, w: box.w, h: box.h }
      };
      gesture = 'resize';
      stage.setPointerCapture(event.pointerId);
      stage.style.cursor = 'ns-resize';
      return;
    }
  }

  const handleId = renderer.resizeHandleAt(world.x, world.y);
  if (handleId) {
    const box = renderer.currentLayout?.boxes.get(handleId);
    if (box) {
      widthDrag = {
        id: handleId,
        startWorldX: world.x,
        startWidth: box.w,
        box: { x: box.x, y: box.y, w: box.w, h: box.h }
      };
      gesture = 'resize';
      stage.setPointerCapture(event.pointerId);
      stage.style.cursor = 'ew-resize';
      return;
    }
  }

  if (event.button === 1) {
    gesture = 'pan';
    panStart = { x: point.x, y: point.y, panX: store.view.panX, panY: store.view.panY };
    stage.setPointerCapture(event.pointerId);
    stage.style.cursor = 'grabbing';
    return;
  }

  if (event.button === 0 && !hit && !zoneHit) {
    marquee = {
      startWorldX: world.x,
      startWorldY: world.y,
      base: new Set(store.view.selection),
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      moved: false
    };
    gesture = 'marquee';
    stage.setPointerCapture(event.pointerId);
    if (!marquee.additive) store.setSelection([]);
    stage.style.cursor = 'crosshair';
    return;
  }

  if (hit) {
    if (event.shiftKey) store.toggleSelection(hit);
    else store.setSelection([hit]);

    if (hit !== store.sheet.rootId) {
      const ids = event.shiftKey ? [hit] : [...store.view.selection];
      nodeDrag = {
        id: hit,
        startX: point.x,
        startY: point.y,
        startWorldX: world.x,
        startWorldY: world.y,
        moved: false,
        reparent: event.shiftKey,
        single: event.altKey,
        base: ids.map((id) => ({
          id,
          x: store.sheet.topics[id]?.offsetX ?? 0,
          y: store.sheet.topics[id]?.offsetY ?? 0
        }))
      };
      gesture = 'node';
      stage.setPointerCapture(event.pointerId);
    }
    return;
  }

  if (zoneHit) {
    const zone = renderer.currentLayout?.zones.find((item) => item.id === zoneHit.id);
    if (!zone) return;
    zoneDrag = {
      id: zone.id,
      mode: zoneHit.mode,
      startWorldX: world.x,
      startWorldY: world.y,
      rect: { x: zone.x, y: zone.y, w: zone.w, h: zone.h }
    };
    gesture = 'zone';
    stage.setPointerCapture(event.pointerId);
    stage.style.cursor = zoneHit.mode === 'resize' ? 'nwse-resize' : 'move';
  }
});

stage.addEventListener('pointermove', (event) => {
  const point = localPoint(event);
  const world = renderer.screenToWorld(point.x, point.y);

  if (gesture === 'marquee') {
    updateMarquee(world);
    return;
  }

  if (gesture === 'pan') {
    store.setView({
      panX: panStart.panX + point.x - panStart.x,
      panY: panStart.panY + point.y - panStart.y
    });
    return;
  }

  if (gesture === 'resize' && heightDrag) {
    const height = Math.max(34, Math.min(400, heightDrag.startHeight + (world.y - heightDrag.startWorldY)));
    renderer.setBoxPreview({ ...heightDrag.box, h: height });
    return;
  }

  if (gesture === 'resize' && widthDrag) {
    const width = Math.max(90, widthDrag.startWidth + (world.x - widthDrag.startWorldX));
    renderer.setBoxPreview({ ...widthDrag.box, w: width });
    return;
  }

  if (gesture === 'node' && nodeDrag) {
    if (!nodeDrag.moved) {
      const dx = point.x - nodeDrag.startX;
      const dy = point.y - nodeDrag.startY;
      if (Math.hypot(dx, dy) > 4) nodeDrag.moved = true;
    }
    if (!nodeDrag.moved) return;

    if (!nodeDrag.reparent) {
      renderer.setDrag({ fromId: nodeDrag.id, x: world.x, y: world.y, targetId: null, valid: true });
      stage.style.cursor = 'grabbing';
      return;
    }

    const target = renderer.hitTest(world.x, world.y);
    const forbidden = target === nodeDrag.id ||
      (target ? descendants(store.sheet, nodeDrag.id).includes(target) : false);
    renderer.setDrag({
      fromId: nodeDrag.id,
      x: world.x,
      y: world.y,
      targetId: target && target !== nodeDrag.id ? target : null,
      valid: Boolean(target) && !forbidden
    });
    stage.style.cursor = 'grabbing';
    return;
  }

  if (gesture === 'zone' && zoneDrag) {
    renderer.setZonePreview(previewZone(zoneDrag, world));
  }
});

function endGesture(event: PointerEvent): void {
  const point = localPoint(event);
  const world = renderer.screenToWorld(point.x, point.y);

  if (gesture === 'marquee' && marquee) {
    updateMarquee(world);
    renderer.setMarquee(null);
    marquee = null;
  }

  if (gesture === 'resize' && heightDrag) {
    const height = Math.max(34, Math.min(400, heightDrag.startHeight + (world.y - heightDrag.startWorldY)));
    const id = heightDrag.id;
    store.commit('调整主题高度', (doc) => updateSheet(doc, setTopicHeight(getSheet(doc), id, height)));
    renderer.setBoxPreview(null);
    heightDrag = null;
  }

  if (gesture === 'resize' && widthDrag) {
    const width = Math.max(90, widthDrag.startWidth + (world.x - widthDrag.startWorldX));
    const id = widthDrag.id;
    store.commit('调整节点宽度', (doc) => updateSheet(doc, setTopicWidth(getSheet(doc), id, width)));
    renderer.setBoxPreview(null);
    widthDrag = null;
  }

  if (gesture === 'node' && nodeDrag) {
    if (nodeDrag.moved) {
      if (nodeDrag.reparent) {
        const target = renderer.hitTest(world.x, world.y);
        const dragging = nodeDrag.id;
        if (target && target !== dragging && !descendants(store.sheet, dragging).includes(target)) {
          try {
            store.commit('移动主题', (doc) =>
              updateSheet(doc, moveTopic(getSheet(doc), dragging, target))
            );
            toast('已调整主题层级');
          } catch (error) {
            toast((error as Error).message, 'error');
          }
        }
      } else {
        const dx = world.x - nodeDrag.startWorldX;
        const dy = world.y - nodeDrag.startWorldY;
        if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
          const baseIds = nodeDrag.base.map((item) => item.id);
          const single = nodeDrag.single;
          store.commit('移动主题位置', (doc) => {
            let sheet = getSheet(doc);
            const targets = single ? baseIds : collectSubtrees(sheet, baseIds);
            for (const id of targets) {
              const topic = sheet.topics[id];
              if (!topic) continue;
              sheet = setTopicOffset(sheet, id, (topic.offsetX ?? 0) + dx, (topic.offsetY ?? 0) + dy);
            }
            return updateSheet(doc, sheet);
          });
        }
      }
      renderer.setDrag(null);
    }
    nodeDrag = null;
  }

  if (gesture === 'zone' && zoneDrag) {
    const rect = previewZone(zoneDrag, world);
    const id = zoneDrag.id;
    store.commit('调整专区', (doc) => updateSheet(doc, setZoneRect(getSheet(doc), id, rect)));
    renderer.setZonePreview(null);
    zoneDrag = null;
  }

  gesture = 'idle';
  stage.style.cursor = 'default';
  try { stage.releasePointerCapture(event.pointerId); } catch { /* ignore */ }
}

stage.addEventListener('pointerup', endGesture);
stage.addEventListener('pointercancel', endGesture);

stage.addEventListener('dblclick', (event) => {
  if (event.target === editor || event.target === boundaryEditor) return;
  const point = localPoint(event);
  const world = renderer.screenToWorld(point.x, point.y);
  const hit = renderer.hitTest(world.x, world.y);
  if (hit) {
    beginEdit(hit, world.x);
    return;
  }

  const boundaryId = renderer.boundaryTitleAt(world.x, world.y);
  if (boundaryId) beginBoundaryEdit(boundaryId);
});

stage.addEventListener('wheel', (event) => {
  if (event.target === editor || event.target === boundaryEditor) return;
  event.preventDefault();
  const point = localPoint(event);
  if (event.ctrlKey || event.metaKey) {
    zoomAt(point.x, point.y, Math.exp(-event.deltaY * 0.0016));
  } else {
    store.setView({
      panX: store.view.panX - event.deltaX,
      panY: store.view.panY - event.deltaY
    });
  }
}, { passive: false });

/* ------------------------------------------------------------------ */
/* 主题高度与右键菜单                                                  */
/* ------------------------------------------------------------------ */

function selectedTopicIds(): TopicId[] {
  return [...store.view.selection].filter((id) => store.sheet.topics[id]);
}

function applyTopicStyle(patch: Partial<TopicStyle>): void {
  const ids = selectedTopicIds();
  if (ids.length === 0) { toast('请先选中主题'); return; }
  store.commit('修改主题样式', (doc) => {
    let sheet = getSheet(doc);
    for (const id of ids) {
      const current = sheet.topics[id]?.styleOverride ?? {};
      const merged: Record<string, unknown> = { ...current, ...patch };
      for (const key of Object.keys(merged)) {
        if (merged[key] === undefined) delete merged[key];
      }
      sheet = setTopicStyle(
        sheet,
        id,
        Object.keys(merged).length > 0 ? (merged as TopicStyle) : null
      );
    }
    return updateSheet(doc, sheet);
  });
}

/* ---------------- 复制 / 剪切 / 粘贴 / 副本 ---------------- */

let topicClip: TopicClip | null = null;

function clipToText(clip: TopicClip): string {
  const lines: string[] = [];
  const walk = (id: TopicId, depth: number) => {
    const topic = clip.topics[id];
    if (!topic) return;
    lines.push(`${'  '.repeat(depth)}- ${topic.text.replace(/\n/g, ' ')}`);
    for (const child of topic.children) walk(child, depth + 1);
  };
  for (const root of clip.roots) walk(root, 0);
  return lines.join('\n');
}

function writeSystemClipboard(text: string): void {
  try {
    void navigator.clipboard?.writeText(text).catch(() => {});
  } catch {
    /* 系统剪贴板不可用时忽略 */
  }
}

function copySelection(): void {
  const ids = selectedTopicIds();
  if (ids.length === 0) { toast('请先选中主题'); return; }
  const clip = copySubtrees(store.sheet, ids);
  if (clip.roots.length === 0) return;
  topicClip = clip;
  writeSystemClipboard(clipToText(clip));
  toast(`已复制 ${clip.roots.length} 个主题`);
}

function cutSelection(): void {
  const clip = copySubtrees(store.sheet, selectedTopicIds());
  const roots = clip.roots.filter((id) => id !== store.sheet.rootId);
  if (roots.length === 0) { toast('中心主题不可剪切', 'error'); return; }
  topicClip = { roots, topics: clip.topics };
  writeSystemClipboard(clipToText(topicClip));
  store.commit('剪切主题', (doc) => {
    let sheet = getSheet(doc);
    for (const id of roots) {
      if (sheet.topics[id]) sheet = removeSubtree(sheet, id);
    }
    return updateSheet(doc, sheet);
  });
  store.setSelection([]);
  toast(`已剪切 ${roots.length} 个主题`);
}

function pasteClipboard(): void {
  if (!topicClip || topicClip.roots.length === 0) {
    toast('剪贴板中没有主题');
    return;
  }
  const clip = topicClip;
  const parentId = primarySelection() ?? store.sheet.rootId;
  let created: TopicId[] = [];
  store.commit('粘贴主题', (doc) => {
    const result = insertClipboard(getSheet(doc), parentId, clip);
    created = result.ids;
    return updateSheet(doc, result.sheet);
  });
  if (created.length > 0) {
    store.setSelection(created);
    toast(`已粘贴 ${created.length} 个主题`);
  }
}

function duplicateSelection(): void {
  const ids = selectedTopicIds().filter((id) => id !== store.sheet.rootId);
  if (ids.length === 0) { toast('中心主题不可创建副本', 'error'); return; }
  const clips = copySubtrees(store.sheet, ids).roots.map((root) => ({
    root,
    clip: copySubtrees(store.sheet, [root])
  }));
  let created: TopicId[] = [];
  store.commit('创建主题副本', (doc) => {
    let sheet = getSheet(doc);
    for (const entry of clips) {
      const original = sheet.topics[entry.root];
      if (!original?.parentId) continue;
      const parent = sheet.topics[original.parentId];
      if (!parent) continue;
      const index = parent.children.indexOf(entry.root);
      const result = insertClipboard(sheet, original.parentId, entry.clip, index + 1);
      sheet = result.sheet;
      created.push(...result.ids);
    }
    return updateSheet(doc, sheet);
  });
  if (created.length > 0) {
    store.setSelection(created);
    toast(`已创建 ${created.length} 个副本`);
  }
}

function bumpHeights(delta: number): void {
  const ids = selectedTopicIds();
  if (ids.length === 0) { toast('请先选中主题'); return; }
  const layout = renderer.currentLayout;
  store.commit(delta > 0 ? '增加主题高度' : '降低主题高度', (doc) => {
    let sheet = getSheet(doc);
    for (const id of ids) {
      const base = sheet.topics[id]?.height ?? layout?.boxes.get(id)?.h ?? 34;
      sheet = setTopicHeight(sheet, id, base + delta);
    }
    return updateSheet(doc, sheet);
  });
}

function uniformHeights(): void {
  const ids = selectedTopicIds();
  if (ids.length < 2) { toast('请先选中至少两个主题'); return; }
  const layout = renderer.currentLayout;
  let max = 0;
  for (const id of ids) max = Math.max(max, layout?.boxes.get(id)?.h ?? 0);
  if (max <= 0) return;
  store.commit('统一主题高度', (doc) => {
    let sheet = getSheet(doc);
    for (const id of ids) sheet = setTopicHeight(sheet, id, max);
    return updateSheet(doc, sheet);
  });
  toast(`已将 ${ids.length} 个主题统一为 ${Math.round(max)} px`);
}

function resetHeights(): void {
  const ids = selectedTopicIds();
  if (ids.length === 0) { toast('请先选中主题'); return; }
  store.commit('恢复自适应高度', (doc) => {
    let sheet = getSheet(doc);
    for (const id of ids) sheet = setTopicHeight(sheet, id, null);
    return updateSheet(doc, sheet);
  });
  toast('已恢复自适应高度');
}

stage.addEventListener('contextmenu', (event) => {
  if (event.target === editor || event.target === boundaryEditor) return;
  event.preventDefault();
  if (store.view.editing) commitEdit();

  const point = localPoint(event);
  const world = renderer.screenToWorld(point.x, point.y);
  const hit = renderer.hitTest(world.x, world.y);
  const items: MenuEntry[] = [];

  if (hit) {
    if (!store.view.selection.has(hit)) store.setSelection([hit]);
    const count = store.view.selection.size;
    const isRoot = hit === store.sheet.rootId;
    items.push(
      { label: '编辑文本', action: () => beginEdit(hit) },
      { label: '新增子主题', action: () => addChildTo(hit) }
    );
    if (!isRoot) items.push({ label: '新增同级主题', action: () => addSiblingTo(hit) });
    items.push(
      { separator: true },
      { label: '复制', action: copySelection },
      { label: '粘贴', action: pasteClipboard }
    );
    if (!isRoot) {
      items.push(
        { label: '剪切', action: cutSelection },
        { label: '创建副本', action: duplicateSelection }
      );
    }
    items.push(
      { separator: true },
      { label: '增高 20 px', action: () => bumpHeights(20) },
      { label: '降低 20 px', action: () => bumpHeights(-20) },
      { label: count > 1 ? `统一高度（${count} 个）` : '统一高度（需多选）', action: uniformHeights },
      { label: '恢复自适应高度', action: resetHeights }
    );
    if (!isRoot) {
      items.push({ separator: true }, { label: '删除主题', danger: true, action: deleteAction });
    }
  } else {
    const boundaryId = renderer.boundaryAt(world.x, world.y);
    if (boundaryId) {
      items.push(
        { label: '重命名外框', action: () => beginBoundaryEdit(boundaryId) },
        {
          label: '删除外框',
          danger: true,
          action: () => store.commit('删除外框', (doc) =>
            updateSheet(doc, removeBoundary(getSheet(doc), boundaryId)))
        }
      );
    } else {
      const zoneHit = renderer.zoneAt(world.x, world.y);
      if (zoneHit) {
        items.push({
          label: '删除专区',
          danger: true,
          action: () => store.commit('删除专区', (doc) =>
            updateSheet(doc, removeZone(getSheet(doc), zoneHit.id)))
        });
      } else {
        items.push(
          { label: '新建浮动主题', action: () => addFloatingAt(world.x, world.y) },
          { separator: true },
          { label: '适应画布', action: () => fitToContent() },
          {
            label: '恢复全部自动布局',
            action: () => {
              store.commit('恢复自动布局', (doc) =>
                updateSheet(doc, clearTopicOffsets(getSheet(doc))));
              toast('已恢复全部自动布局');
            }
          },
          { separator: true },
          { label: '折叠全部', action: () => store.setCollapsedAll(true) },
          { label: '展开全部', action: () => store.setCollapsedAll(false) }
        );
      }
    }
  }

  showContextMenu(event.clientX, event.clientY, items);
});

/* ------------------------------------------------------------------ */
/* 键盘                                                                */
/* ------------------------------------------------------------------ */

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

window.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void saveFile();
    return;
  }
  if (isTypingTarget(event.target) || store.view.editing) return;
  const targetTag = event.target instanceof HTMLElement ? event.target.tagName : '';
  if (targetTag === 'BUTTON' && (event.key === 'Enter' || event.key === ' ')) return;

  const mode = store.view.mode;
  if (mode === 'pitch') {
    if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') {
      event.preventDefault();
      pitch.next();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      pitch.prev();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setMode('map');
      return;
    }
  }

  const mod = event.ctrlKey || event.metaKey;
  const key = event.key;

  if (mod && key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) { if (!store.redo()) toast('没有可重做的操作'); }
    else if (!store.undo()) toast('没有可撤销的操作');
    return;
  }
  if (mod && key.toLowerCase() === 'y') {
    event.preventDefault();
    if (!store.redo()) toast('没有可重做的操作');
    return;
  }
  if (mod && key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); return; }
  if (mod && key.toLowerCase() === 'x') { event.preventDefault(); cutSelection(); return; }
  if (mod && key.toLowerCase() === 'v') { event.preventDefault(); pasteClipboard(); return; }
  if (mod && key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); return; }
  if (mod && key.toLowerCase() === 'o') { event.preventDefault(); fileInput.click(); return; }
  if (mod && key.toLowerCase() === 'n') { event.preventDefault(); void newFile(); return; }

  if (key === 'Tab') { event.preventDefault(); if (mode === 'map') addChildAction(); return; }
  if (key === 'Enter') { event.preventDefault(); if (mode === 'map') addSiblingAction(); return; }
  if (key === 'Delete' || key === 'Backspace') { event.preventDefault(); deleteAction(); return; }
  if (key === 'F2') {
    event.preventDefault();
    const id = primarySelection();
    if (id) beginEdit(id);
    return;
  }
  if (key === 'Escape') {
    const app = document.querySelector('.app');
    if (app?.classList.contains('zen')) {
      toggleZen(false);
      return;
    }
    store.setSelection([]);
    return;
  }
  if (key === ' ') {
    event.preventDefault();
    const id = primarySelection();
    if (id) beginEdit(id);
    return;
  }
  if (mod && (key === '=' || key === '+')) {
    event.preventDefault();
    const size = renderer.size();
    zoomAt(size.w / 2, size.h / 2, 1.2);
    return;
  }
  if (mod && key === '-') {
    event.preventDefault();
    const size = renderer.size();
    zoomAt(size.w / 2, size.h / 2, 1 / 1.2);
  }
});

/* ------------------------------------------------------------------ */
/* 工具栏                                                              */
/* ------------------------------------------------------------------ */

must('btn-new').addEventListener('click', () => void newFile());
must('btn-open').addEventListener('click', () => fileInput.click());
must('btn-save').addEventListener('click', () => void saveFile());
must('btn-undo').addEventListener('click', () => { if (!store.undo()) toast('没有可撤销的操作'); });
must('btn-redo').addEventListener('click', () => { if (!store.redo()) toast('没有可重做的操作'); });
must('btn-child').addEventListener('click', addChildAction);
must('btn-sibling').addEventListener('click', addSiblingAction);
must('btn-delete').addEventListener('click', deleteAction);
must('btn-fit').addEventListener('click', () => fitToContent());

function toggleZen(force?: boolean): void {
  const app = document.querySelector('.app');
  if (!app) return;
  const next = force ?? !app.classList.contains('zen');
  app.classList.toggle('zen', next);
  must('btn-zen').classList.toggle('on', next);
  if (next) toast('专注模式：按 Esc 退出');
  requestAnimationFrame(() => {
    const rect = stage.getBoundingClientRect();
    if (rect.width > 2 && rect.height > 2) {
      renderer.resize(rect.width, rect.height);
      if (next) fitToContent();
    }
  });
}

must('btn-zen').addEventListener('click', () => toggleZen());
must('btn-collapse').addEventListener('click', () => {
  const id = primarySelection();
  if (!id) { toast('请先选中一个主题'); return; }
  const topic = store.sheet.topics[id];
  if (!topic || topic.children.length === 0) { toast('该主题没有子主题'); return; }
  store.toggleCollapse(id);
});

document.querySelectorAll<HTMLElement>('#viewTabs button').forEach((button) => {
  button.addEventListener('click', () => setMode((button.dataset.mode as ViewMode) ?? 'map'));
});

structureSelect.addEventListener('change', () => {
  const value = structureSelect.value as StructureKind;
  store.commit('切换结构', (doc) => updateSheet(doc, setStructure(getSheet(doc), null, value)));
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void openFromFile(file);
  fileInput.value = '';
});

searchInput.addEventListener('input', () => {
  store.setView({ query: searchInput.value });
});

filterSelect.addEventListener('change', () => {
  store.setView({ filter: filterSelect.value as FilterMode });
});

must('btn-replace').addEventListener('click', () => {
  void promptDialog('查找替换', '查找内容', searchInput.value, '要查找的文字').then((find) => {
    if (!find) return;
    void promptDialog('查找替换', `将「${find}」替换为`, '', '留空表示删除').then((value) => {
      if (value === null) return;
      let count = 0;
      store.commit('查找替换', (doc) => {
        const result = replaceText(getSheet(doc), find, value);
        count = result.count;
        return updateSheet(doc, result.sheet);
      });
      toast(count > 0 ? `已替换 ${count} 个主题` : '没有找到匹配内容', count > 0 ? 'info' : 'error');
    });
  });
});

must('btn-export').addEventListener('click', (event) => {
  event.stopPropagation();
  exportList.hidden = !exportList.hidden;
});

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Node)) return;
  if (!exportList.hidden && !must('exportMenu').contains(event.target)) exportList.hidden = true;
});

exportList.querySelectorAll<HTMLElement>('[data-export]').forEach((button) => {
  button.addEventListener('click', () => {
    exportList.hidden = true;
    void exportAs(button.dataset.export ?? '');
  });
});

/* ------------------------------------------------------------------ */
/* 右侧面板                                                            */
/* ------------------------------------------------------------------ */

const PALETTES: { name: string; colors: string[] }[] = [
  { name: '钢蓝', colors: ['#2f6f9f', '#3f7d5a', '#8a5a2b', '#6b4b8a', '#b0552f', '#4a6fa5'] },
  { name: '松绿', colors: ['#2f7d63', '#4d7d3a', '#8a732b', '#3f6f8a', '#7d4a5a', '#5a6b3a'] },
  { name: '赭石', colors: ['#a9652f', '#8a5a2b', '#b08034', '#7a5b3f', '#9c4a3a', '#6b5236'] },
  { name: '紫灰', colors: ['#6b4b8a', '#4a5b8a', '#8a4a6b', '#5a6b7d', '#7a5a3f', '#4f5a6b'] },
  { name: '青瓷', colors: ['#2f7d7d', '#3f8a6a', '#5a7d8a', '#7a6b4a', '#4a6f5a', '#6a8a7a'] },
  { name: '暮山', colors: ['#5b6b8a', '#6b5b7a', '#4a5b6b', '#7a6b5b', '#5a6b5b', '#6b4b5b'] },
  { name: '琥珀', colors: ['#b07a2a', '#8a5a2b', '#c08a3a', '#9a6a2a', '#7a4a2a', '#a07030'] },
  { name: '海盐', colors: ['#3a7a9a', '#4a8a8a', '#5a7a9a', '#6a8a9a', '#2f6f8a', '#4a6a8a'] },
  { name: '森野', colors: ['#3f6b3a', '#4f7a4a', '#5a6b3a', '#6b7a4a', '#2f5b3a', '#4a6b4a'] },
  { name: '烟粉', colors: ['#9a5a6a', '#8a4a5a', '#a06a7a', '#7a4a5a', '#8a5a4a', '#6b4a5a'] }
];

let activePalette = 0;

function renderSwatches(): void {
  const hostEl = must('swatches');
  hostEl.replaceChildren();
  PALETTES.forEach((palette, index) => {
    const button = document.createElement('button');
    button.className = `swatch${index === activePalette ? ' on' : ''}`;
    button.style.background =
      `linear-gradient(135deg, ${palette.colors[0]} 0 50%, ${palette.colors[1]} 50% 100%)`;
    button.title = palette.name;
    button.addEventListener('click', () => {
      activePalette = index;
      renderSwatches();
      applyStyle({ palette: palette.colors }, `配色：${palette.name}`);
      must('paletteName').textContent = palette.name;
    });
    hostEl.appendChild(button);
  });
}

/* ---------------- 主题样式控件 ---------------- */

const FILL_COLORS = [
  '', 'transparent', '#eef4f9', '#e3edf7', '#e8f2ea', '#f7efe2', '#f3e8ee', '#ece9f6', '#f6e9e4', '#eef7f7'
];
const TEXT_COLORS = [
  '', '#1c2530', '#3d4a58', '#255a83', '#2b7a4b', '#b7791f', '#b3261e', '#6b4b8a', '#ffffff'
];

function syncStyleDots(hostId: string, value: string): void {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.querySelectorAll<HTMLButtonElement>('.style-dot').forEach((dot) => {
    dot.classList.toggle('on', (dot.dataset.color ?? '') === value);
  });
}

function setupTopicStyleControls(): void {
  const populate = (hostId: string, colors: readonly string[], field: 'fill' | 'textColor'): void => {
    const host = must(hostId);
    host.replaceChildren();
    for (const color of colors) {
      const dot = document.createElement('button');
      dot.className = 'style-dot';
      dot.dataset.color = color;
      dot.title = color === '' ? '默认' : color === 'transparent' ? '无填充' : color;
      if (color === '') {
        dot.classList.add('default');
        dot.textContent = '默';
      } else if (color === 'transparent') {
        dot.classList.add('none');
        dot.textContent = '无';
      } else {
        dot.style.background = color;
      }
      dot.addEventListener('click', () => {
        applyTopicStyle({ [field]: color === '' ? undefined : color });
      });
      host.appendChild(dot);
    }
  };

  populate('fillColors', FILL_COLORS, 'fill');
  populate('textColors', TEXT_COLORS, 'textColor');

  const shapeSelect = must<HTMLSelectElement>('topic-shape');
  shapeSelect.addEventListener('change', () => {
    const value = shapeSelect.value as ShapeKind | '';
    applyTopicStyle({ shape: value === '' ? undefined : value });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = primarySelection();
      const current = id ? store.sheet.topics[id]?.styleOverride ?? {} : {};
      const key = button.dataset.style;
      if (key === 'bold') applyTopicStyle({ fontWeight: current.fontWeight === 700 ? undefined : 700 });
      else if (key === 'italic') applyTopicStyle({ italic: !current.italic });
      else if (key === 'underline') applyTopicStyle({ underline: !current.underline });
      else if (key === 'strike') applyTopicStyle({ strike: !current.strike });
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-align]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = (button.dataset.align ?? 'left') as TextAlign;
      applyTopicStyle({ align: value === 'left' ? undefined : value });
    });
  });

  must('btn-clear-style').addEventListener('click', () => {
    const ids = selectedTopicIds();
    if (ids.length === 0) { toast('请先选中主题'); return; }
    store.commit('清除主题样式', (doc) => {
      let sheet = getSheet(doc);
      for (const id of ids) sheet = setTopicStyle(sheet, id, null);
      return updateSheet(doc, sheet);
    });
    toast('已清除主题样式');
  });
}

setupTopicStyleControls();
renderSwatches();

must('toggle-dark').addEventListener('click', () => {
  const next = !store.sheet.style.darkCanvas;
  applyStyle({ darkCanvas: next, background: next ? '#1d2530' : '#ffffff' }, next ? '深色画布' : '浅色画布');
});

must('toggle-rainbow').addEventListener('click', () => {
  const next = !store.sheet.style.rainbow;
  applyStyle({ rainbow: next }, next ? '开启彩虹分支' : '关闭彩虹分支');
});

const lineWidth = must<HTMLInputElement>('line-width');
lineWidth.addEventListener('input', () => {
  applyStyle({ lineWidth: Number(lineWidth.value) }, '调整线条粗细');
});

const edgeStyleSelect = must<HTMLSelectElement>('edge-style');
edgeStyleSelect.addEventListener('change', () => {
  const value = edgeStyleSelect.value as 'curve' | 'elbow' | 'straight';
  applyStyle({ edgeStyle: value }, '线条样式');
});

const fontSizeInput = must<HTMLInputElement>('font-size');
fontSizeInput.addEventListener('change', () => {
  const id = primarySelection();
  if (!id) { toast('请先选中主题'); return; }
  const size = Number(fontSizeInput.value);
  store.commit('调整字号', (doc) => updateSheet(doc, setTopicFontSize(getSheet(doc), id, size)));
});

must('btn-reset-layout').addEventListener('click', () => {
  const ids = selectedIds();
  store.commit('恢复自动布局', (doc) =>
    updateSheet(doc, clearTopicOffsets(getSheet(doc), ids.length > 0 ? ids : undefined))
  );
  toast(ids.length > 0 ? '已重置选中主题位置' : '已恢复全部自动布局');
});

document.querySelectorAll<HTMLButtonElement>('.markers button').forEach((button) => {
  button.addEventListener('click', () => {
    const value = button.dataset.marker ?? '';
    setMarkerAction(value ? (value as MarkerId) : null);
  });
});

must('noteInput').addEventListener('input', () => {
  const id = primarySelection();
  if (!id) return;
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => {
    const value = (must<HTMLTextAreaElement>('noteInput')).value;
    store.commit('修改笔记', (doc) => updateSheet(doc, setNote(getSheet(doc), id, value)));
  }, 480);
});

must<HTMLInputElement>('labelInput').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const id = primarySelection();
  const input = must<HTMLInputElement>('labelInput');
  const value = input.value.trim();
  if (!id || !value) return;
  store.commit('添加标签', (doc) => updateSheet(doc, addLabel(getSheet(doc), id, value)));
  input.value = '';
});

must<HTMLInputElement>('linkInput').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const id = primarySelection();
  const value = must<HTMLInputElement>('linkInput').value.trim();
  if (!id) return;
  if (!value) {
    store.commit('清除链接', (doc) => updateSheet(doc, setLink(getSheet(doc), id, null)));
    return;
  }
  if (!/^https?:\/\//i.test(value)) { toast('请输入 http:// 或 https:// 开头的链接', 'error'); return; }
  store.commit('设置链接', (doc) => updateSheet(doc, setLink(getSheet(doc), id, { type: 'web', url: value })));
});

must('btn-open-link').addEventListener('click', () => {
  const id = primarySelection();
  if (!id) return;
  const topic = store.sheet.topics[id];
  if (topic?.link?.type === 'web') {
    window.open(topic.link.url, '_blank', 'noopener');
  } else {
    toast('该主题没有网页链接');
  }
});

must('toggle-todo').addEventListener('click', () => {
  const id = primarySelection();
  if (!id) { toast('请先选中主题'); return; }
  const topic = store.sheet.topics[id];
  store.commit('切换待办', (doc) => updateSheet(doc, setTodo(getSheet(doc), id, !topic?.todo)));
});

must('toggle-task').addEventListener('click', () => {
  const id = primarySelection();
  if (!id) { toast('请先选中主题'); return; }
  const topic = store.sheet.topics[id];
  store.commit(topic?.task ? '移除任务' : '启用任务', (doc) => {
    const sheet = getSheet(doc);
    if (topic?.task) {
      const cleared = { ...sheet.topics[id]! };
      delete (cleared as { task?: unknown }).task;
      return updateSheet(doc, { ...sheet, topics: { ...sheet.topics, [id]: cleared } });
    }
    return updateSheet(doc, patchTask(sheet, id, { progress: 0 }));
  });
});

must<HTMLInputElement>('task-progress').addEventListener('change', () => {
  const id = primarySelection();
  if (!id) return;
  const value = Number(must<HTMLInputElement>('task-progress').value);
  store.commit('调整任务进度', (doc) => updateSheet(doc, patchTask(getSheet(doc), id, { progress: value })));
});

must<HTMLSelectElement>('task-priority').addEventListener('change', () => {
  const id = primarySelection();
  if (!id) return;
  const value = must<HTMLSelectElement>('task-priority').value as
    'highest' | 'high' | 'medium' | 'low' | 'lowest';
  store.commit('调整优先级', (doc) => updateSheet(doc, patchTask(getSheet(doc), id, { priority: value })));
});

for (const [inputId, field] of [['task-start', 'start'], ['task-due', 'due']] as const) {
  must<HTMLInputElement>(inputId).addEventListener('change', () => {
    const id = primarySelection();
    if (!id) return;
    const value = must<HTMLInputElement>(inputId).value || undefined;
    store.commit('调整任务日期', (doc) => updateSheet(doc, patchTask(getSheet(doc), id, { [field]: value })));
    const topic = getSheet(store.doc).topics[id];
    if (topic?.task?.start && topic.task.due && topic.task.due < topic.task.start) {
      toast('截止日期不能早于开始日期', 'error');
    }
  });
}

/* ------------------------------------------------------------------ */
/* 插入元素：外框 / 联系 / 概要 / 专区 / 图片 / 附件 / 语音 / 公式      */
/* ------------------------------------------------------------------ */

function selectedIds(): TopicId[] {
  return [...store.view.selection];
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') { resolve({ w: 0, h: 0 }); return; }
    const image = new Image();
    image.onload = () => resolve({ w: image.naturalWidth, h: image.naturalHeight });
    image.onerror = () => resolve({ w: 0, h: 0 });
    image.src = src;
  });
}

must('btn-boundary').addEventListener('click', () => {
  const ids = selectedIds().filter((id) => id !== store.sheet.rootId);
  if (ids.length === 0) { toast('请先选中主题（中心主题不可加外框）'); return; }
  store.commit('添加外框', (doc) => updateSheet(doc, addBoundary(getSheet(doc), ids, '外框')));
});

must('btn-relationship').addEventListener('click', () => {
  const ids = selectedIds();
  if (ids.length !== 2) { toast('请按住 Shift 选中两个主题'); return; }
  store.commit('添加联系', (doc) =>
    updateSheet(doc, addRelationship(getSheet(doc), ids[0]!, ids[1]!, '关联'))
  );
});

must('btn-summary').addEventListener('click', () => {
  const ids = selectedIds();
  if (ids.length < 2) { toast('请选中同一层级的多个主题'); return; }
  let created: TopicId | null = null;
  store.commit('添加概要', (doc) => {
    const result = addSummary(getSheet(doc), ids);
    created = result.id;
    return updateSheet(doc, result.sheet);
  });
  if (!created) toast('概要需要同一层级的连续主题', 'error');
  else store.setSelection([created]);
});

must('btn-floating').addEventListener('click', addFloatingAction);

must('btn-zone').addEventListener('click', () => {
  const layout = renderer.currentLayout;
  const ids = selectedIds();
  let rect = { x: -280, y: -170, w: 560, h: 340 };
  if (layout && ids.length > 0) {
    const boxes = ids
      .map((id) => layout.boxes.get(id))
      .filter((box): box is NonNullable<typeof box> => Boolean(box));
    if (boxes.length > 0) {
      const left = Math.min(...boxes.map((box) => box.x)) - 26;
      const top = Math.min(...boxes.map((box) => box.y)) - 46;
      const right = Math.max(...boxes.map((box) => box.x + box.w)) + 26;
      const bottom = Math.max(...boxes.map((box) => box.y + box.h)) + 26;
      rect = { x: left, y: top, w: right - left, h: bottom - top };
    }
  }
  store.commit('添加专区', (doc) => updateSheet(doc, addZone(getSheet(doc), rect, '专区')));
});

const imageInput = must<HTMLInputElement>('imageInput');
must('btn-image').addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', () => {
  const file = imageInput.files?.[0];
  imageInput.value = '';
  const id = primarySelection();
  if (!file || !id) return;
  if (file.size > 10 * 1024 * 1024) { toast('图片超过 10 MB，请先压缩', 'error'); return; }
  void (async () => {
    const dataUrl = await readAsDataUrl(file);
    const size = await imageSize(dataUrl);
    store.commit('插入图片', (doc) =>
      updateSheet(doc, setImage(getSheet(doc), id, { dataUrl, width: size.w, height: size.h }))
    );
    toast('已插入图片');
  })();
});

const attachInput = must<HTMLInputElement>('attachInput');
must('btn-attachment').addEventListener('click', () => attachInput.click());
attachInput.addEventListener('change', () => {
  const file = attachInput.files?.[0];
  attachInput.value = '';
  const id = primarySelection();
  if (!file || !id) return;
  if (file.size > 10 * 1024 * 1024) { toast('附件超过 10 MB，请改用较小的文件', 'error'); return; }
  void (async () => {
    const dataUrl = await readAsDataUrl(file);
    store.commit('添加附件', (doc) =>
      updateSheet(doc, addAttachment(getSheet(doc), id, {
        id: 'att' + Date.now(),
        name: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl
      }))
    );
    toast(`已附加 ${file.name}`);
  })();
});

let recorder: MediaRecorder | null = null;

must('btn-audio').addEventListener('click', () => {
  if (recorder) { recorder.stop(); return; }
  const id = primarySelection();
  if (!id) { toast('请先选中主题'); return; }
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    toast('当前环境不支持录音', 'error');
    return;
  }
  void (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      recorder = rec;
      rec.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        recorder = null;
        must('btn-audio').classList.remove('recording');
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (blob.size === 0) { toast('未录到音频', 'error'); return; }
        void (async () => {
          const dataUrl = await readAsDataUrl(new File([blob], 'note.webm', { type: blob.type }));
          store.commit('添加语音备注', (doc) =>
            updateSheet(doc, addAudio(getSheet(doc), id, {
              id: 'au' + Date.now(),
              name: '语音备注',
              durationMs: 0,
              dataUrl
            }))
          );
          toast('语音备注已附加');
        })();
      };
      rec.start();
      must('btn-audio').classList.add('recording');
      toast('录音中，再次点击结束');
    } catch {
      toast('无法访问麦克风', 'error');
    }
  })();
});

must('btn-equation').addEventListener('click', () => {
  const id = primarySelection();
  if (!id) { toast('请先选中主题'); return; }
  const current = store.sheet.topics[id]?.equation?.latex ?? '';
  void promptDialog('插入公式', 'LaTeX 公式（留空则清除）', current, '例如：E = mc^2').then((value) => {
    if (value === null) return;
    store.commit('设置公式', (doc) => updateSheet(doc, setEquation(getSheet(doc), id, value)));
  });
});

must('btn-clear-deco').addEventListener('click', () => {
  const id = primarySelection();
  if (!id) { toast('请先选中主题'); return; }
  store.commit('清除元素', (doc) => {
    let sheet = getSheet(doc);
    sheet = removeBoundariesAt(sheet, id);
    sheet = removeRelationshipsAt(sheet, id);
    sheet = setImage(sheet, id, null);
    sheet = setEquation(sheet, id, '');
    sheet = clearAttachments(sheet, id);
    sheet = clearAudio(sheet, id);
    return updateSheet(doc, sheet);
  });
  toast('已清除该主题的装饰与媒体');
});

/* ------------------------------------------------------------------ */
/* 面板页签 / 无障碍树 / 性能自检                                       */
/* ------------------------------------------------------------------ */

document.querySelectorAll<HTMLElement>('#panelTabs button').forEach((button) => {
  button.addEventListener('click', () => {
    const tab = button.dataset.tab ?? 'topic';
    document.querySelectorAll<HTMLElement>('#panelTabs button').forEach((item) => {
      const on = item === button;
      item.classList.toggle('on', on);
      item.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll<HTMLElement>('.ppanel').forEach((panel) => {
      panel.hidden = panel.dataset.panel !== tab;
    });
  });
});

let a11ySheet: unknown = null;

function renderA11yTree(): void {
  if (a11ySheet === store.sheet) return;
  a11ySheet = store.sheet;
  const hostEl = document.getElementById('a11yTree');
  if (!hostEl) return;
  const rows = flatten(store.sheet, store.view.collapsed);
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    const item = document.createElement('div');
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-level', String(row.depth + 1));
    item.dataset.id = row.id;
    item.tabIndex = -1;
    item.textContent = row.topic.text || '（空主题）';
    item.addEventListener('focus', () => store.setSelection([row.id]));
    item.addEventListener('click', () => store.setSelection([row.id]));
    frag.appendChild(item);
  }
  hostEl.replaceChildren(frag);
}

must('btn-bench').addEventListener('click', () => {
  const measure = createEstimateMeasurer();
  let sheet = createWorkbook('bench').sheets['sheet-1']!;
  let count = 1;
  for (let b = 0; b < 40 && count < 2000; b += 1) {
    const branch = addChild(sheet, 'root', `分支 ${b + 1}`, `k${b}`);
    sheet = branch.sheet;
    count += 1;
    for (let c = 0; c < 49 && count < 2000; c += 1) {
      const child = addChild(sheet, branch.id, `主题 ${b + 1}-${c + 1}`, `k${b}c${c}`);
      sheet = child.sheet;
      count += 1;
    }
  }

  const t0 = performance.now();
  const layout = layoutSheet(sheet, new Set(), measure);
  const t1 = performance.now();

  const probe = new CanvasRenderer(
    document.createElement('canvas'),
    document.createElement('canvas')
  );
  probe.resize(1200, 800);
  const t2 = performance.now();
  probe.update({
    sheet,
    collapsed: new Set(),
    view: { zoom: 1, panX: 0, panY: 0 },
    selection: new Set()
  });
  const t3 = performance.now();

  const text = `布局 ${(t1 - t0).toFixed(1)} ms · 渲染 ${(t3 - t2).toFixed(1)} ms · ${layout.boxes.size} 节点`;
  must('benchResult').textContent = text;
  toast(`性能自检：${text}`);
});

/* ------------------------------------------------------------------ */
/* 自动快照                                                            */
/* ------------------------------------------------------------------ */

const AUTOSAVE_KEY = 'weavemind.autosave.v1';
let autoTimer = 0;
let lastAutosaveAt = 0;

function setAutosaveState(text: string, kind: 'ok' | 'warn' = 'ok'): void {
  autosaveEl.textContent = text;
  autosaveEl.dataset.kind = kind;
}

function clearAutosave(): void {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
  lastAutosaveAt = 0;
}

function persistAutosave(): boolean {
  try {
    const payload = { doc: store.doc, view: persistedView(), at: Date.now() };
    const text = JSON.stringify(payload);
    if (text.length >= 3_000_000) {
      setAutosaveState('文档过大，自动保存已跳过', 'warn');
      return false;
    }
    localStorage.setItem(AUTOSAVE_KEY, text);
    lastAutosaveAt = Date.now();
    const time = new Date(lastAutosaveAt).toLocaleTimeString('zh-CN', { hour12: false });
    setAutosaveState(`已自动保存 ${time}`);
    return true;
  } catch {
    setAutosaveState('自动保存不可用', 'warn');
    return false;
  }
}

function scheduleAutosave(): void {
  window.clearTimeout(autoTimer);
  autoTimer = window.setTimeout(() => persistAutosave(), 900);
}

function maybeRestoreAutosave(newerThan = 0): void {
  let raw: string | null = null;
  try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch { return; }
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as {
      doc?: Workbook;
      view?: { zoom: number; panX: number; panY: number; collapsed: string[] };
      at?: number;
    };
    if (!parsed.doc?.sheets) return;
    const at = parsed.at ?? 0;
    if (at <= newerThan) {
      try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
      return;
    }
    const time = new Date(parsed.at ?? Date.now()).toLocaleString();
    void confirmDialog('恢复自动快照', `检测到 ${time} 的自动快照，是否恢复？`, '恢复').then((ok) => {
      if (ok) {
        store.replace(parsed.doc!, {
          collapsed: new Set(parsed.view?.collapsed ?? []),
          zoom: parsed.view?.zoom ?? 1,
          panX: parsed.view?.panX ?? 0,
          panY: parsed.view?.panY ?? 0
        });
        requestAnimationFrame(() => fitToContent());
        lastAutosaveAt = parsed.at ?? Date.now();
        setAutosaveState('已恢复自动快照');
        toast('已恢复自动快照');
      } else {
        try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
      }
    });
  } catch {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
  }
}

async function restoreBrowserDocument(): Promise<void> {
  let saved: BrowserDocument | null = null;
  try {
    saved = await loadBrowserDocument();
  } catch {
    saved = null;
  }
  if (!saved) {
    maybeRestoreAutosave();
    return;
  }
  const savedDoc = saved.doc;
  if (!savedDoc?.sheets || !savedDoc.sheets[savedDoc.activeSheetId]) {
    maybeRestoreAutosave();
    return;
  }
  store.replace(savedDoc, {
    collapsed: new Set(saved.view?.collapsed ?? []),
    zoom: saved.view?.zoom ?? 1,
    panX: saved.view?.panX ?? 0,
    panY: saved.view?.panY ?? 0
  }, saved.fileName);
  requestAnimationFrame(() => fitToContent());
  lastAutosaveAt = saved.savedAt ?? 0;
  setAutosaveState('已从浏览器恢复');
  toast('已恢复浏览器中保存的文档');
  maybeRestoreAutosave(saved.savedAt ?? 0);
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */

let didFit = false;

const observer = new ResizeObserver(() => {
  const rect = stage.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  renderer.resize(rect.width, rect.height);
  if (!didFit) {
    didFit = true;
    fitToContent();
  }
});
observer.observe(stage);

let lastAutosavedDoc = store.doc;
store.subscribe(() => {
  refresh();
  if (store.doc !== lastAutosavedDoc) {
    lastAutosavedDoc = store.doc;
    if (store.dirty) scheduleAutosave();
  }
});

setInterval(() => {
  if (store.dirty && Date.now() - lastAutosaveAt >= 5000) persistAutosave();
}, 5000);

const initialRect = stage.getBoundingClientRect();
renderer.resize(initialRect.width || 960, initialRect.height || 620);
refresh();

if (initialRect.width > 40 && initialRect.height > 40) {
  didFit = true;
  fitToContent();
}

window.addEventListener('beforeunload', (event) => {
  if (!store.dirty) return;
  persistAutosave();
  event.preventDefault();
  event.returnValue = '';
});

setAutosaveState('自动保存已开启');
setTimeout(() => hint.classList.add('fade'), 7000);

let freshStart = false;
try {
  freshStart = new URLSearchParams(window.location.search).has('fresh');
} catch {
  freshStart = false;
}
if (freshStart) {
  try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* ignore */ }
  void clearBrowserDocument();
} else {
  setTimeout(() => { void restoreBrowserDocument(); }, 400);
}

(window as unknown as { __wm: unknown }).__wm = { store, renderer, outline, pitch, gantt, setMode };
