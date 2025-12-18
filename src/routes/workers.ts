import { Router } from 'express'
import { getRecords, getRecord, createRecord, updateRecord } from '../services/smartsuite.js'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const data = await getRecords('workers')
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const data = await getRecord('workers', req.params.id)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.post('/', async (req, res) => {
  try {
    const data = await createRecord('workers', req.body)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const data = await updateRecord('workers', req.params.id, req.body)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

export default router
