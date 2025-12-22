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

// Reduced limit to allow for 2 API calls per minute
const MAX_CLAUDE_CHARS = 25000

// Module field IDs
const MODULE_FIELDS = {
  original_content: 'sbd46df988',
  processed_content: 'sde7e5250a',
  questions: 'sceb501715',
  qr_code: 's4ad3aec2f'
}

function truncateForClaude(content: string): string {
  if (content.length <= MAX_CLAUDE_CHARS) return content
  return content.substring(0, MAX_CLAUDE_CHARS) + '\n\n[Content truncated for processing]'
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

router.post('/transform/:moduleId', requireAuth(), processLimiter, async (req, res) => {
  try {
    const userId = getUserId(req)
    const module = await getRecord('modules', req.params.moduleId)
    
    if (!module[MODULE_FIELDS.original_content]) {
      return res.status(400).json({ error: 'No content to process' })
    }

    const originalContent = module[MODULE_FIELDS.original_content]
    const truncatedContent = truncateForClaude(originalContent)
    
    console.log(`Processing content: ${originalContent.length} chars, truncated to: ${truncatedContent.length} chars`)

    const processed = await transformContent(truncatedContent)
    
    // Wait 60 seconds to reset rate limit before generating questions
    console.log('Waiting 60s for rate limit reset...')
    await delay(60000)
    
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
    const truncatedContent = truncateForClaude(content)
    const translated = await translateContent(truncatedContent, language)

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
    const truncatedContent = truncateForClaude(content)
    const questions = await generateQuestions(truncatedContent, language)
    res.json({ questions })
  } catch (error) {
    console.error('Questions error:', error)
    res.status(500).json({ error: String(error) })
  }
})

export default router
