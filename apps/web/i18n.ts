/**
 * 轻量多语言层（零依赖）。
 *
 * 设计：以简体中文原文为 key，英文词典做映射；`t()` 同时支持 `{name}` 占位符。
 * 静态界面在启动时通过 `localizeStatic()` 快照原文并应用翻译，切换语言时再次应用即可回退。
 */

export type Locale = 'zh-CN' | 'en';

const STORAGE_KEY = 'weavemind.locale';

const EN: Readonly<Record<string, string>> = {
  /* ---------------- 工具栏 ---------------- */
  '新建': 'New',
  '打开': 'Open',
  '保存': 'Save',
  '撤销': 'Undo',
  '重做': 'Redo',
  '子主题': 'Subtopic',
  '同级': 'Sibling',
  '删除': 'Delete',
  '导图': 'Map',
  '大纲': 'Outline',
  '演说': 'Pitch',
  '甘特': 'Gantt',
  '替换': 'Replace',
  '导出 ▾': 'Export ▾',
  '适应': 'Fit',
  '专注': 'Zen',
  '面板': 'Panel',
  '全部主题': 'All topics',
  '有标记': 'Marked',
  '未完成': 'Incomplete',
  '已完成': 'Done',
  '已逾期': 'Overdue',
  '有备注': 'With notes',
  '有附件/图片': 'With media',
  'WVM 工程文件': 'WVM project',
  'PNG 图片': 'PNG image',
  'SVG 矢量': 'SVG vector',
  'XMind 文件': 'XMind file',
  '打印 / PDF': 'Print / PDF',
  '简体中文': 'Chinese (Simplified)',
  '新建 Ctrl+N': 'New (Ctrl+N)',
  '打开 Ctrl+O': 'Open (Ctrl+O)',
  '保存到浏览器 Ctrl+S': 'Save to browser (Ctrl+S)',
  '撤销 Ctrl+Z': 'Undo (Ctrl+Z)',
  '重做 Ctrl+Shift+Z': 'Redo (Ctrl+Shift+Z)',
  '子主题 Tab': 'Subtopic (Tab)',
  '同级主题 Enter': 'Sibling topic (Enter)',
  '删除 Delete': 'Delete (Delete)',
  '查找替换': 'Find and replace',
  '筛选主题': 'Filter topics',
  '筛选': 'Filter',
  '更多': 'More',
  '名称颜色': 'Name color',
  '重命名画布': 'Rename canvas',
  '新建画布': 'New canvas',
  '全选': 'Select all',
  '结构': 'Structure',
  '导出': 'Export',
  '适应画布': 'Fit to canvas',
  '专注模式': 'Zen mode',
  '专注模式（Esc 退出）': 'Zen mode (Esc to exit)',
  '退出专注': 'Exit zen',
  '退出专注模式': 'Exit zen mode',
  '退出专注模式（Esc）': 'Exit zen mode (Esc)',
  '专注模式：按 Esc 或点击右上角按钮退出':
    'Zen mode: press Esc or click the top-right button to exit',
  '属性面板': 'Properties panel',
  '语言 / Language': 'Language',
  '视图切换': 'Switch view',
  '思维导图画布': 'Mind map canvas',
  '编辑主题文本': 'Edit topic text',
  '编辑外框标题': 'Edit boundary title',
  '查找主题 / 备注 / 标签': 'Search topics, notes, labels',
  '拖动主题移动整枝 · 空白拖拽框选（右→左交叉） · 中键/滚轮平移 · 双击节点或外框标题编辑':
    'Drag a topic to move its branch · Drag empty space to marquee (right→left crosses) · Middle-drag/wheel to pan · Double-click a node or boundary title to edit',

  /* ---------------- 结构 ---------------- */
  '选择结构': 'Choose structure',
  '思维导图': 'Mind map',
  '逻辑图（向右）': 'Logic diagram (right)',
  '逻辑图（向左）': 'Logic diagram (left)',
  '组织结构图（向下）': 'Org chart (down)',
  '组织结构图（向上）': 'Org chart (up)',
  '树形图（向右）': 'Tree (right)',
  '树形图（向左）': 'Tree (left)',
  '鱼骨图（向右）': 'Fishbone (right)',
  '鱼骨图（向左）': 'Fishbone (left)',
  '时间轴（水平）': 'Timeline (horizontal)',
  '逻辑 →': 'Logic →',
  '逻辑 ←': 'Logic ←',
  '组织 ↓': 'Org ↓',
  '组织 ↑': 'Org ↑',
  '树形 →': 'Tree →',
  '树形 ←': 'Tree ←',
  '鱼骨 →': 'Fishbone →',
  '鱼骨 ←': 'Fishbone ←',
  '时间轴': 'Timeline',
  '结构：{name}': 'Structure: {name}',

  /* ---------------- 属性面板 ---------------- */
  '主题': 'Topic',
  '元素': 'Elements',
  '画布': 'Canvas',
  '选中一个主题以编辑属性': 'Select a topic to edit its properties',
  '笔记': 'Notes',
  '补充说明，支持多行': 'Add details; multiple lines supported',
  '待办': 'To-do',
  '标签': 'Labels',
  '输入后回车添加': 'Type and press Enter to add',
  '链接': 'Link',
  '打开链接': 'Open link',
  '主题样式': 'Topic style',
  '形状': 'Shape',
  '默认': 'Default',
  '圆角': 'Rounded',
  '矩形': 'Rectangle',
  '胶囊': 'Pill',
  '椭圆': 'Ellipse',
  '菱形': 'Diamond',
  '六边形': 'Hexagon',
  '字体': 'Font',
  '加粗': 'Bold',
  '斜体': 'Italic',
  '下划线': 'Underline',
  '删除线': 'Strikethrough',
  '对齐': 'Align',
  '左': 'Left',
  '中': 'Center',
  '右': 'Right',
  '左对齐': 'Align left',
  '居中': 'Center',
  '右对齐': 'Align right',
  '填充': 'Fill',
  '文字': 'Text',
  '清除主题样式': 'Clear topic style',
  '任务': 'Tasks',
  '启用任务': 'Enable task',
  '进度': 'Progress',
  '优先级': 'Priority',
  '最高': 'Highest',
  '高': 'High',
  '中': 'Medium',
  '低': 'Low',
  '最低': 'Lowest',
  '开始': 'Start',
  '截止': 'Due',
  '主题标记': 'Markers',
  '折叠 / 展开': 'Collapse / expand',
  '切换': 'Toggle',
  '插入元素': 'Insert element',
  '外框': 'Boundary',
  '联系': 'Relationship',
  '概要': 'Summary',
  '专区': 'Zone',
  '浮动主题': 'Floating topic',
  '图片': 'Image',
  '附件': 'Attachment',
  '语音': 'Audio',
  '公式': 'Equation',
  '清除元素': 'Clear elements',
  '清除': 'Clear',
  '文档': 'Document',
  '主题数': 'Topics',
  '字数': 'Words',
  '选中': 'Selected',
  '状态': 'Status',
  '无': 'None',
  '已保存': 'Saved',
  '未保存': 'Unsaved',
  '配色方案': 'Color scheme',
  '钢蓝': 'Steel blue',
  '深色画布': 'Dark canvas',
  '彩虹分支': 'Rainbow branches',
  '线条粗细': 'Line width',
  '线条样式': 'Line style',
  '曲线': 'Curve',
  '折线': 'Elbow',
  '直线': 'Straight',
  '选中字号': 'Selected font size',
  '恢复自动布局': 'Restore auto layout',
  '性能': 'Performance',
  '性能自检（2000 节点）': 'Benchmark (2,000 nodes)',
  '就绪': 'Ready',
  '离线 · 浏览器本地存储': 'Offline · browser storage',
  '重要': 'Important',
  '里程碑': 'Milestone',
  '待跟进': 'Follow up',
  '疑问': 'Question',
  '灵感': 'Idea',
  '重点': 'Key point',
  '风险': 'Risk',
  '锚点': 'Anchor',
  '待定': 'Pending',
  '清除标记': 'Clear markers',
  '外框：{name}': 'Boundary: {name}',
  '点击编辑外框标题': 'Click to edit the boundary title',
  '删除外框': 'Delete boundary',
  '删除专区': 'Delete zone',
  '重命名外框': 'Rename boundary',
  '新建浮动主题': 'New floating topic',

  /* ---------------- 状态与统计 ---------------- */
  '{n} 个主题': '{n} topics',
  '{n} 个': '{n}',
  '折叠 {n}': 'collapsed {n}',
  '匹配 {n}': 'matches {n}',
  '筛选 {n}': 'filtered {n}',
  '筛选：{n} 个主题': 'Filter: {n} topics',
  '（空主题）': '(Empty topic)',
  '查看': 'View',
  '查看原图': 'View original',
  '移除': 'Remove',
  '下载': 'Download',
  '链接主题': 'Link to topic',
  '链接到主题': 'Link to topic',
  '选择要跳转的主题': 'Select a topic to jump to',
  '目标主题': 'Target topic',
  '搜索主题': 'Search topics',
  '没有匹配项': 'No matches',
  '已链接到主题，输入网址可替换': 'Linked to a topic; enter a URL to replace',
  '该主题没有链接': 'This topic has no link',
  '已设置主题链接': 'Topic link set',
  '已跳转到链接主题': 'Jumped to the linked topic',
  '链接的主题已不存在': 'The linked topic no longer exists',
  '没有可链接的主题': 'No topics available to link',
  '语音备注': 'Voice note',
  '上传语音': 'Upload audio',
  '已添加语音': 'Audio added',
  '音频超过 20 MB，请改用较小的文件': 'Audio exceeds 20 MB; use a smaller file',
  '录音需要 HTTPS 或 localhost 环境': 'Recording requires HTTPS or localhost',
  '无法访问麦克风，请检查权限或使用上传语音':
    'Cannot access the microphone; check permissions or upload an audio file',
  '当前主题媒体': 'Current topic media',
  '选中主题后可查看媒体': 'Select a topic to view its media',
  '暂无图片、附件或语音': 'No images, attachments or audio yet',
  '播放': 'Play',
  '暂停': 'Pause',
  '无法播放该音频': 'Cannot play this audio',
  '画布名称': 'Canvas name',
  '{title}（双击重命名）': '{title} (double-click to rename)',
  '删除该画布': 'Delete this canvas',
  '移除标签 {label}': 'Remove label {label}',
  '撤销：{label}（Ctrl+Z）': 'Undo: {label} (Ctrl+Z)',
  '重做：{label}（Ctrl+Shift+Z）': 'Redo: {label} (Ctrl+Shift+Z)',
  '撤销（Ctrl+Z）': 'Undo (Ctrl+Z)',
  '重做（Ctrl+Shift+Z）': 'Redo (Ctrl+Shift+Z)',
  '正在保存…': 'Saving…',
  '已保存到浏览器 {time}': 'Saved to browser {time}',
  '已保存到浏览器（兼容模式） {time}': 'Saved to browser (compatibility mode) {time}',
  '已保存快照，有新修改': 'Snapshot saved; newer edits pending',
  '保存失败': 'Save failed',

  /* ---------------- 右键菜单 ---------------- */
  '编辑文本': 'Edit text',
  '新增子主题': 'Add subtopic',
  '新增同级主题': 'Add sibling',
  '复制': 'Copy',
  '粘贴': 'Paste',
  '剪切': 'Cut',
  '创建副本': 'Duplicate',
  '增高 20 px': 'Increase by 20 px',
  '降低 20 px': 'Decrease by 20 px',
  '统一高度（{n} 个）': 'Equal heights ({n})',
  '统一高度（需多选）': 'Equal heights (select multiple)',
  '恢复自适应高度': 'Restore auto height',
  '删除主题': 'Delete topic',
  '恢复全部自动布局': 'Restore all auto layout',
  '折叠全部': 'Collapse all',
  '展开全部': 'Expand all',

  /* ---------------- 对话框 ---------------- */
  '取消': 'Cancel',
  '确定': 'OK',

  /* ---------------- 演说 ---------------- */
  '暂无分支可生成演说页': 'No branches to generate slides',
  '演说模式': 'Pitch mode',
  '上一页': 'Previous',
  '下一页': 'Next',
  '退出': 'Exit',
  '演示窗口': 'Present',
  '全屏': 'Fullscreen',
  '关闭窗口': 'Close window',
  '打开独立演示窗口（16:9）': 'Open a separate 16:9 presentation window',
  '通过 Tab 为该分支添加子主题': 'Press Tab to add subtopics to this branch',
  '请允许弹出窗口，或使用浏览器全屏': 'Allow pop-ups, or use browser fullscreen',
  '{topics} 个主题 · {branches} 个分支': '{topics} topics · {branches} branches',
  '{n} 个子主题': '{n} subtopics',
  '概览': 'Overview',
  '← → 翻页 · F 全屏 · Esc 退出': '← → navigate · F fullscreen · Esc exit',

  /* ---------------- 甘特 ---------------- */
  '还没有任务': 'No tasks yet',
  '选中主题后，在右侧「任务」中开启并设置日期，即可在此排期':
    'Select a topic, enable Task in the side panel and set dates to schedule it here',
  '逾期': 'Overdue',

  /* ---------------- 大纲 ---------------- */
  '当前画布没有主题': 'This canvas has no topics',
  '标记为未完成': 'Mark as incomplete',
  '标记为已完成': 'Mark as complete',

  /* ---------------- 提示消息 ---------------- */
  '已新建画布': 'Canvas added',
  '文件至少保留一张画布': 'Keep at least one canvas',
  '中心主题没有同级主题': 'The central topic has no siblings',
  '浮动主题没有同级主题': 'The floating topic has no siblings',
  '请先选中一个主题': 'Select a topic first',
  '请先选中主题': 'Select a topic first',
  '中心主题不可删除': 'The central topic cannot be deleted',
  '中心主题不可剪切': 'The central topic cannot be cut',
  '中心主题不可创建副本': 'The central topic cannot be duplicated',
  '已保存到浏览器': 'Saved to browser',
  '已保存到浏览器（保存期间有新修改）': 'Saved to browser (new edits were made during save)',
  '保存失败：{error}': 'Save failed: {error}',
  '已导入 {name}（{format}）': 'Imported {name} ({format})',
  '打开失败：{error}': 'Open failed: {error}',
  '已新建空白文档': 'New blank document created',
  '已导出 WVM 工程文件': 'WVM project exported',
  '已导出 SVG': 'SVG exported',
  '已导出 PNG（2x）': 'PNG (2x) exported',
  '已导出 Markdown': 'Markdown exported',
  '已导出 OPML': 'OPML exported',
  '已导出 XMind 文件': 'XMind file exported',
  '导出失败：{error}': 'Export failed: {error}',
  '已调整主题层级': 'Topic level changed',
  '已复制 {n} 个主题': 'Copied {n} topics',
  '已剪切 {n} 个主题': 'Cut {n} topics',
  '剪贴板中没有主题': 'The clipboard has no topics',
  '已粘贴 {n} 个主题': 'Pasted {n} topics',
  '已创建 {n} 个副本': '{n} copies created',
  '请先选中至少两个主题': 'Select at least two topics',
  '已将 {n} 个主题统一为 {size} px': 'Unified {n} topics to {size} px',
  '已恢复自适应高度': 'Auto height restored',
  '已恢复全部自动布局': 'Auto layout restored for all topics',
  '没有可重做的操作': 'Nothing to redo',
  '没有可撤销的操作': 'Nothing to undo',
  '专注模式：按 Esc 退出': 'Zen mode: press Esc to exit',
  '该主题没有子主题': 'This topic has no subtopics',
  '没有找到匹配内容': 'No matches found',
  '已替换 {n} 个主题': 'Replaced {n} topics',
  '已清除主题样式': 'Topic style cleared',
  '已重置选中主题位置': 'Selected topic positions reset',
  '请输入 http:// 或 https:// 开头的链接': 'Enter a link starting with http:// or https://',
  '该主题没有网页链接': 'This topic has no web link',
  '截止日期不能早于开始日期': 'Due date cannot be earlier than start date',
  '请先选中主题（中心主题不可加外框）': 'Select topics first (the central topic cannot have a boundary)',
  '请按住 Shift 选中两个主题': 'Shift-click to select exactly two topics',
  '请选中同一层级的多个主题': 'Select multiple topics at the same level',
  '概要需要同一层级的连续主题': 'A summary needs consecutive topics at the same level',
  '图片超过 10 MB，请先压缩': 'Image exceeds 10 MB; compress it first',
  '已插入图片': 'Image inserted',
  '附件超过 10 MB，请改用较小的文件': 'Attachment exceeds 10 MB; use a smaller file',
  '已附加 {name}': 'Attached {name}',
  '当前环境不支持录音': 'Recording is not supported in this environment',
  '未录到音频': 'No audio was recorded',
  '语音备注已附加': 'Audio note attached',
  '录音中，再次点击结束': 'Recording… click again to stop',
  '无法访问麦克风': 'Cannot access the microphone',
  '已清除该主题的装饰与媒体': 'Decorations and media cleared',
  '性能自检：{text}': 'Benchmark: {text}',
  '布局 {layout} ms · 渲染 {render} ms · {n} 节点':
    'Layout {layout} ms · Render {render} ms · {n} nodes',
  '已恢复自动快照': 'Autosave snapshot restored',
  '已从浏览器恢复': 'Restored from browser',
  '已恢复浏览器中保存的文档': 'Restored the document saved in this browser',
  '文档过大，自动保存已跳过': 'Document too large; autosave skipped',
  '已自动保存 {time}': 'Autosaved {time}',
  '自动保存不可用': 'Autosave unavailable',
  '自动保存已开启': 'Autosave on',
  '恢复自动快照': 'Restore autosave snapshot',
  '检测到 {time} 的自动快照，是否恢复？': 'Found an autosave snapshot from {time}. Restore it?',
  '恢复': 'Restore',
  '查找内容': 'Find',
  '要查找的文字': 'Text to find',
  '将「{text}」替换为': 'Replace “{text}” with',
  '留空表示删除': 'Leave empty to delete',
  '删除画布': 'Delete canvas',
  '该画布及其全部主题、元素都会被删除，此操作可撤销。':
    'This canvas and all of its topics and elements will be deleted. You can undo this.',
  '新建文档': 'New document',
  '当前文档有未保存的修改，新建后将丢失。':
    'The current document has unsaved changes that will be lost.',
  '插入公式': 'Insert equation',
  'LaTeX 公式（留空则清除）': 'LaTeX formula (leave empty to clear)',
  '例如：E = mc^2': 'e.g. E = mc^2',
  '语言已切换': 'Language changed'
};

let locale: Locale = detectLocale();

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch {
    /* 忽略隐私模式下的存储异常 */
  }
  const language = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'zh';
  return language.startsWith('zh') ? 'zh-CN' : 'en';
}

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* 忽略存储异常 */
  }
  if (document.documentElement) document.documentElement.lang = next;
}

/** 翻译原文；未知词条原样返回，便于渐进式覆盖。 */
export function t(text: string, vars?: Readonly<Record<string, string | number>>): string {
  const raw = locale === 'en' ? EN[text] ?? text : text;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole);
}

/* ------------------------------------------------------------------ */
/* 静态界面本地化                                                      */
/* ------------------------------------------------------------------ */

const textOriginals = new WeakMap<Text, string>();
const attrOriginals = new WeakMap<Element, Record<string, string>>();
const ATTRS = ['title', 'placeholder', 'aria-label'] as const;
const ROOTS = ['.bar', '.panel', '.status', '.hint', '.zen-exit', '#editor', '#boundaryEditor'];

function shouldSkip(el: Element): boolean {
  return el.hasAttribute('data-no-i18n') ||
    el.classList.contains('brand-text') ||
    el.tagName === 'SCRIPT' ||
    el.tagName === 'STYLE';
}

function localizeNode(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;
    const value = text.nodeValue ?? '';
    if (!value.trim()) return;
    let original = textOriginals.get(text);
    if (original === undefined) {
      original = value;
      textOriginals.set(text, original);
    }
    const leading = original.match(/^\s*/)?.[0] ?? '';
    const trailing = original.match(/\s*$/)?.[0] ?? '';
    text.nodeValue = leading + t(original.trim()) + trailing;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (shouldSkip(el)) return;

  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    let store = attrOriginals.get(el);
    if (!store) {
      store = {};
      attrOriginals.set(el, store);
    }
    if (!(attr in store)) store[attr] = value;
    el.setAttribute(attr, t(store[attr]!));
  }

  for (const child of Array.from(el.childNodes)) localizeNode(child);
}

/** 对静态界面做一次快照并应用当前语言；可重复调用以切换语言。 */
export function localizeStatic(): void {
  for (const selector of ROOTS) {
    const root = document.querySelector(selector);
    if (root) localizeNode(root);
  }
}
