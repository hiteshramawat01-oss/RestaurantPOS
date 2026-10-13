import type { PaperWidth } from '../db/types';
import { alignLine, colsForSize, columnsFor, rowLines, toPrintable, wrap, type Block, type TextSize } from './receipt';

export interface StyledLine {
  text: string;
  bold?: boolean;
  size?: TextSize;
  invert?: boolean;
  divider?: boolean;
  cut?: boolean;
}

export function styledLines(blocks: Block[], cols: number): StyledLine[] {
  const out: StyledLine[] = [];
  for (const b of blocks) {
    if (b.t === 'text') {
      const width = colsForSize(cols, b.size);
      for (const l of wrap(toPrintable(b.text), width))
        out.push({ text: alignLine(l, width, b.align), bold: b.bold, size: b.size, invert: b.invert });
    } else if (b.t === 'row') {
      for (const l of rowLines(toPrintable(b.left), toPrintable(b.right), colsForSize(cols, b.size)))
        out.push({ text: l, bold: b.bold, size: b.size });
    } else if (b.t === 'divider') out.push({ text: (b.char ?? '-').repeat(cols), divider: true });
    else if (b.t === 'feed') for (let i = 0; i < Math.min(b.lines, 2); i++) out.push({ text: '' });
    else if (b.t === 'cut') out.push({ text: '', cut: true });
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Full HTML document sized for a thermal roll, for the browser print path. */
export function receiptHtml(pages: Block[][], width: PaperWidth, title: string): string {
  const cols = columnsFor(width);
  const printable = width === 58 ? 48 : 72; // mm of printable width
  const fontMm = (printable / (cols * 0.6)).toFixed(3);
  const body = pages
    .map((blocks) =>
      styledLines(blocks, cols)
        .filter((l) => !l.cut)
        .map((l) => {
          const cls = [l.bold && 'b', l.size === 'tall' && 't', l.size === 'big' && 'g', l.invert && 'i'].filter(Boolean).join(' ');
          return `<div class="l ${cls}">${esc(l.text) || '&nbsp;'}</div>`;
        })
        .join(''),
    )
    .map((p) => `<section>${p}</section>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page { size: ${width}mm auto; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${printable}mm; margin: 0 auto; padding: 2mm 0; font-family: 'Courier New', Courier, monospace; font-size: ${fontMm}mm; }
.l { white-space: pre; line-height: 1.25; overflow: hidden; }
.b { font-weight: 700; }
.t { transform: scaleY(2); transform-origin: top; margin-bottom: 1.25em; }
.g { font-size: 2em; line-height: 1.15; }
.i { background: #000; color: #fff; }
section { page-break-after: always; break-after: page; }
section:last-child { page-break-after: auto; break-after: auto; }
</style></head><body>${body}</body></html>`;
}
