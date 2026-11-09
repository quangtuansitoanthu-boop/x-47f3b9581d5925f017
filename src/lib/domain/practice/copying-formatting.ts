type Alignment = 'left' | 'center' | 'right' | 'justify';
export interface CopySourceLine { align: Alignment; parts: { text: string; bold: boolean }[]; paragraph?: number }

/** Recover canonical paragraph styling without changing stored copying blocks. */
export function copySourceLayoutLines(block: string, layout: number[][]): CopySourceLine[] {
  const text = copySourceText(block), lines: CopySourceLine[] = [];
  const aligns: Alignment[] = ['left', 'center', 'right', 'justify'];
  let start = 0, previousLine = -1;
  for (const [end, alignment, bold, lineNumber] of layout) {
    if (!lines.length || previousLine !== lineNumber) {
      lines.push({ align: aligns[alignment] ?? 'justify', parts: [] }); previousLine = lineNumber;
    }
    lines[lines.length - 1].parts.push({ text: text.slice(start, end), bold: !!bold }); start = end;
  }
  return lines;
}

/** Source bundles retain reader markup, sometimes split across copying blocks. */
export function copySourceText(text: string): string {
  return text.replace(/\{align:(?:left|center|right|justify)\|/gu, '').replace(/[{}]/gu, '').replace(/\*\*/gu, '');
}

export function copySourceLines(blocks: string[], selected: number): CopySourceLine[] {
  let align: Alignment = 'justify';
  let bold = false;
  const lines: CopySourceLine[] = [];
  let line: CopySourceLine = { align, parts: [] };
  const flush = () => {
    if (line.parts.some(part => part.text.trim())) lines.push(line);
    line = { align, parts: [] };
  };
  for (let index = 0; index <= selected; index++) {
    const source = blocks[index] || '';
    let cursor = 0;
    if (index === selected) line = { align, parts: [] };
    for (const match of source.matchAll(/\{align:(left|center|right|justify)\||\}|\*\*|\n/gu)) {
      if (index === selected && match.index! > cursor) line.parts.push({ text: source.slice(cursor, match.index), bold });
      if (match[0] === '**') bold = !bold;
      else {
        if (index === selected) flush();
        if (match[1]) align = match[1] as Alignment;
        else if (match[0] === '}') align = 'justify';
        if (index === selected) line.align = align;
      }
      cursor = match.index! + match[0].length;
    }
    if (index === selected) {
      if (cursor < source.length) line.parts.push({ text: source.slice(cursor), bold });
      flush();
    }
  }
  return lines;
}
