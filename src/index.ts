import express from 'express'
import cors from 'cors'
import modulesRouter from './routes/modules.js'
import workersRouter from './routes/workers.js'
import verificationsRouter from './routes/verifications.js'
import processRouter from './routes/process.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use('/api/modules', modulesRouter)
app.use('/api/workers', workersRouter)
app.use('/api/verifications', verificationsRouter)
app.use('/api/process', processRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
