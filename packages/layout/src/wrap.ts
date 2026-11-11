/**
 * 文本自动换行：优先按空格与标点断行，中文按字断行，超长单词强制拆分。
 * 布局与渲染共用同一实现，保证高度与绘制一致。
 */

export type WidthFn = (text: string, fontSize: number, weight: number) => number;

const TOKEN_RE = /[A-Za-z0-9_.@#%+-]+|\s+|./gu;

export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  weight: number,
  measure: WidthFn
): string[] {
  if (maxWidth <= 8) return [text];

  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    if (measure(paragraph, fontSize, weight) <= maxWidth) {
      lines.push(paragraph);
      continue;
    }

    const tokens = paragraph.match(TOKEN_RE) ?? [];
    let current = '';

    for (const token of tokens) {
      const candidate = current + token;
      if (current && measure(candidate, fontSize, weight) > maxWidth) {
        lines.push(current.trimEnd());
        current = token.trimStart();

        while (current.length > 1 && measure(current, fontSize, weight) > maxWidth) {
          let cut = current.length - 1;
          while (cut > 1 && measure(current.slice(0, cut), fontSize, weight) > maxWidth) cut -= 1;
          lines.push(current.slice(0, cut));
          current = current.slice(cut);
        }
      } else {
        current = candidate;
      }
    }

    if (current.trim().length > 0) lines.push(current.trimEnd());
  }

  return lines.length > 0 ? lines : [''];
}
