/**
 * 演说视图：每一页把导图渲染为 16:9 的思维导图画面，而非大纲列表。
 *
 * - 封面展示整张导图；每个一级分支生成一页，展示该分支子树；
 * - 使用与导图同源的布局与 SVG 渲染，保证演示与编辑内容一致；
 * - `?present=1` 为独立演示窗口，支持浏览器全屏、← → 翻页与 Esc 退出；
 * - 页码显示在幻灯片右下角，不再展示主题数等统计数据。
 */

import type { Sheet, Topic, TopicId } from '../../../packages/core/src/types.ts';
import { stripRich } from '../../../packages/core/src/rich.ts';
import { layoutSheet } from '../../../packages/layout/src/layout.ts';
import { createEstimateMeasurer } from '../../../packages/layout/src/measure.ts';
import { toSvg } from '../../../packages/render/src/svg.ts';
import { t } from '../i18n.ts';
import type { ViewHost } from './host.ts';

interface Slide {
  readonly title: string;
  readonly rootId: TopicId;
  readonly note?: string;
}

/** 以某个主题为根，裁剪出仅包含其后代的画布，用于单页演示。 */
function subtreeSheet(source: Sheet, rootId: TopicId): Sheet {
  const ids = new Set<TopicId>();
  const walk = (id: TopicId): void => {
    if (ids.has(id)) return;
    const topic = source.topics[id];
    if (!topic) return;
    ids.add(id);
    for (const child of topic.children) {
      if (source.topics[child]?.kind !== 'summary') walk(child);
    }
  };
  walk(rootId);

  const topics: Record<string, Topic> = {};
  for (const id of ids) {
    const topic = source.topics[id]!;
    topics[id] = {
      ...topic,
      parentId: id === rootId ? null : topic.parentId,
      children: topic.children.filter((child) => ids.has(child)),
      kind: id === rootId ? 'root' : topic.kind,
      offsetX: undefined,
      offsetY: undefined,
      summaryOf: undefined
    };
  }

  return {
    ...source,
    rootId,
    topics,
    structure: 'mindmap',
    boundaries: [],
    relationships: [],
    zones: [],
    style: {
      ...source.style,
      background: '#ffffff',
      darkCanvas: false,
      edgeStyle: 'curve'
    }
  };
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
      rootId: root.id,
      note: root.note
    };

    const pages = root.children
      .map((id) => sheet.topics[id])
      .filter((topic): topic is NonNullable<typeof topic> => Boolean(topic))
      .filter((topic) => topic.kind !== 'summary')
      .map<Slide>((branch) => ({
        title: stripRich(branch.text),
        rootId: branch.id,
        note: branch.note
      }));

    return [cover, ...pages];
  }

  private renderMap(slide: Slide): string {
    const source = this.host.sheet();
    const sheet = subtreeSheet(source, slide.rootId);
    const measure = createEstimateMeasurer();
    const layout = layoutSheet(sheet, new Set(), measure, 'mindmap');
    const svg = toSvg(sheet, layout, { dark: false, measure });
    return svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ');
  }

  render(): void {
    const slides = this.buildSlides();
    if (slides.length === 0) {
      this.el.innerHTML = `<div class="empty"><div class="empty-title">${t('暂无分支可生成演说页')}</div></div>`;
      return;
    }

    if (this.index >= slides.length) this.index = 0;
    const slide = slides[this.index]!;
    const page = `${this.index + 1} / ${slides.length}`;

    const bar = this.presentation
      ? `<div class="pitch-bar present-bar">` +
        `<span class="pitch-tag">${t('演说模式')}</span>` +
        `<span class="pitch-count">${page}</span>` +
        `<span class="spacer"></span>` +
        `<span class="pitch-hint">${t('← → 翻页 · F 全屏 · Esc 退出')}</span>` +
        `<button class="pbtn" data-act="prev">${t('上一页')}</button>` +
        `<button class="pbtn" data-act="next">${t('下一页')}</button>` +
        `<button class="pbtn" data-act="fullscreen">${document.fullscreenElement ? t('退出') : t('全屏')}</button>` +
        `<button class="pbtn" data-act="close">${t('关闭窗口')}</button>` +
        `</div>`
      : `<div class="pitch-bar">` +
        `<span class="pitch-tag">${t('演说模式')}</span>` +
        `<span class="pitch-count">${page}</span>` +
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
      `<div class="slide map-slide">` +
      `<div class="slide-head">` +
      `<div class="slide-kicker">${t('演说模式')}</div>` +
      `<h1 class="slide-title">${escapeHtml(slide.title)}</h1>` +
      `</div>` +
      `<div class="slide-map">${this.renderMap(slide)}</div>` +
      (slide.note ? `<div class="slide-note">${escapeHtml(slide.note)}</div>` : '') +
      `<span class="slide-page">${page}</span>` +
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
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
