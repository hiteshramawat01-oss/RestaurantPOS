/**
 * Browser print path: opens the system print dialog for an HTML page sized
 * to the thermal roll. On Android this needs a print service that knows the
 * printer (the vendor's plugin, Mopria, or an app such as RawBT). The
 * browser cannot tell us whether paper actually came out, so callers must
 * ask staff to confirm.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(frame);
    const cleanup = () => setTimeout(() => frame.remove(), 60_000);
    try {
      const doc = frame.contentDocument;
      if (!doc) throw new Error('Could not prepare print page.');
      doc.open();
      doc.write(html);
      doc.close();
      const go = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
          resolve();
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        } finally {
          cleanup();
        }
      };
      // Give the layout engine a moment to apply @page sizing.
      setTimeout(go, 150);
    } catch (e) {
      frame.remove();
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
