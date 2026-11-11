/**
 * 文本度量。
 *
 * 浏览器注入基于 Canvas 的实现；Node 测试与 Worker 冷启动阶段使用估算实现，
 * 二者满足同一个 TextMeasurer 接口（技术方案 5.6）。
 */

export interface TextMeasurer {
  width(text: string, fontSize: number, weight?: number): number;
}

const CJK = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef\u3000-\u303f]/;

export function createEstimateMeasurer(): TextMeasurer {
  return {
    width(text: string, fontSize: number, weight = 400) {
      let units = 0;
      for (const ch of text) {
        if (CJK.test(ch)) units += 1;
        else if (ch === ' ') units += 0.3;
        else if (/[A-Z0-9]/.test(ch)) units += 0.62;
        else units += 0.54;
      }
      const weightFactor = weight >= 700 ? 1.06 : weight >= 600 ? 1.03 : 1;
      return units * fontSize * weightFactor;
    }
  };
}

/** 基于 Canvas 的精确度量，带 LRU 缓存。 */
export function createCanvasMeasurer(measureText: (text: string, font: string) => number): TextMeasurer {
  const cache = new Map<string, number>();
  const LIMIT = 8000;

  return {
    width(text: string, fontSize: number, weight = 400) {
      const key = `${weight}|${fontSize}|${text}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const w = measureText(text, `${weight} ${fontSize}px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`);
      if (cache.size > LIMIT) {
        const first = cache.keys().next().value;
        if (first !== undefined) cache.delete(first);
      }
      cache.set(key, w);
      return w;
    }
  };
}
