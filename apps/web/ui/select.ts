/**
 * 自定义下拉选择器：替代原生 select，保持 value / change 事件语义。
 *
 * - 原生 select 仅作为数据载体隐藏保留，现有业务代码无需改动；
 * - 弹层挂载到 body 并使用 fixed 定位，避免被侧栏或画布裁剪；
 * - 全局同一时间只允许一个弹层展开（结构选择器也复用该注册表）。
 */

import { t } from '../i18n.ts';

export interface CustomSelectOptions {
  /** 固定触发器文案（中文原文），不随选项变化。 */
  readonly label?: string;
  readonly className?: string;
  /** 选项前缀图标，返回受信任的 SVG/HTML 字符串。 */
  readonly icon?: (value: string) => string;
}

interface Handle {
  refresh(): void;
  close(): void;
}

const handles = new WeakMap<HTMLSelectElement, Handle>();
const enhanced = new Set<HTMLSelectElement>();
let activeClose: (() => void) | null = null;

/** 关闭当前展开的弹层（结构选择器与自定义下拉共用）。 */
export function closeActivePopover(): boolean {
  const close = activeClose;
  activeClose = null;
  if (!close) return false;
  close();
  return true;
}

/** 注册新的弹层，自动关闭上一个。 */
export function registerPopover(close: () => void): void {
  closeActivePopover();
  activeClose = close;
}

function optionText(option: HTMLOptionElement | undefined): string {
  return t((option?.textContent ?? '').trim());
}

export function enhanceSelect(select: HTMLSelectElement, options: CustomSelectOptions = {}): void {
  if (handles.has(select)) return;

  const wrap = document.createElement('span');
  wrap.className = `wselect${options.className ? ` ${options.className}` : ''}`;
  wrap.setAttribute('data-no-i18n', '');
  select.parentElement?.insertBefore(wrap, select);
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wselect-trigger';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');

  const pop = document.createElement('div');
  pop.className = 'wselect-pop';
  pop.setAttribute('role', 'listbox');
  pop.hidden = true;

  wrap.appendChild(button);
  wrap.appendChild(select);
  // 弹层挂到 body：避免被顶栏的 backdrop-filter / overflow 裁剪
  document.body.appendChild(pop);

  const refresh = (): void => {
    const selected = select.selectedOptions?.[0] ??
      select.options?.[select.selectedIndex] ??
      select.options?.[0];
    const text = options.label ? t(options.label) : optionText(selected);
    button.replaceChildren();
    const icon = options.icon?.(select.value) ?? '';
    if (icon) {
      const glyph = document.createElement('span');
      glyph.className = 'wselect-icon';
      glyph.innerHTML = icon;
      button.appendChild(glyph);
    }
    const label = document.createElement('span');
    label.className = 'wselect-value';
    label.textContent = text;
    button.appendChild(label);
    const chev = document.createElement('span');
    chev.className = 'wselect-chev';
    chev.textContent = '▾';
    button.appendChild(chev);
    button.title = options.label
      ? `${t(options.label)}：${optionText(selected)}`
      : optionText(selected);
    if (!pop.hidden) build();
  };

  const build = (): void => {
    pop.replaceChildren();
    for (const option of Array.from(select.options)) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `wselect-option${option.selected ? ' on' : ''}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.selected));
      const icon = options.icon?.(option.value) ?? '';
      if (icon) {
        const glyph = document.createElement('span');
        glyph.className = 'wselect-icon';
        glyph.innerHTML = icon;
        item.appendChild(glyph);
      }
      const label = document.createElement('span');
      label.className = 'wselect-label';
      label.textContent = optionText(option);
      item.appendChild(label);
      const check = document.createElement('span');
      check.className = 'wselect-check';
      check.textContent = option.selected ? '✓' : '';
      item.appendChild(check);
      item.addEventListener('click', () => {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
        close();
      });
      pop.appendChild(item);
    }
  };

  const onOutside = (event: PointerEvent): void => {
    if (!(event.target instanceof Node)) return;
    if (wrap.contains(event.target) || pop.contains(event.target)) return;
    close();
  };

  const close = (): void => {
    if (pop.hidden) return;
    pop.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('scroll', close, true);
    if (activeClose === close) activeClose = null;
  };

  const open = (): void => {
    registerPopover(close);
    build();
    pop.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const rect = button.getBoundingClientRect();
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    const below = rect.bottom + 6;
    const top = below + height > window.innerHeight - 8
      ? Math.max(8, rect.top - height - 6)
      : below;
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
    pop.style.minWidth = `${Math.round(Math.max(rect.width, 132))}px`;
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
  };

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (pop.hidden) open();
    else close();
  });

  select.addEventListener('change', refresh);

  handles.set(select, { refresh, close });
  enhanced.add(select);
  refresh();
}

/** 程序化修改 select.value 后刷新触发器。 */
export function refreshSelect(select: HTMLSelectElement): void {
  handles.get(select)?.refresh();
}

export function refreshAllSelects(): void {
  for (const select of enhanced) handles.get(select)?.refresh();
}
