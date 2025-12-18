import { Router } from 'express'
import { requireAuth } from '@clerk/express'
import { getRecords, getRecord, createRecord } from '../services/smartsuite.js'
import { logAudit } from '../services/audit.js'
import { validate } from '../middleware/validate.js'
import { createVerificationSchema } from '../schemas/index.js'

const router = Router()

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
    const data = await createRecord('verifications', req.body)

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
    res.status(500).json({ error: String(error) })
  }
})

export default router
