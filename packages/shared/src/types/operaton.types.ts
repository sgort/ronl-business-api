/**
 * Shared Operaton BPMN/DMN Types
 */

export interface OperatonVariable {
  value: unknown;
  type: 'String' | 'Integer' | 'Long' | 'Double' | 'Boolean' | 'Json' | 'Null';
  valueInfo?: Record<string, unknown>;
}

export interface ProcessStartRequest {
  businessKey?: string;
  variables: Record<string, OperatonVariable>;
}

export interface ProcessInstance {
  id: string;
  definitionId: string;
  businessKey: string;
  ended: boolean;
  suspended: boolean;
  tenantId?: string;
}

export interface Task {
  id: string;
  name: string;
  assignee?: string;
  created: string;
  due?: string;
  description?: string;
  executionId: string;
  processDefinitionId: string;
  processDefinitionKey?: string;
  processInstanceId: string;
  taskDefinitionKey: string;
  suspended: boolean;
  formKey?: string;
  tenantId?: string;
}

export interface DecisionRequest {
  variables: Record<string, OperatonVariable>;
}

export interface DecisionResult {
  [key: string]: OperatonVariable;
}

export interface ProcessStatusResponse {
  processInstanceId: string;
  definitionId: string;
  businessKey: string;
  status: 'active' | 'suspended' | 'ended';
  ended: boolean;
  suspended: boolean;
}

export interface HistoricTask {
  id: string;
  name: string;
  assignee: string | null;
  taskDefinitionKey: string;
  processDefinitionKey: string | null;
  processInstanceId: string;
  businessKey: string | null;
  startTime: string;
  endTime: string;
  duration: number;
}

/**
 * A single step in a process instance's activity history (Operaton
 * /history/activity-instance). Covers user tasks, service/external tasks,
 * decisions, gateways and events — i.e. everything the engine executed,
 * including the automated steps a caseworker never sees in the task inbox.
 */
export interface ActivityHistoryItem {
  id: string;
  activityId: string;
  activityName: string | null;
  /** Operaton activity type, e.g. userTask, serviceTask, exclusiveGateway, startEvent. */
  activityType: string;
  assignee: string | null;
  startTime: string;
  /** null while the step is still running. */
  endTime: string | null;
  durationInMillis: number | null;
  canceled: boolean;
}
