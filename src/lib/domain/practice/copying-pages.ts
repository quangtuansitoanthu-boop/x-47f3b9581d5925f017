/** Carry the final sentence (or verse line) into the next writing page. */
export function copyingCarryStart(text: string): number {
  let start = 0;
  for (const match of text.matchAll(/[.!?…。！？][”"’')\]]*\s+|\r?\n/gu)) {
    const next = match.index! + match[0].length;
    if (text.slice(next).trim()) start = next;
  }
  // An unusually long sentence must still leave room to keep writing.
  if (start === 0) start = text.match(/\S+\s*$/u)?.index ?? 0;
  return start;
}

/** Reflow view-only pages after a font, viewport or panel-size change. */
export function copyingPageStarts(text: string, fits: (start: number, end: number) => boolean): number[] {
  const starts = [0];
  const ends = [...text.matchAll(/\S+\s*/gu)].map(match => match.index! + match[0].length);
  let start = 0;
  while (start < text.length && !fits(start, text.length)) {
    const candidates = ends.filter(end => end > start);
    if (!candidates.length) break;
    let low = 0, high = candidates.length - 1, best = 0;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (fits(start, candidates[middle])) { best = middle; low = middle + 1; }
      else high = middle - 1;
    }
    const end = candidates[best];
    const carry = start + copyingCarryStart(text.slice(start, end));
    const next = carry > start ? carry : end;
    if (next >= text.length) break;
    starts.push(next); start = next;
  }
  return starts;
}

/** Page boundaries are view state only; the stored copy remains one unbroken string. */
export function editCopyingPage(text: string, starts: number[], page: number, value: string) {
  const from = starts[page], to = starts[page + 1] ?? text.length;
  // Native contenteditable can drop the trailing newline of a displayed page.
  // Preserve that structural separator so the next page's first word never joins it.
  const separator = text.slice(from, to).match(/\s+$/u)?.[0];
  if (starts[page + 1] !== undefined && separator && /[\p{L}\p{M}\p{N}]$/u.test(value) && /^[\p{L}\p{M}\p{N}]/u.test(text.slice(to))) value += separator;
  const delta = value.length - (to - from);
  return {
    text: text.slice(0, from) + value + text.slice(to),
    starts: starts.map((offset, index) => index > page ? offset + delta : offset),
  };
}
