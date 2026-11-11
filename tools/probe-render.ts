/**
 * 渲染探针：用可记录文本的 Canvas 桩验证标记徽章确实被绘制。
 * 运行：node tools/probe-render.ts
 */

const texts: string[] = [];

function makeContext(): Record<string, unknown> {
  const noop = () => undefined;
  return {
    measureText: (text: string) => ({ width: [...text].length * 7 }),
    fillText: (text: string) => { texts.push(text); },
    strokeText: noop,
    save: noop, restore: noop, beginPath: noop, closePath: noop,
    rect: noop, roundRect: noop, fill: noop, stroke: noop,
    moveTo: noop, lineTo: noop, bezierCurveTo: noop, arc: noop,
    setLineDash: noop, translate: noop, scale: noop, setTransform: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, drawImage: noop, clip: noop
  };
}

function makeCanvas(): HTMLCanvasElement {
  const ctx = makeContext();
  return {
    width: 1200,
    height: 800,
    style: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 })
  } as unknown as HTMLCanvasElement;
}

(globalThis as unknown as { document: unknown }).document = {
  createElement: () => makeCanvas()
};
(globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 1 };

const { addChild, createSheet, setMarker } = await import('../packages/core/src/model.ts');
const { CanvasRenderer } = await import('../packages/render/src/renderer.ts');

let sheet = createSheet('s1', '根');
const branch = addChild(sheet, 'root', '设计与架构', 'a');
sheet = setMarker(branch.sheet, 'a', 'star');
const idea = addChild(sheet, 'a', '灵感', 'b');
sheet = setMarker(idea.sheet, 'b', 'idea');

const renderer = new CanvasRenderer(makeCanvas(), makeCanvas());
renderer.resize(1200, 800);
renderer.update({
  sheet,
  collapsed: new Set(),
  view: { zoom: 1, panX: 0, panY: 0 },
  selection: new Set()
});

console.log(`fillText 调用：${texts.length}`);
console.log(`星标 ★：${texts.includes('★') ? '已绘制' : '缺失'}`);
console.log(`灵感 ✦：${texts.includes('✦') ? '已绘制' : '缺失'}`);
console.log(`文本样本：${JSON.stringify(texts.slice(0, 12))}`);

process.exitCode = texts.includes('★') && texts.includes('✦') ? 0 : 1;
