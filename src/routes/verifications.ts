import { Router } from 'express'
import { requireAuth } from '@clerk/express'
import { getRecords, getRecord, createRecord } from '../services/smartsuite.js'
import { logAudit } from '../services/audit.js'
import { validate } from '../middleware/validate.js'
import { createVerificationSchema } from '../schemas/index.js'

const router = Router()

// Field ID mapping
const FIELDS = {
  module: 's31291a1f8',
  worker: 's124b3759e',
  language_used: 'sdf057bfc7',
  answers: 'sb8efe66b2',
  score: 's3c84ba4fe',
  passed: 'se4e7a05e3',
  completed_at: 's8664c0809',
  ip_address: 'scaaea2ee3'
}

router.get('/', requireAuth(), async (req, res) => {
  try {
    const data = await getRecords('verifications')
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.get('/:id', requireAuth(), async (req, res) => {
  try {
    const data = await getRecord('verifications', req.params.id)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.post('/', validate(createVerificationSchema), async (req, res) => {
  try {
    const record = {
      title: `${req.body.worker_name} - ${req.body.worker_id}`,
      [FIELDS.module]: req.body.module_id ? [req.body.module_id] : [],
      [FIELDS.language_used]: req.body.language_used || '',
      [FIELDS.answers]: req.body.answers || '',
      [FIELDS.score]: req.body.score || 0,
      [FIELDS.completed_at]: {
        date: req.body.completed_at || new Date().toISOString(),
        include_time: true
      },
      [FIELDS.ip_address]: req.ip || ''
    }

    const data = await createRecord('verifications', record)

    await logAudit({
      userId: null,
      action: 'verification.create',
      resource: 'verifications',
      resourceId: data.id,
      ip: req.ip || null,
      details: {
        module_id: req.body.module_id,
        worker_name: req.body.worker_name,
        score: req.body.score,
        passed: req.body.passed
      }
    })

    res.json(data)
  } catch (error) {
    console.error('Verification create error:', error)
    res.status(500).json({ error: String(error) })
  }
})

export default router
