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
