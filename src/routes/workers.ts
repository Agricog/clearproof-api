import { Router } from 'express'
import { requireAuth } from '@clerk/express'
import { getRecords, getRecord, createRecord, updateRecord } from '../services/smartsuite.js'
import { logAudit } from '../services/audit.js'
import { validate } from '../middleware/validate.js'
import { createWorkerSchema } from '../schemas/index.js'
import { getUserId } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth(), async (req, res) => {
  try {
    const data = await getRecords('workers')
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.get('/:id', requireAuth(), async (req, res) => {
  try {
    const data = await getRecord('workers', req.params.id)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.post('/', requireAuth(), validate(createWorkerSchema), async (req, res) => {
  try {
    const userId = getUserId(req)
    const data = await createRecord('workers', req.body)

    await logAudit({
      userId,
      action: 'worker.create',
      resource: 'workers',
      resourceId: data.id,
      ip: req.ip || null,
      details: { name: req.body.name }
    })

    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.patch('/:id', requireAuth(), async (req, res) => {
  try {
    const data = await updateRecord('workers', req.params.id, req.body)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

export default router
