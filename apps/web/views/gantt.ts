/**
 * 甘特视图：任务列表 + 时间轴条带。
 * 时间范围由任务起止自动推导，逾期任务标红（PRD FR-27 的最小可用实现）。
 */

import { derivedProgress, isOverdue, tasksOf } from '../../../packages/core/src/query.ts';
import { stripRich } from '../../../packages/core/src/rich.ts';
import type { Task } from '../../../packages/core/src/types.ts';
import { t } from '../i18n.ts';
import type { ViewHost } from './host.ts';

const DAY = 86400000;

function parseDate(value?: string): number | null {
  if (!value) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function formatDate(time: number): string {
  const date = new Date(time);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

function toISO(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export class GanttView {
  private readonly host: ViewHost;
  private readonly el: HTMLElement;

  constructor(el: HTMLElement, host: ViewHost) {
    this.el = el;
    this.host = host;
  }

  render(): void {
    const sheet = this.host.sheet();
    const tasks = tasksOf(sheet);

    if (tasks.length === 0) {
      this.el.innerHTML =
        '<div class="empty gantt-empty">' +
        `<div class="empty-title">${t('还没有任务')}</div>` +
        `<div class="empty-sub">${t('选中主题后，在右侧「任务」中开启并设置日期，即可在此排期')}</div>` +
        '</div>';
      return;
    }

    const starts = tasks.map((item) => parseDate(item.task.start)).filter((v): v is number => v !== null);
    const dues = tasks.map((item) => parseDate(item.task.due)).filter((v): v is number => v !== null);

    const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    let min = starts.length ? Math.min(...starts) : today;
    let max = dues.length ? Math.max(...dues) : today + 14 * DAY;
    let span = max - min + DAY;
    if (span < 7 * DAY) {
      max = min + 7 * DAY;
      span = max - min;
    }
    min -= 2 * DAY;
    span += 4 * DAY;

    const headerTicks: string[] = [];
    for (let t = min; t <= min + span; t += 7 * DAY) {
      headerTicks.push(`<span class="gtick" style="left:${((t - min) / span) * 100}%">${formatDate(t)}</span>`);
    }

    const query = this.host.query().trim().toLowerCase();

    const rows = tasks
      .slice()
      .sort((a, b) => (parseDate(a.task.start) ?? 0) - (parseDate(b.task.start) ?? 0))
      .map(({ id, topic, task }) => {
        const start = parseDate(task.start) ?? parseDate(task.due) ?? today;
        const due = parseDate(task.due) ?? start + DAY;
        const left = ((start - min) / span) * 100;
        const width = Math.max(1.5, ((due - start + DAY) / span) * 100);
        const overdue = isOverdue(task);
        const selected = this.host.selection().has(id) ? ' sel' : '';
        const hit = query.length > 0 && topic.text.toLowerCase().includes(query);
        const progress = Math.max(0, Math.min(100, derivedProgress(sheet, id)));

        return (
          `<div class="grow-item${selected}${hit ? ' hit' : ''}" data-id="${id}">` +
          `<div class="gname"><span class="gdot"></span>${escapeHtml(stripRich(topic.text))}` +
          `${overdue ? `<i class="gover">${t('逾期')}</i>` : ''}` +
          `<span class="gpct">${progress}%</span></div>` +
          `<div class="gtrack">` +
          `<div class="gbar${overdue ? ' over' : ''}" ` +
          `title="${task.start ?? '—'} → ${task.due ?? '—'}" ` +
          `style="left:${left}%;width:${width}%">` +
          `<div class="gfill" style="width:${progress}%"></div>` +
          `</div>` +
          `</div></div>`
        );
      })
      .join('');

    this.el.innerHTML =
      `<div class="gantt">` +
      `<div class="gantt-head"><div class="gname">${t('任务')}</div><div class="gtrack gaxis">${headerTicks.join('')}</div></div>` +
      rows +
      `</div>`;

    this.el.querySelectorAll<HTMLElement>('.grow-item').forEach((row) => {
      row.addEventListener('click', () => {
        const id = row.dataset.id;
        if (id) this.host.select(id);
      });
    });
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function ganttRangeLabel(tasks: { task: Task }[]): string {
  if (!tasks.length) return '';
  const dates = tasks.flatMap((t) => [t.task.start, t.task.due]).filter(Boolean) as string[];
  if (!dates.length) return '';
  const sorted = dates.slice().sort();
  return `${sorted[0]} → ${sorted[sorted.length - 1]}`;
}

export { toISO };
