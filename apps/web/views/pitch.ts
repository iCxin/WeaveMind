/**
 * 演说视图：中心主题为封面，每个一级分支生成一页。
 * 与导图同源，不产生副本（PRD FR-55）。
 */

import type { Sheet, TopicId } from '../../../packages/core/src/types.ts';
import { stripRich } from '../../../packages/core/src/rich.ts';
import type { ViewHost } from './host.ts';

interface Slide {
  readonly title: string;
  readonly subtitle: string;
  readonly items: { id: TopicId; text: string }[];
  readonly note?: string;
}

export class PitchView {
  private readonly host: ViewHost;
  private readonly el: HTMLElement;
  private index = 0;

  constructor(el: HTMLElement, host: ViewHost) {
    this.el = el;
    this.host = host;
  }

  get slideCount(): number {
    return this.buildSlides().length;
  }

  next(): void {
    const count = this.slideCount;
    if (count === 0) return;
    this.index = (this.index + 1) % count;
    this.render();
  }

  prev(): void {
    const count = this.slideCount;
    if (count === 0) return;
    this.index = (this.index - 1 + count) % count;
    this.render();
  }

  reset(): void {
    this.index = 0;
    this.render();
  }

  private buildSlides(): Slide[] {
    const sheet: Sheet = this.host.sheet();
    const root = sheet.topics[sheet.rootId];
    if (!root) return [];

    const cover: Slide = {
      title: stripRich(root.text),
      subtitle: `${Object.keys(sheet.topics).length} 个主题 · ${root.children.length} 个分支`,
      items: root.children
        .map((id) => sheet.topics[id])
        .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic))
        .map((topic) => ({ id: topic.id, text: stripRich(topic.text) })),
      note: root.note
    };

    const pages = root.children
      .map((id) => sheet.topics[id])
      .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic))
      .map<Slide>((branch) => ({
        title: stripRich(branch.text),
        subtitle: branch.children.length ? `${branch.children.length} 个子主题` : '概览',
        items: branch.children
          .map((id) => sheet.topics[id])
          .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic))
          .map((topic) => ({ id: topic.id, text: stripRich(topic.text) })),
        note: branch.note
      }));

    return [cover, ...pages];
  }

  render(): void {
    const slides = this.buildSlides();
    if (slides.length === 0) {
      this.el.innerHTML = '<div class="empty"><div class="empty-title">暂无分支可生成演说页</div></div>';
      return;
    }

    if (this.index >= slides.length) this.index = 0;
    const slide = slides[this.index]!;

    this.el.innerHTML =
      `<div class="pitch-shell">` +
      `<div class="pitch-bar">` +
      `<span class="pitch-tag">演说模式</span>` +
      `<span class="pitch-count">${this.index + 1} / ${slides.length}</span>` +
      `<span class="spacer"></span>` +
      `<button class="pbtn" data-act="prev">上一页</button>` +
      `<button class="pbtn" data-act="next">下一页</button>` +
      `<button class="pbtn" data-act="exit">退出</button>` +
      `</div>` +
      `<div class="pitch-stage">` +
      `<div class="slide">` +
      `<div class="slide-kicker">${escapeHtml(slide.subtitle)}</div>` +
      `<h1 class="slide-title">${escapeHtml(slide.title)}</h1>` +
      (slide.items.length
        ? `<ul class="slide-list">${slide.items
            .map((item) => `<li data-id="${item.id}">${escapeHtml(item.text)}</li>`)
            .join('')}</ul>`
        : '<div class="slide-empty">通过 Tab 为该分支添加子主题</div>') +
      (slide.note ? `<div class="slide-note">${escapeHtml(slide.note)}</div>` : '') +
      `</div></div></div>`;

    this.el.querySelectorAll<HTMLElement>('[data-act]').forEach((button) => {
      button.addEventListener('click', () => {
        const act = button.dataset.act;
        if (act === 'next') this.next();
        else if (act === 'prev') this.prev();
        else if (act === 'exit') this.host.select(this.host.sheet().rootId);
      });
    });

    this.el.querySelectorAll<HTMLElement>('.slide-list li').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        if (id) this.host.select(id);
      });
    });
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
