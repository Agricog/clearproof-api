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

// Module field IDs
const MODULE_FIELDS = {
  original_content: 'sbd46df988',
  processed_content: 'sde7e5250a',
  questions: 'sceb501715',
  qr_code: 's4ad3aec2f'
}

router.post('/transform/:moduleId', requireAuth(), processLimiter, async (req, res) => {
  try {
    const userId = getUserId(req)
    const module = await getRecord('modules', req.params.moduleId)
    
    if (!module[MODULE_FIELDS.original_content]) {
      return res.status(400).json({ error: 'No content to process' })
    }

    const processed = await transformContent(module[MODULE_FIELDS.original_content])
    const questions = await generateQuestions(processed, 'en')
    
    await updateRecord('modules', req.params.moduleId, {
      [MODULE_FIELDS.processed_content]: processed,
      [MODULE_FIELDS.questions]: JSON.stringify(questions),
      status: { value: 'complete', updated_on: null }
    })

    await logAudit({
      userId,
      action: 'process.transform',
      resource: 'modules',
      resourceId: req.params.moduleId,
      ip: req.ip || null,
      details: {}
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
      resourceId: 'n/a',
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

