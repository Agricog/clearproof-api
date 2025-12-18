import { Router } from 'express'
import { getRecords, getRecord, createRecord } from '../services/smartsuite.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const data = await getRecords('verifications')
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const data = await getRecord('verifications', req.params.id)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.post('/', async (req, res) => {
  try {
    const data = await createRecord('verifications', req.body)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

export default router
