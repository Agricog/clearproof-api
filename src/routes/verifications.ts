import { Router } from 'express'
import { requireAuth } from '@clerk/express'
import { getRecords, getRecord, createRecord } from '../services/smartsuite.js'
import { logAudit } from '../services/audit.js'
import { validate } from '../middleware/validate.js'
import { createVerificationSchema } from '../schemas/index.js'

const router = Router()

// Verifications field IDs
const VERIFICATION_FIELDS = {
  module: 's31291a1f8',
  worker: 's124b3759e',
  language_used: 'sdf057bfc7',
  answers: 'sb8efe66b2',
  score: 's3c84ba4fe',
  passed: 'se4e7a05e3',
  completed_at: 's8664c0809',
  ip_address: 'scaaea2ee3'
}

// Workers field IDs
const WORKER_FIELDS = {
  full_name: 's7e2a81290',
  worker_id: 's2770480d5',
  phone: 'sb41d35a00',
  preferred_language: 's9e17bccf0',
  created_on: 's3cb92d18f'
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
    // 1. Create worker record first
    const workerRecord = {
      title: `${req.body.worker_name} - ${req.body.worker_id}`,
      [WORKER_FIELDS.full_name]: {
        title: '',
        first_name: req.body.worker_name || '',
        middle_name: '',
        last_name: '',
        sys_root: req.body.worker_name || ''
      },
      [WORKER_FIELDS.worker_id]: req.body.worker_id || '',
      [WORKER_FIELDS.preferred_language]: req.body.language_used || '',
      [WORKER_FIELDS.created_on]: {
        date: new Date().toISOString(),
        include_time: true
      }
    }

    const worker = await createRecord('workers', workerRecord)

    // 2. Create verification record with worker linked
    const verificationRecord = {
      title: `${req.body.worker_name} - ${req.body.worker_id}`,
      [VERIFICATION_FIELDS.module]: req.body.module_id ? [req.body.module_id] : [],
      [VERIFICATION_FIELDS.worker]: [worker.id],
      [VERIFICATION_FIELDS.language_used]: req.body.language_used || '',
      [VERIFICATION_FIELDS.answers]: req.body.answers || '',
      [VERIFICATION_FIELDS.score]: req.body.score || 0,
      [VERIFICATION_FIELDS.completed_at]: {
        date: req.body.completed_at || new Date().toISOString(),
        include_time: true
      },
      [VERIFICATION_FIELDS.ip_address]: req.ip || ''
    }

    const verification = await createRecord('verifications', verificationRecord)

    await logAudit({
      userId: null,
      action: 'verification.create',
      resource: 'verifications',
      resourceId: verification.id,
      ip: req.ip || null,
      details: {
        module_id: req.body.module_id,
        worker_name: req.body.worker_name,
        worker_id: worker.id,
        score: req.body.score,
        passed: req.body.passed
      }
    })

    res.json(verification)
  } catch (error) {
    console.error('Verification create error:', error)
    res.status(500).json({ error: String(error) })
  }
})

export default router
