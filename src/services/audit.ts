import { createRecord } from './smartsuite.js'

const AUDIT_FIELDS = {
  user_id: 'sd4400df5f',
  action: 's2fbf046cb',
  resource: 'se5c4b6aa6',
  resource_id: 'sf3515c7f5',
  ip_address: 's7d26da42e',
  details: 's0b9cb63d0'
}

export async function logAudit(entry: {
  userId: string | null | undefined
  action: string
  resource: string
  resourceId: string | null | undefined
  ip: string | null | undefined
  details: Record<string, unknown>
}) {
  try {
    await createRecord('audit_logs', {
      title: `${entry.action} - ${entry.resourceId || 'unknown'} - ${Date.now()}`,
      [AUDIT_FIELDS.user_id]: entry.userId || '',
      [AUDIT_FIELDS.action]: entry.action,
      [AUDIT_FIELDS.resource]: entry.resource,
      [AUDIT_FIELDS.resource_id]: entry.resourceId || '',
      [AUDIT_FIELDS.ip_address]: entry.ip || '',
      [AUDIT_FIELDS.details]: JSON.stringify(entry.details)
    })
  } catch (error) {
    console.error('Failed to log audit entry:', error)
  }
}
