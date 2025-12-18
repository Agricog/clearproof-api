import { Router } from 'express'
import { requireAuth } from '@clerk/express'
import { getRecords, getRecord, createRecord, updateRecord } from '../services/smartsuite.js'
import { logAudit } from '../services/audit.js'
import { validate } from '../middleware/validate.js'
import { createModuleSchema, updateModuleSchema } from '../schemas/index.js'
import { getUserId } from '../middleware/auth.js'

const router = Router()

router.get('/', requireAuth(), async (req, res) => {
  try {
    const data = await getRecords('modules')
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const data = await getRecord('modules', req.params.id)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.post('/', requireAuth(), validate(createModuleSchema), async (req, res) => {
  try {
    console.log('Creating module with:', JSON.stringify(req.body, null, 2))
    const userId = getUserId(req)
    const data = await createRecord('modules', req.body)
    console.log('Module created:', data)

    await logAudit({
      userId,
      action: 'module.create',
      resource: 'modules',
      resourceId: data.id,
      ip: req.ip || null,
      details: { title: req.body.title }
    })

    res.json(data)
  } catch (error) {
    console.error('Module create error:', error)
    res.status(500).json({ error: String(error) })
  }
})

router.patch('/:id', requireAuth(), validate(updateModuleSchema), async (req, res) => {
  try {
    const userId = getUserId(req)
    const data = await updateRecord('modules', req.params.id, req.body)

    await logAudit({
      userId,
      action: 'module.update',
      resource: 'modules',
      resourceId: req.params.id,
      ip: req.ip || null,
      details: req.body
    })

    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})
// Add this route at the bottom, before export default router
router.get('/schema', async (req, res) => {
  try {
    const response = await fetch('https://app.smartsuite.com/api/v1/applications/69441e0e081da2e01f4d9a78/', {
      headers: {
        'Authorization': `Token ${process.env.SMARTSUITE_API_KEY}`,
        'Account-Id': 'sba974gi'
      }
    })
    const data = await response.json()
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

export default router
