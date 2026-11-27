import { Form } from '@bpmn-io/form-js';
import '@bpmn-io/form-js/dist/assets/form-js.css';
import { useEffect, useRef, useState } from 'react';

import { businessApi } from '../../services/api';
import type { MissingItem } from '../../services/rip-documents.types';

type FormStatus = 'loading' | 'ready' | 'no-form' | 'error';

interface TaskFormViewerProps {
  taskId: string;
  variables: Record<string, unknown> | null;
  onCompleted: () => void;
  onError: () => void;
  /** Sent with the completion on top of the form's own data (linked-document figures, the kredietcheck). */
  extraVariables?: Record<string, unknown>;
  /** What is still needed before the task may close; submitting is refused while set. */
  blockedText?: string | null;
  /** The form's current values, on load and on every change. */
  onFormData?: (data: Record<string, unknown>) => void;
  /** The server refused with 422 LINKED_DOCUMENT_MISSING: its list. */
  onMissing?: (missing: MissingItem[]) => void;
}

/** The missing list of a 422 LINKED_DOCUMENT_MISSING, or null for any other failure. */
function missingFrom(err: unknown): MissingItem[] | null {
  const data = (err as { response?: { data?: { code?: string; missing?: unknown } } })?.response
    ?.data;
  return data?.code === 'LINKED_DOCUMENT_MISSING' && Array.isArray(data.missing)
    ? (data.missing as MissingItem[])
    : null;
}

export default function TaskFormViewer({
  taskId,
  variables,
  onCompleted,
  onError,
  extraVariables,
  blockedText,
  onFormData,
  onMissing,
}: TaskFormViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<InstanceType<typeof Form> | null>(null);
  const [status, setStatus] = useState<FormStatus>('loading');
  const [submitting, setSubmitting] = useState(false);
  const [refused, setRefused] = useState(false);

  const onCompletedRef = useRef(onCompleted);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Read when submitting rather than when the form is built, so a changed
  // figure or link never rebuilds the form and loses what was typed in it.
  const extraRef = useRef(extraVariables);
  const blockedRef = useRef(blockedText);
  const onFormDataRef = useRef(onFormData);
  const onMissingRef = useRef(onMissing);
  const taskIdRef = useRef(taskId);
  useEffect(() => {
    taskIdRef.current = taskId;
    extraRef.current = extraVariables;
    blockedRef.current = blockedText;
    onFormDataRef.current = onFormData;
    onMissingRef.current = onMissing;
    if (!blockedText) setRefused(false);
  }, [taskId, extraVariables, blockedText, onFormData, onMissing]);

  /** Completes with `data` plus the extra variables, telling a 422 apart from other failures. */
  const completeRef = useRef(async (data: Record<string, unknown>) => {
    if (blockedRef.current) {
      setRefused(true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await businessApi.task.complete(taskIdRef.current, {
        ...data,
        ...(extraRef.current ?? {}),
      });
      if (res.success) onCompletedRef.current();
      else onErrorRef.current();
    } catch (err) {
      const missing = missingFrom(err);
      if (missing && onMissingRef.current) onMissingRef.current(missing);
      else onErrorRef.current();
    } finally {
      setSubmitting(false);
    }
  });

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
        onFormDataRef.current?.({ ...(variables ?? {}) });
        form.on('changed', ({ data }: { data: Record<string, unknown> }) =>
          onFormDataRef.current?.(data)
        );

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
            await completeRef.current(data);
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
  }, [taskId, variables]); // callbacks and extras intentionally excluded — read through refs

  // Always render the container div so the ref is available to the effect
  return (
    <div className="space-y-3">
      {/* Loading state */}
      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          Formulier laden…
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <p className="text-sm text-red-600">Formulier kon niet worden geladen.</p>
      )}

      {/* No form — generic complete button */}
      {status === 'no-form' && (
        <button
          onClick={() => completeRef.current({})}
          disabled={submitting || !!blockedText}
          className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-green-700"
        >
          {submitting ? 'Bezig…' : 'Taak voltooien'}
        </button>
      )}

      {/* Form container — always in DOM so ref is available on first render */}
      <div ref={containerRef} className={status === 'ready' ? 'fjs-container' : 'hidden'} />

      {refused && blockedText && (
        <p className="text-sm text-red-700" role="alert">
          Deze taak kan nog niet worden afgerond. Nog nodig: {blockedText}.
        </p>
      )}

      {/* Submitting indicator */}
      {submitting && status === 'ready' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          Opslaan…
        </div>
      )}
    </div>
  );
}
