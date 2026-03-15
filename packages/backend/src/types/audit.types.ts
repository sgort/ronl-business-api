export interface AuditLogEntry {
  timestamp: Date;
  tenantId: string;
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  result: 'success' | 'failure' | 'error';
  errorMessage?: string;
  requestId?: string;
}
