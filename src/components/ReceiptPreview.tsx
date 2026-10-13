import type { PaperWidth } from '../db/types';
import { styledLines } from '../printing/html';
import { columnsFor, type Block } from '../printing/receipt';

/** On-screen copy of a slip, using exactly the same layout as the printer. */
export default function ReceiptPreview({ blocks, width = 80 }: { blocks: Block[]; width?: PaperWidth }) {
  const lines = styledLines(blocks, columnsFor(width)).filter((l) => !l.cut);
  return (
    <div className="receipt" aria-label="Slip preview">
      <pre>
        {lines.map((l, i) => (
          <div key={i} className={[l.bold && 'b', l.size === 'big' && 'g', l.invert && 'i'].filter(Boolean).join(' ')}>
            {l.text || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}
