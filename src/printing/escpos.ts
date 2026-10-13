/**
 * Minimal ESC/POS encoder covering the commands supported by virtually all
 * 58/80 mm thermal receipt printers (Epson TM series and compatibles).
 */
import { alignLine, colsForSize, rowLines, toPrintable, wrap, type Block, type TextSize } from './receipt';

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const SIZE_BYTE: Record<TextSize, number> = { normal: 0x00, tall: 0x01, big: 0x11 };

class ByteWriter {
  private parts: number[] = [];
  raw(...bytes: number[]) {
    this.parts.push(...bytes);
    return this;
  }
  text(s: string) {
    for (let i = 0; i < s.length; i++) this.parts.push(s.charCodeAt(i) & 0x7f);
    return this;
  }
  bytes() {
    return Uint8Array.from(this.parts);
  }
}

export const CMD = {
  init: [ESC, 0x40],
  alignLeft: [ESC, 0x61, 0],
  boldOn: [ESC, 0x45, 1],
  boldOff: [ESC, 0x45, 0],
  invertOn: [GS, 0x42, 1],
  invertOff: [GS, 0x42, 0],
  size: (s: TextSize) => [GS, 0x21, SIZE_BYTE[s]],
  feed: (n: number) => [ESC, 0x64, Math.max(0, Math.min(255, n))],
  cut: [GS, 0x56, 0x42, 0x00], // feed to cutter and partial cut
};

/**
 * Text alignment is done with spaces (not ESC a) so the output is identical
 * on printers with quirky alignment support and in the HTML preview.
 */
export function encodeEscPos(blocks: Block[], cols: number, copies = 1): Uint8Array {
  const w = new ByteWriter();
  for (let c = 0; c < Math.max(1, copies); c++) {
    w.raw(...CMD.init, ...CMD.alignLeft);
    for (const b of blocks) {
      switch (b.t) {
        case 'text': {
          const size = b.size ?? 'normal';
          const width = colsForSize(cols, size);
          w.raw(...CMD.size(size));
          if (b.bold) w.raw(...CMD.boldOn);
          if (b.invert) w.raw(...CMD.invertOn);
          for (const line of wrap(toPrintable(b.text), width)) w.text(alignLine(line, width, b.align)).raw(LF);
          if (b.invert) w.raw(...CMD.invertOff);
          if (b.bold) w.raw(...CMD.boldOff);
          w.raw(...CMD.size('normal'));
          break;
        }
        case 'row': {
          const size = b.size ?? 'normal';
          w.raw(...CMD.size(size));
          if (b.bold) w.raw(...CMD.boldOn);
          for (const line of rowLines(toPrintable(b.left), toPrintable(b.right), colsForSize(cols, size)))
            w.text(line).raw(LF);
          if (b.bold) w.raw(...CMD.boldOff);
          w.raw(...CMD.size('normal'));
          break;
        }
        case 'divider':
          w.text((b.char ?? '-').repeat(cols)).raw(LF);
          break;
        case 'feed':
          w.raw(...CMD.feed(b.lines));
          break;
        case 'cut':
          w.raw(...CMD.cut);
          break;
      }
    }
  }
  return w.bytes();
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}
