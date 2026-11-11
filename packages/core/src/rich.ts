/**
 * 行内富文本：支持 **粗体** 与 *斜体*，不嵌套。
 * 存储仍为纯文本，导出 Markdown 时天然保留标记。
 */

export interface RichRun {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
}

export function parseRich(text: string): RichRun[] {
  const runs: RichRun[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > last) {
      runs.push({ text: text.slice(last, match.index), bold: false, italic: false });
    }
    if (match[1] !== undefined) {
      runs.push({ text: match[1], bold: true, italic: false });
    } else {
      runs.push({ text: match[2] ?? '', bold: false, italic: true });
    }
    last = pattern.lastIndex;
  }

  if (last < text.length) {
    runs.push({ text: text.slice(last), bold: false, italic: false });
  }
  return runs.length > 0 ? runs : [{ text, bold: false, italic: false }];
}

export function stripRich(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

export function hasRichMarkup(text: string): boolean {
  return /\*\*[^*]+\*\*|\*[^*]+\*/.test(text);
}
