import { App } from 'antd';
import { useCallback } from 'react';
import { confirmBrowserPrint, type PrintOutcome } from '../printing/printService';

export interface PrintJob {
  docType: 'kot' | 'invoice';
  id: string;
  label: string; // "KOT #12", "Bill INV-00004"
  run: () => Promise<PrintOutcome>;
}

/**
 * Runs a print job and walks staff through the result:
 * printed → toast; browser dialog → "Did it print?"; failure → Retry.
 * Resolves true only when the slip is known (or confirmed) to have printed.
 */
export function usePrintFlow() {
  const { modal, message } = App.useApp();

  const handle = useCallback(
    async (job: PrintJob, isReprint = false): Promise<boolean> => {
      let outcome: PrintOutcome;
      try {
        outcome = await job.run();
      } catch (e) {
        outcome = { status: 'failed', method: 'browser', error: e instanceof Error ? e.message : String(e) };
      }

      if (outcome.status === 'printed') {
        message.success(`${job.label} sent to the printer`);
        return true;
      }
      if (outcome.status === 'skipped') {
        message.info(outcome.reason);
        return false;
      }
      if (outcome.status === 'awaiting_confirmation') {
        return new Promise<boolean>((resolve) => {
          modal.confirm({
            title: `Did ${job.label} print?`,
            content: 'Check the printer. Answer “No” if nothing came out so it can be printed again.',
            okText: 'Yes, it printed',
            cancelText: 'No',
            centered: true,
            okButtonProps: { size: 'large' },
            cancelButtonProps: { size: 'large' },
            onOk: async () => {
              if (!isReprint) await confirmBrowserPrint(job.docType, job.id, true);
              resolve(true);
            },
            onCancel: async () => {
              if (!isReprint) await confirmBrowserPrint(job.docType, job.id, false);
              resolve(await offerRetry(job, 'The slip did not print.', isReprint));
            },
          });
        });
      }
      return offerRetry(job, outcome.error, isReprint);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modal, message],
  );

  const offerRetry = (job: PrintJob, error: string, isReprint: boolean): Promise<boolean> =>
    new Promise((resolve) => {
      modal.confirm({
        title: `${job.label} did not print`,
        content: `${error} It is saved. You can retry now or later from the Kitchen screen.`,
        okText: 'Retry',
        cancelText: 'Later',
        centered: true,
        okButtonProps: { size: 'large' },
        cancelButtonProps: { size: 'large' },
        onOk: async () => resolve(await handle(job, isReprint)),
        onCancel: () => resolve(false),
      });
    });

  return handle;
}
