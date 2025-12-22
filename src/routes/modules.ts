import { Router } from 'express'
import { requireAuth } from '@clerk/express'
import multer from 'multer'
import pdf from 'pdf-parse'
import { getRecords, getRecord, createRecord, updateRecord } from '../services/smartsuite.js'
import { logAudit } from '../services/audit.js'
import { validate } from '../middleware/validate.js'
import { createModuleSchema, updateModuleSchema } from '../schemas/index.js'
import { getUserId } from '../middleware/auth.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

const MAX_CONTENT_LENGTH = 100000

// Field ID mapping
const FIELDS = {
  original_content: 'sbd46df988',
  processed_content: 'sde7e5250a',
  questions: 'sceb501715',
  qr_code: 's4ad3aec2f',
  created_on: 'sc8d4acbb6'
}

// File upload endpoint - extracts text from .txt or .pdf
router.post('/upload', requireAuth(), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const { originalname, buffer, mimetype } = req.file
    let content = ''

    if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
      const pdfData = await pdf(buffer)
      content = pdfData.text
    } else if (mimetype === 'text/plain' || originalname.endsWith('.txt')) {
      content = buffer.toString('utf-8')
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Use .txt or .pdf' })
    }

    const trimmed = content.trim()
    const truncated = trimmed.length > MAX_CONTENT_LENGTH 
      ? trimmed.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated]' 
      : trimmed

    console.log(`File parsed: ${trimmed.length} chars, truncated to: ${truncated.length} chars`)

    res.json({ 
      filename: originalname,
      content: truncated
    })
  } catch (error) {
    console.error('File upload error:', error)
    res.status(500).json({ error: 'Failed to parse file' })
  }
})

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
    const userId = getUserId(req)
    
    // Truncate content to SmartSuite's limit
    let originalContent = req.body.original_content || ''
    if (originalContent.length > MAX_CONTENT_LENGTH) {
      originalContent = originalContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated]'
    }
    
    // Map to SmartSuite field IDs
    const record = {
      title: req.body.title,
      [FIELDS.original_content]: originalContent,
      [FIELDS.processed_content]: req.body.processed_content || '',
      [FIELDS.questions]: req.body.questions || '',
      [FIELDS.qr_code]: '',
      [FIELDS.created_on]: {
        date: new Date().toISOString(),
        include_time: true
      },
      status: { value: 'processing', updated_on: null }
    }
    
    console.log('Creating module, content length:', originalContent.length)
    const data = await createRecord('modules', record)
    console.log('Module created:', data.id)
    
    // Update with QR code URL
    await updateRecord('modules', data.id, {
      [FIELDS.qr_code]: `https://clearproof.co.uk/verify/${data.id}`
    })
    
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
    
    // Map fields to SmartSuite IDs
    const record: Record<string, unknown> = {}
    if (req.body.title) record.title = req.body.title
    if (req.body.original_content) {
      let content = req.body.original_content
      if (content.length > MAX_CONTENT_LENGTH) {
        content = content.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated]'
      }
      record[FIELDS.original_content] = content
    }
    if (req.body.processed_content) record[FIELDS.processed_content] = req.body.processed_content
    if (req.body.questions) record[FIELDS.questions] = req.body.questions
    if (req.body.qr_code) record[FIELDS.qr_code] = req.body.qr_code
    if (req.body.status) record.status = { value: req.body.status, updated_on: null }
    
    const data = await updateRecord('modules', req.params.id, record)
    
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

export default router
