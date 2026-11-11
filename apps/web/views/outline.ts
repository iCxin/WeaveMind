/**
 * 大纲视图：与导图共享同一份文档，仅做只读投影 + 就地编辑。
 * Enter 新建同级、Tab 新建子级、Esc 结束编辑（PRD FR-56）。
 */

import { flatten } from '../../../packages/core/src/query.ts';
import { stripRich } from '../../../packages/core/src/rich.ts';
import type { Topic } from '../../../packages/core/src/types.ts';
import { t } from '../i18n.ts';
import type { ViewHost } from './host.ts';

const MARKER_GLYPH: Record<string, string> = {
  flag: '⚑',
  star: '★',
  done: '✓',
  wait: '△',
  question: '?',
  idea: '✦',
  heart: '♥',
  warn: '!',
  pin: '●',
  clock: '◷'
};

function markerGlyph(marker: string): string {
  if (marker.startsWith('prio')) return marker.slice(4);
  if (marker.startsWith('progress')) {
    return '⓪①②③④⑤⑥⑦⑧'[Number(marker.slice(8))] ?? '';
  }
  return MARKER_GLYPH[marker] ?? '';
}

export class OutlineView {
  private readonly host: ViewHost;
  private readonly el: HTMLElement;

  constructor(el: HTMLElement, host: ViewHost) {
    this.el = el;
    this.host = host;
  }

  render(): void {
    if (this.el.contains(document.activeElement)) return;

    const sheet = this.host.sheet();
    const selected = this.host.selection();
    const query = this.host.query().trim().toLowerCase();
    const rows = flatten(sheet);
    const frag = document.createDocumentFragment();

    for (const row of rows) {
      const hit = query.length > 0 && (
        row.topic.text.toLowerCase().includes(query) ||
        (row.topic.note ?? '').toLowerCase().includes(query) ||
        (row.topic.labels ?? []).some((label) => label.toLowerCase().includes(query))
      );
      const wrap = document.createElement('div');
      wrap.className = `orow${selected.has(row.id) ? ' sel' : ''}${hit ? ' hit' : ''}`;
      wrap.dataset.id = row.id;
      wrap.style.paddingLeft = `${14 + row.depth * 20}px`;

      const bullet = document.createElement('span');
      bullet.className = 'obullet';
      bullet.textContent = row.depth === 0 ? '●' : '•';
      wrap.appendChild(bullet);

      const text = document.createElement('span');
      text.className = 'otext';
      text.contentEditable = 'true';
      text.spellcheck = false;
      const display = stripRich(row.topic.text);
      text.textContent = display;
      text.dataset.id = row.id;
      text.addEventListener('focus', () => this.host.select(row.id));
      text.addEventListener('blur', () => {
        const value = (text.textContent ?? '').trim();
        if (value && value !== display) this.host.commitText(row.id, value);
        else text.textContent = display;
      });
      text.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          const value = (text.textContent ?? '').trim();
          if (value && value !== display) this.host.commitText(row.id, value);
          text.blur();
          const created = this.host.addSibling(row.id);
          if (created) requestAnimationFrame(() => this.focusById(created));
        } else if (event.key === 'Tab') {
          event.preventDefault();
          const value = (text.textContent ?? '').trim();
          if (value && value !== display) this.host.commitText(row.id, value);
          text.blur();
          const created = this.host.addChild(row.id);
          if (created) requestAnimationFrame(() => this.focusById(created));
        } else if (event.key === 'Escape') {
          text.textContent = display;
          text.blur();
        }
      });
      wrap.appendChild(text);

      const badges = document.createElement('span');
      badges.className = 'obadges';
      const markers = row.topic.markers?.length
        ? row.topic.markers
        : row.topic.marker
          ? [row.topic.marker]
          : [];
      for (const marker of markers) {
        const glyph = markerGlyph(marker);
        if (!glyph) continue;
        const badge = document.createElement('i');
        badge.className = `obadge m-${marker}`;
        badge.textContent = glyph;
        badges.appendChild(badge);
      }
      if (row.topic.todo !== undefined) {
        const todo = document.createElement('button');
        todo.className = `otodo${row.topic.todo ? ' done' : ''}`;
        todo.textContent = row.topic.todo ? '✓' : '';
        todo.title = row.topic.todo ? t('标记为未完成') : t('标记为已完成');
        todo.addEventListener('pointerdown', (event) => event.stopPropagation());
        todo.addEventListener('click', (event) => {
          event.stopPropagation();
          this.host.toggleTodo(row.id);
        });
        badges.appendChild(todo);
      }
      if (row.topic.note) {
        const note = document.createElement('i');
        note.className = 'obadge note';
        note.textContent = '✎';
        note.title = row.topic.note;
        badges.appendChild(note);
      }
      if (row.topic.task) {
        const task = document.createElement('i');
        task.className = 'obadge task';
        task.textContent = `${row.topic.task.progress}%`;
        badges.appendChild(task);
      }
      for (const label of row.topic.labels ?? []) {
        const chip = document.createElement('i');
        chip.className = 'obadge label';
        chip.textContent = label;
        badges.appendChild(chip);
      }
      wrap.appendChild(badges);

      wrap.addEventListener('pointerdown', (event) => {
        if (event.target === text) return;
        this.host.select(row.id);
      });

      frag.appendChild(wrap);
    }

    this.el.replaceChildren(frag);
    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = t('当前画布没有主题');
      this.el.appendChild(empty);
    }
  }

  focusSelected(): void {
    const id = [...this.host.selection()][0];
    if (id) this.focusById(id);
  }

  private focusById(id: string): void {
    const node = this.el.querySelector<HTMLElement>(`.otext[data-id="${id}"]`);
    if (!node) return;
    node.focus();
    if (typeof document.createRange !== 'function') return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection?.();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}

export function scalarLabel(topic: Topic): string {
  return topic.text;
}
