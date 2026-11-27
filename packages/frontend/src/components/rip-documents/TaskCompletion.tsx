/**
 * A task's form with its "Documenten bij deze taak" block above it. Used by
 * the Infra-board task panel and the caseworker inbox, so both refuse to
 * complete a task while a linked document, figure or kredietcheck answer is
 * missing, and both send the same variables.
 */
import { useCallback, useState } from 'react';
import type { Task } from '@ronl/shared';
import TaskFormViewer from '../CaseworkerDashboard/TaskFormViewer';
import type { MissingItem } from '../../services/rip-documents.types';
import TaskDocuments, { type TaskDocumentsState } from './TaskDocuments';

interface Props {
  task: Pick<Task, 'id' | 'processInstanceId' | 'taskDefinitionKey'>;
  variables: Record<string, unknown> | null;
  onCompleted: () => void;
  onError: () => void;
}

const EMPTY: TaskDocumentsState = { blockedText: null, variables: {} };

export default function TaskCompletion({ task, variables, onCompleted, onError }: Props) {
  const [docState, setDocState] = useState<TaskDocumentsState>(EMPTY);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [serverMissing, setServerMissing] = useState<MissingItem[] | null>(null);

  const onState = useCallback((s: TaskDocumentsState) => {
    setDocState(s);
    setServerMissing(null);
  }, []);

  return (
    <>
      <TaskDocuments
        key={task.id}
        task={task}
        formData={formData}
        serverMissing={serverMissing}
        onState={onState}
      />
      <TaskFormViewer
        taskId={task.id}
        variables={variables}
        extraVariables={docState.variables}
        blockedText={docState.blockedText}
        onFormData={setFormData}
        onMissing={setServerMissing}
        onCompleted={onCompleted}
        onError={onError}
      />
    </>
  );
}
