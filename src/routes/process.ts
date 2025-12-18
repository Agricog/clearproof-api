import { Router } from 'express'
import { requireAuth } from '@clerk/express'
import { getRecord, updateRecord } from '../services/smartsuite.js'
import { transformContent, translateContent, generateQuestions } from '../services/claude.js'
import { logAudit } from '../services/audit.js'
import { validate } from '../middleware/validate.js'
import { translateSchema, questionsSchema } from '../schemas/index.js'
import { getUserId } from '../middleware/auth.js'
import { processLimiter } from '../middleware/rateLimit.js'

const router = Router()

router.post('/transform/:moduleId', requireAuth(), processLimiter, async (req, res) => {
  try {
    const userId = getUserId(req)
    const module = await getRecord('modules', req.params.moduleId)
    
    if (!module.original_content) {
      return res.status(400).json({ error: 'No content to process' })
    }

    const processed = await transformContent(module.original_content)
    
    await updateRecord('modules', req.params.moduleId, {
      processed_content: processed,
      status: 'ready'
    })

    await logAudit({
      userId,
      action: 'process.transform',
      resource: 'modules',
      resourceId: req.params.moduleId,
      ip: req.ip || null
    })

    res.json({ success: true, processed })
  } catch (error) {
    console.error('Transform error:', error)
    res.status(500).json({ error: String(error) })
  }
})

router.post('/translate', validate(translateSchema), processLimiter, async (req, res) => {
  try {
    const { content, language } = req.body

    const translated = await translateContent(content, language)

    await logAudit({
      userId: null,
      action: 'process.translate',
      resource: 'translation',
      resourceId: null,
      ip: req.ip || null,
      details: { language }
    })

    res.json({ translated })
  } catch (error) {
    console.error('Translate error:', error)
    res.status(500).json({ error: String(error) })
  }
})

router.post('/questions', validate(questionsSchema), processLimiter, async (req, res) => {
  try {
    const { content, language = 'en' } = req.body

    const questions = await generateQuestions(content, language)
    res.json({ questions })
  } catch (error) {
    console.error('Questions error:', error)
    res.status(500).json({ error: String(error) })
  }
})

export default router
