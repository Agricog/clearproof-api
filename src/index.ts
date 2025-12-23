import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { clerkMiddleware } from '@clerk/express'
import { generalLimiter } from './middleware/rateLimit.js'
import modulesRouter from './routes/modules.js'
import workersRouter from './routes/workers.js'
import verificationsRouter from './routes/verifications.js'
import processRouter from './routes/process.js'
import billingRouter, { stripeWebhook } from './routes/billing.js'

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = [
  'http://localhost:5173',
  'https://clearproof.co.uk',
  'https://www.clearproof.co.uk'
]

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", ...allowedOrigins],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}))

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}))

// Stripe webhook needs raw body - must be before express.json()
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook)

app.use(express.json({ limit: '10mb' }))
app.use(clerkMiddleware())
app.use(generalLimiter)
app.set('trust proxy', 1)

app.use('/api/modules', modulesRouter)
app.use('/api/workers', workersRouter)
app.use('/api/verifications', verificationsRouter)
app.use('/api/process', processRouter)
app.use('/api/billing', billingRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
