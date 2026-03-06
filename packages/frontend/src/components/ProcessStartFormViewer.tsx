import { Form } from '@bpmn-io/form-js';
import '@bpmn-io/form-js/dist/assets/form-js.css';
import { useEffect, useRef, useState } from 'react';

import { businessApi } from '../services/api';

type FormStatus = 'loading' | 'ready' | 'no-form' | 'error';

interface ProcessStartFormViewerProps {
  processKey: string;
  initialData?: Record<string, unknown>;
  onStarted: (dossier: string) => void;
  onError: () => void;
}

export default function ProcessStartFormViewer({
  processKey,
  initialData,
  onStarted,
  onError,
}: ProcessStartFormViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<InstanceType<typeof Form> | null>(null);
  const [status, setStatus] = useState<FormStatus>('loading');
  const [submitting, setSubmitting] = useState(false);

  const onStartedRef = useRef(onStarted);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onStartedRef.current = onStarted;
  }, [onStarted]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const res = await businessApi.process.startForm(processKey);

        if (cancelled || !containerRef.current) return;

        if (!res.success || !res.data) {
          setStatus('no-form');
          return;
        }

        const form = new Form({ container: containerRef.current });
        formRef.current = form;

        await form.importSchema(res.data, initialData ?? {});

        form.on(
          'submit',
          async ({
            data,
            errors,
          }: {
            data: Record<string, unknown>;
            errors: Record<string, unknown>;
          }) => {
            if (Object.keys(errors).length > 0) return;
            setSubmitting(true);
            try {
              const startRes = await businessApi.process.start(processKey, data);
              if (startRes.success) {
                const dossier =
                  (startRes.data as { businessKey?: string; processInstanceId?: string })
                    ?.businessKey ??
                  (startRes.data as { processInstanceId?: string })?.processInstanceId ??
                  '—';
                onStartedRef.current(dossier);
              } else {
                onErrorRef.current();
              }
            } catch {
              onErrorRef.current();
            } finally {
              setSubmitting(false);
            }
          }
        );

        if (!cancelled) setStatus('ready');
      } catch (err: unknown) {
        if (cancelled) return;
        const httpStatus = (err as { response?: { status?: number } })?.response?.status;
        setStatus(httpStatus === 404 || httpStatus === 415 ? 'no-form' : 'error');
      }
    };

    init();

    return () => {
      cancelled = true;
      formRef.current?.destroy();
      formRef.current = null;
    };
  }, [processKey, initialData]);

  return (
    <div className="space-y-3">
      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          Formulier laden…
        </div>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-600">Formulier kon niet worden geladen.</p>
      )}
      {status === 'no-form' && (
        <p className="text-sm text-gray-500">Geen formulier beschikbaar voor dit proces.</p>
      )}
      <div ref={containerRef} className={status === 'ready' ? 'fjs-container' : 'hidden'} />
      {submitting && status === 'ready' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          Aanvraag indienen…
        </div>
      )}
    </div>
  );
}
