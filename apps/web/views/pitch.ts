/**
 * 演说视图：中心主题为封面，每个一级分支生成一页。
 * 与导图同源，不产生副本（PRD FR-55）。
 *
 * 16:9 画幅：普通视图在应用内自适应最大化；`?present=1` 为独立演示窗口，
 * 支持浏览器全屏（F 键或右上角按钮），← → 翻页，Esc 退出。
 */

import type { Sheet, TopicId } from '../../../packages/core/src/types.ts';
import { stripRich } from '../../../packages/core/src/rich.ts';
import { t } from '../i18n.ts';
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
  private readonly presentation: boolean;
  private index = 0;

  constructor(el: HTMLElement, host: ViewHost, presentation = false) {
    this.el = el;
    this.host = host;
    this.presentation = presentation;
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

  /** 在独立窗口中打开 16:9 演示（不受应用工具栏限制）。 */
  openWindow(): void {
    const url = new URL(window.location.href);
    url.search = '?present=1';
    const win = window.open(
      url.toString(),
      'weavemind-present',
      'popup=yes,width=1440,height=900'
    );
    if (!win) {
      this.host.toast('请允许弹出窗口，或使用浏览器全屏');
      return;
    }
    win.focus();
  }

  toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  }

  syncFullscreen(): void {
    const button = this.el.querySelector<HTMLElement>('[data-act="fullscreen"]');
    if (button) {
      button.textContent = document.fullscreenElement ? t('退出') : t('全屏');
    }
  }

  private buildSlides(): Slide[] {
    const sheet: Sheet = this.host.sheet();
    const root = sheet.topics[sheet.rootId];
    if (!root) return [];

    const cover: Slide = {
      title: stripRich(root.text),
      subtitle: t('{topics} 个主题 · {branches} 个分支', {
        topics: Object.keys(sheet.topics).length,
        branches: root.children.length
      }),
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
        subtitle: branch.children.length
          ? t('{n} 个子主题', { n: branch.children.length })
          : t('概览'),
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
      this.el.innerHTML = `<div class="empty"><div class="empty-title">${t('暂无分支可生成演说页')}</div></div>`;
      return;
    }

    if (this.index >= slides.length) this.index = 0;
    const slide = slides[this.index]!;

    const bar = this.presentation
      ? `<div class="pitch-bar present-bar">` +
        `<span class="pitch-tag">${t('演说模式')}</span>` +
        `<span class="pitch-count">${this.index + 1} / ${slides.length}</span>` +
        `<span class="spacer"></span>` +
        `<span class="pitch-hint">${t('← → 翻页 · F 全屏 · Esc 退出')}</span>` +
        `<button class="pbtn" data-act="prev">${t('上一页')}</button>` +
        `<button class="pbtn" data-act="next">${t('下一页')}</button>` +
        `<button class="pbtn" data-act="fullscreen">${document.fullscreenElement ? t('退出') : t('全屏')}</button>` +
        `<button class="pbtn" data-act="close">${t('关闭窗口')}</button>` +
        `</div>`
      : `<div class="pitch-bar">` +
        `<span class="pitch-tag">${t('演说模式')}</span>` +
        `<span class="pitch-count">${this.index + 1} / ${slides.length}</span>` +
        `<span class="spacer"></span>` +
        `<button class="pbtn" data-act="prev">${t('上一页')}</button>` +
        `<button class="pbtn" data-act="next">${t('下一页')}</button>` +
        `<button class="pbtn" data-act="present" title="${t('打开独立演示窗口（16:9）')}">${t('演示窗口')}</button>` +
        `<button class="pbtn" data-act="exit">${t('退出')}</button>` +
        `</div>`;

    this.el.innerHTML =
      `<div class="pitch-shell${this.presentation ? ' is-presenting' : ''}">` +
      bar +
      `<div class="pitch-stage">` +
      `<div class="slide">` +
      `<div class="slide-kicker">${escapeHtml(slide.subtitle)}</div>` +
      `<h1 class="slide-title">${escapeHtml(slide.title)}</h1>` +
      (slide.items.length
        ? `<ul class="slide-list">${slide.items
            .map((item) => `<li data-id="${item.id}">${escapeHtml(item.text)}</li>`)
            .join('')}</ul>`
        : `<div class="slide-empty">${t('通过 Tab 为该分支添加子主题')}</div>`) +
      (slide.note ? `<div class="slide-note">${escapeHtml(slide.note)}</div>` : '') +
      `</div></div></div>`;

    this.el.querySelectorAll<HTMLElement>('[data-act]').forEach((button) => {
      button.addEventListener('click', () => {
        const act = button.dataset.act;
        if (act === 'next') this.next();
        else if (act === 'prev') this.prev();
        else if (act === 'present') this.openWindow();
        else if (act === 'fullscreen') this.toggleFullscreen();
        else if (act === 'close') window.close();
        else if (act === 'exit') this.host.exitView?.();
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
