import { createRecord } from './smartsuite.js'

export type AuditAction =
  | 'module.create'
  | 'module.update'
  | 'module.delete'
  | 'verification.create'
  | 'worker.create'
  | 'process.transform'
  | 'process.translate'
  | 'auth.login'
  | 'auth.logout'

interface AuditEntry {
  userId: string | null
  action: AuditAction
  resource: string
  resourceId: string | null
  ip: string | null
  details?: Record<string, unknown>
}

export async function logAudit(entry: {
  userId: string | null
  action: string
  resource: string
  resourceId: string
  ip: string | null
  details: Record<string, unknown>
}) {
  try {
    await createRecord('audit_logs', {
      title: `${entry.action} - ${entry.resourceId} - ${Date.now()}`,
      user_id: entry.userId,
      action: entry.action,
      resource: entry.resource,
      resource_id: entry.resourceId,
      ip_address: entry.ip,
      details: JSON.stringify(entry.details)
    })
  } catch (error) {
    console.error('Failed to log audit entry:', error)
  }
}
