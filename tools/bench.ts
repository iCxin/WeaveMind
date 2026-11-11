/**
 * 布局基准：构造 2000 节点文档，测量全量布局耗时。
 * 运行：node tools/bench.ts
 */

import { addChild, createSheet } from '../packages/core/src/model.ts';
import { layoutSheet } from '../packages/layout/src/layout.ts';
import { createEstimateMeasurer } from '../packages/layout/src/measure.ts';
import type { Sheet } from '../packages/core/src/types.ts';

const BRANCHES = 40;
const CHILDREN = 49;

function build(target: number): Sheet {
  let sheet = createSheet('bench', '2000 节点基准');
  let count = 1;
  for (let b = 0; b < BRANCHES && count < target; b += 1) {
    const branch = addChild(sheet, 'root', `分支 ${b + 1}`, `b${b}`);
    sheet = branch.sheet;
    count += 1;
    for (let c = 0; c < CHILDREN && count < target; c += 1) {
      const child = addChild(sheet, branch.id, `主题 ${b + 1}-${c + 1}`, `b${b}c${c}`);
      sheet = child.sheet;
      count += 1;
    }
  }
  return sheet;
}

function time(fn: () => void, rounds = 5): number {
  fn();
  const samples: number[] = [];
  for (let i = 0; i < rounds; i += 1) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}

const sheet = build(2000);
const measure = createEstimateMeasurer();
const nodeCount = Object.keys(sheet.topics).length;

const layoutMs = time(() => layoutSheet(sheet, new Set(), measure));

const deepCollapsed = new Set(Object.values(sheet.topics)
  .filter((topic) => topic.children.length > 0 && topic.id !== sheet.rootId)
  .map((topic) => topic.id));
const collapsedMs = time(() => layoutSheet(sheet, deepCollapsed, measure));

const result = layoutSheet(sheet, new Set(), measure);

console.log(`节点数           ${nodeCount}`);
console.log(`全量布局         ${layoutMs.toFixed(1)} ms`);
console.log(`全折叠布局       ${collapsedMs.toFixed(1)} ms`);
console.log(`包围盒           ${Math.round(result.bounds.w)} × ${Math.round(result.bounds.h)}`);
console.log(`连线数           ${result.edges.length}`);

const budget = 300;
console.log(`PRD 预算 ${budget} ms → ${layoutMs <= budget ? '达标' : '超标'}`);
process.exitCode = layoutMs <= budget ? 0 : 1;
