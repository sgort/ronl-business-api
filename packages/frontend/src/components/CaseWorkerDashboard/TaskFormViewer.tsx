import { Form } from '@bpmn-io/form-js';
import '@bpmn-io/form-js/dist/assets/form-js.css';
import { useEffect, useRef, useState } from 'react';

import { businessApi } from '../../services/api';

type FormStatus = 'loading' | 'ready' | 'no-form' | 'error';

interface TaskFormViewerProps {
  taskId: string;
  variables: Record<string, unknown> | null;
  onCompleted: () => void;
  onError: () => void;
}

export default function TaskFormViewer({
  taskId,
  variables,
  onCompleted,
  onError,
}: TaskFormViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<InstanceType<typeof Form> | null>(null);
  const [status, setStatus] = useState<FormStatus>('loading');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const res = await businessApi.task.formSchema(taskId);
        console.log('[TaskFormViewer]', taskId, res);

        if (cancelled || !containerRef.current) return;

        if (!res.success || !res.data) {
          setStatus('no-form');
          return;
        }

        const form = new Form({ container: containerRef.current });
        formRef.current = form;

        await form.importSchema(res.data, variables ?? {});

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
              const completeRes = await businessApi.task.complete(taskId, data);
              if (completeRes.success) onCompleted();
              else onError();
            } catch {
              onError();
            } finally {
              setSubmitting(false);
            }
          }
        );

        setStatus('ready');
      } catch (err: unknown) {
        if (cancelled) return;
        // 404 = no form deployed, 415 = HTML form — both fall back to generic button
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404 || status === 415) {
          setStatus('no-form');
        } else {
          setStatus('error');
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      formRef.current?.destroy();
      formRef.current = null;
    };
  }, [taskId, variables, onCompleted, onError]);

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        Formulier laden…
      </div>
    );
  }

  if (status === 'error') {
    return <p className="text-sm text-red-600">Formulier kon niet worden geladen.</p>;
  }

  if (status === 'no-form') {
    return (
      <button
        onClick={async () => {
          setSubmitting(true);
          try {
            const res = await businessApi.task.complete(taskId, {});
            if (res.success) onCompleted();
            else onError();
          } catch {
            onError();
          } finally {
            setSubmitting(false);
          }
        }}
        disabled={submitting}
        className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-green-700"
      >
        {submitting ? 'Bezig…' : 'Taak voltooien'}
      </button>
    );
  }

  // status === 'ready' — form renders into containerRef
  return (
    <div className="space-y-3">
      <div ref={containerRef} className="fjs-container" />
      {submitting && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          Opslaan…
        </div>
      )}
    </div>
  );
}
