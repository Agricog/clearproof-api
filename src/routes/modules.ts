import { Router } from 'express'
import { requireAuth } from '@clerk/express'
import multer from 'multer'
import pdf from 'pdf-parse'
import QRCode from 'qrcode'
import { getRecords, getRecord, createRecord, updateRecord, deleteRecord } from '../services/smartsuite.js'
import { logAudit } from '../services/audit.js'
import { validate } from '../middleware/validate.js'
import { createModuleSchema, updateModuleSchema } from '../schemas/index.js'
import { getUserId } from '../middleware/auth.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })
const MAX_CONTENT_LENGTH = 100000

const FIELDS = {
  original_content: 'sbd46df988',
  processed_content: 'sde7e5250a',
  questions: 'sceb501715',
  qr_code: 's4ad3aec2f',
  created_on: 'sc8d4acbb6'
}

const SUB_FIELDS = {
  userId: 's17078d555',
  plan: 's437c90810',
  modulesUsed: 's70770f153'
}

const PLAN_LIMITS = {
  free: { modules: 1, verifications: 10 },
  starter: { modules: 5, verifications: 100 },
  professional: { modules: 20, verifications: 500 },
  enterprise: { modules: 50, verifications: 2000 }
}

async function checkModuleLimit(userId: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const subData = await getRecords('subscriptions')
  const subscription = (subData.items || []).find(
    (s: Record<string, unknown>) => s[SUB_FIELDS.userId] === userId
  )
  
  const plan = (subscription?.[SUB_FIELDS.plan] as string) || 'free'
  const limit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.modules || 1
  
  const modulesData = await getRecords('modules')
  const currentCount = (modulesData.items || []).length
  
  return {
    allowed: currentCount < limit,
    current: currentCount,
    limit
  }
}

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

router.get('/:id/qr', async (req, res) => {
  try {
    const verifyUrl = `https://clearproof.co.uk/verify/${req.params.id}`
    const qrBuffer = await QRCode.toBuffer(verifyUrl)
    
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Disposition', `attachment; filename="qr-${req.params.id}.png"`)
    res.send(qrBuffer)
  } catch (error) {
    console.error('QR generation error:', error)
    res.status(500).json({ error: 'Failed to generate QR code' })
  }
})

router.get('/', requireAuth(), async (req, res) => {
  try {
    const data = await getRecords('modules')
    
    const items = (data.items || []).map((m: Record<string, unknown>) => {
      const createdOn = m[FIELDS.created_on] as { date?: string } | null
      
      return {
        id: m.id,
        title: m.title,
        created_at: createdOn?.date || '',
        original_content: m[FIELDS.original_content] || '',
        processed_content: m[FIELDS.processed_content] || '',
        questions: m[FIELDS.questions] || '',
        qr_code: m[FIELDS.qr_code] || '',
        status: (m.status as { value?: string })?.value || 'unknown'
      }
    })
    
    res.json({ items })
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
    
    const limitCheck = await checkModuleLimit(userId)
    if (!limitCheck.allowed) {
      return res.status(403).json({ 
        error: 'Module limit reached',
        message: `You have reached your plan limit of ${limitCheck.limit} modules. Please upgrade to add more.`,
        current: limitCheck.current,
        limit: limitCheck.limit
      })
    }
    
    let originalContent = req.body.original_content || ''
    if (originalContent.length > MAX_CONTENT_LENGTH) {
      originalContent = originalContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated]'
    }
    
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
    
    await updateRecord('modules', data.id, {
      [FIELDS.qr_code]: `https://clearproof.co.uk/verify/${data.id}`
    })
    
    await logAudit({
      userId,
      action: 'module.create',
      resource: 'modules',
      resourceId: data.id,
      ip: req.ip,
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
      ip: req.ip,
      details: req.body
    })
    
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.delete('/:id', requireAuth(), async (req, res) => {
  try {
    const userId = getUserId(req)
    
    const module = await getRecord('modules', req.params.id)
    
    await deleteRecord('modules', req.params.id)
    
    await logAudit({
      userId,
      action: 'module.delete',
      resource: 'modules',
      resourceId: req.params.id,
      ip: req.ip,
      details: { title: module.title }
    })
    
    res.json({ success: true })
  } catch (error) {
    console.error('Module delete error:', error)
    res.status(500).json({ error: String(error) })
  }
})

export default router
