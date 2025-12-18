import { Router } from 'express'
import { getRecord, updateRecord } from '../services/smartsuite.js'
import { transformContent, translateContent, generateQuestions } from '../services/claude.js'

const router = Router()

router.post('/transform/:moduleId', async (req, res) => {
  try {
    const module = await getRecord('modules', req.params.moduleId)
    
    if (!module.original_content) {
      return res.status(400).json({ error: 'No content to process' })
    }

    const processed = await transformContent(module.original_content)
    
    await updateRecord('modules', req.params.moduleId, {
      processed_content: processed,
      status: 'ready'
    })

    res.json({ success: true, processed })
  } catch (error) {
    console.error('Transform error:', error)
    res.status(500).json({ error: String(error) })
  }
})

router.post('/translate', async (req, res) => {
  try {
    const { content, language } = req.body

    if (!content || !language) {
      return res.status(400).json({ error: 'Content and language required' })
    }

    const translated = await translateContent(content, language)
    res.json({ translated })
  } catch (error) {
    console.error('Translate error:', error)
    res.status(500).json({ error: String(error) })
  }
})

router.post('/questions', async (req, res) => {
  try {
    const { content, language = 'en' } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Content required' })
    }

    const questions = await generateQuestions(content, language)
    res.json({ questions })
  } catch (error) {
    console.error('Questions error:', error)
    res.status(500).json({ error: String(error) })
  }
})

export default router
