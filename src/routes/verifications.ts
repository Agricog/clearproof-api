import { Router } from 'express'
import { requireAuth } from '@clerk/express'
import { getRecords, getRecord, createRecord, updateRecord } from '../services/smartsuite.js'
import { logAudit } from '../services/audit.js'
import { validate } from '../middleware/validate.js'
import { createVerificationSchema } from '../schemas/index.js'
import { verificationLimiter } from '../middleware/rateLimit.js'

const router = Router()

// Verifications field IDs
const VERIFICATION_FIELDS = {
  module: 's31291a1f8',
  worker: 's124b3759e',
  language_used: 'sdf057bfc7',
  answers: 'sb8efe66b2',
  score: 's3c84ba4fe',
  passed: 'se4e7a05e3',
  completed_at: 's8664c0809',
  ip_address: 'scaaea2ee3'
}

// Workers field IDs
const WORKER_FIELDS = {
  full_name: 's7e2a81290',
  worker_id: 's2770480d5',
  phone: 'sb41d35a00',
  preferred_language: 's9e17bccf0',
  created_on: 's3cb92d18f'
}

// Subscription field IDs
const SUB_FIELDS = {
  userId: 's17078d555',
  plan: 's437c90810',
  verificationsUsed: 's1072aea3a'
}

const PLAN_LIMITS = {
  free: { modules: 1, verifications: 10 },
  starter: { modules: 5, verifications: 100 },
  professional: { modules: 20, verifications: 500 },
  enterprise: { modules: 50, verifications: 2000 }
}

// Language code to SmartSuite ID mapping - Verifications
const VERIFICATION_LANG_IDS: Record<string, string> = {
  'en': '6aUDS',
  'pl': 'Muktb',
  'ro': 'yRVjF',
  'pt': 'r2HZE',
  'uk': 'xD6t8',
  'lt': 'ci01V',
  'es': 'sDjl2',
  'bg': 'uMhn2',
  'hu': 'QBwLR',
  'hi': 'C8izU'
}

// Language code to SmartSuite ID mapping - Workers
const WORKER_LANG_IDS: Record<string, string> = {
  'en': 'XC10L',
  'pl': 'Tiq7v',
  'ro': 'w1bw5',
  'pt': '15JFJ',
  'es': 'qTtdO',
  'uk': 'BXLR5',
  'lt': 'skKFJ',
  'bg': '4w74b',
  'hu': '1Qcep',
  'hi': 'ibj9p'
}

// Check verification limit and get subscription
async function checkVerificationLimit(): Promise<{ 
  allowed: boolean
  current: number
  limit: number
  subscriptionId: string | null
}> {
  // Get the first subscription (single-tenant for now)
  const subData = await getRecords('subscriptions')
  const subscription = (subData.items || [])[0]
  
  if (!subscription) {
    // No subscription = free tier
    const verificationsData = await getRecords('verifications')
    const currentCount = (verificationsData.items || []).length
    return {
      allowed: currentCount < PLAN_LIMITS.free.verifications,
      current: currentCount,
      limit: PLAN_LIMITS.free.verifications,
      subscriptionId: null
    }
  }
  
  const plan = (subscription[SUB_FIELDS.plan] as string) || 'free'
  const limit = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS]?.verifications || 10
  const currentUsed = (subscription[SUB_FIELDS.verificationsUsed] as number) || 0
  
  return {
    allowed: currentUsed < limit,
    current: currentUsed,
    limit,
    subscriptionId: subscription.id as string
  }
}

// Increment verification usage
async function incrementVerificationUsage(subscriptionId: string, currentCount: number) {
  await updateRecord('subscriptions', subscriptionId, {
    [SUB_FIELDS.verificationsUsed]: currentCount + 1
  })
}

router.get('/', requireAuth(), async (req, res) => {
  try {
    const data = await getRecords('verifications')
    
    // Fetch all modules and workers for name resolution
    const [modulesData, workersData] = await Promise.all([
      getRecords('modules'),
      getRecords('workers')
    ])
    
    const modulesMap = new Map(modulesData.items?.map((m: { id: string; title: string }) => [m.id, m.title]) || [])
    const workersMap = new Map(workersData.items?.map((w: { id: string; title: string }) => [w.id, w.title]) || [])
    
    // Map to friendly field names
    const items = (data.items || []).map((v: Record<string, unknown>) => {
      const moduleIds = v[VERIFICATION_FIELDS.module] as string[] || []
      const workerIds = v[VERIFICATION_FIELDS.worker] as string[] || []
      const completedAt = v[VERIFICATION_FIELDS.completed_at] as { date?: string } | null
      const passed = v[VERIFICATION_FIELDS.passed] as Record<string, unknown> | null
      
      return {
        id: v.id,
        worker_name: workerIds[0] ? workersMap.get(workerIds[0]) || 'Unknown' : 'Unknown',
        module_title: moduleIds[0] ? modulesMap.get(moduleIds[0]) || 'Unknown' : 'Unknown',
        completed_at: completedAt?.date || '',
        score: v[VERIFICATION_FIELDS.score] || 0,
        passed: passed ? Object.keys(passed).length > 0 : false
      }
    })
    
    res.json({ items })
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

router.get('/:id', requireAuth(), async (req, res) => {
  try {
    const data = await getRecord('verifications', req.params.id)
    res.json(data)
  } catch (error) {
    res.status(500).json({ error: String(error) })
  }
})

// Public endpoint - rate limited + honeypot protection
router.post('/', verificationLimiter, validate(createVerificationSchema), async (req, res) => {
  try {
    // Honeypot check - if this hidden field is filled, it's a bot
    if (req.body.website || req.body.company_url) {
      console.log('Bot detected via honeypot:', req.ip)
      // Return success to not tip off the bot, but don't create record
      return res.json({ id: 'blocked', success: true })
    }

    // Time-based check - if submission is too fast (< 10 seconds), likely a bot
    const startTime = req.body._start_time
    if (startTime) {
      const elapsed = Date.now() - parseInt(startTime, 10)
      if (elapsed < 10000) {
        console.log('Bot detected via timing:', req.ip, elapsed)
        return res.json({ id: 'blocked', success: true })
      }
    }

    // Check verification limit
    const limitCheck = await checkVerificationLimit()
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: 'Verification limit reached',
        message: 'This account has reached their monthly verification limit. Please contact the site manager.',
        current: limitCheck.current,
        limit: limitCheck.limit
      })
    }

    const langCode = req.body.language_used || 'en'
    
    // 1. Create worker record first
    const workerRecord = {
      title: `${req.body.worker_name} - ${req.body.worker_id}`,
      [WORKER_FIELDS.full_name]: {
        title: '',
        first_name: req.body.worker_name || '',
        middle_name: '',
        last_name: '',
        sys_root: req.body.worker_name || ''
      },
      [WORKER_FIELDS.worker_id]: req.body.worker_id || '',
      [WORKER_FIELDS.preferred_language]: WORKER_LANG_IDS[langCode] || WORKER_LANG_IDS['en'],
      [WORKER_FIELDS.created_on]: {
        date: new Date().toISOString(),
        include_time: true
      }
    }

    const worker = await createRecord('workers', workerRecord)

    // 2. Create verification record with worker linked
    const verificationRecord = {
      title: `${req.body.worker_name} - ${req.body.worker_id}`,
      [VERIFICATION_FIELDS.module]: req.body.module_id ? [req.body.module_id] : [],
      [VERIFICATION_FIELDS.worker]: [worker.id],
      [VERIFICATION_FIELDS.language_used]: VERIFICATION_LANG_IDS[langCode] || VERIFICATION_LANG_IDS['en'],
      [VERIFICATION_FIELDS.answers]: req.body.answers || '',
      [VERIFICATION_FIELDS.score]: req.body.score || 0,
      [VERIFICATION_FIELDS.completed_at]: {
        date: req.body.completed_at || new Date().toISOString(),
        include_time: true
      },
      [VERIFICATION_FIELDS.ip_address]: req.ip || ''
    }

    const verification = await createRecord('verifications', verificationRecord)

    // 3. Increment verification usage
    if (limitCheck.subscriptionId) {
      await incrementVerificationUsage(limitCheck.subscriptionId, limitCheck.current)
    }

    await logAudit({
      userId: null,
      action: 'verification.create',
      resource: 'verifications',
      resourceId: verification.id,
      ip: req.ip || null,
      details: {
        module_id: req.body.module_id,
        worker_name: req.body.worker_name,
        worker_id: worker.id,
        score: req.body.score,
        passed: req.body.passed
      }
    })

    res.json(verification)
  } catch (error) {
    console.error('Verification create error:', error)
    res.status(500).json({ error: String(error) })
  }
})

export default router
