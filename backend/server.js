/**
 * Warranto API server.
 *
 * Start it with (from the backend folder):
 *   npm run dev   — nodemon, restarts on changes
 *   npm start     — plain node
 *
 * Configuration comes from backend/.env (see backend/.env.example).
 * The server still starts if MongoDB is unreachable — health endpoints then
 * report the degraded state and data endpoints answer a clear 503.
 */

const path = require('path')

// Load backend/.env regardless of the current working directory.
// dotenv never overwrites variables that already exist in the environment.
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true })

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')

const { connectDB, disconnectDB, getDbStatus } = require('./config/db')
const { notFound, errorHandler } = require('./middleware/errorMiddleware')
const authRoutes = require('./routes/authRoutes')
const productRoutes = require('./routes/productRoutes')
const reminderEmailRoutes = require('./routes/reminderEmailRoutes')
const reminderRoutes = require('./routes/reminderRoutes')
const reminderScheduler = require('./lib/reminderScheduler')
const calendarController = require('./controllers/calendarController')
const { protect, requireDb } = require('./middleware/authMiddleware')
const billRoutes = require('./routes/billRoutes')
const taskRoutes = require('./routes/taskRoutes')
const serviceRoutes = require('./routes/serviceRoutes')
const scanRoutes = require('./routes/scanRoutes')

let reminderSchedulerHandle = null

const app = express()

// Behind Render's proxy: trust the first hop so req.ip / secure cookies reflect
// the real client instead of the proxy.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1)
}

// Security headers. cross-origin resource policy is relaxed so the Vite dev
// server on another port can read the JSON responses.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

// CORS. CLIENT_URL may list several comma-separated origins so a deployment
// can allow the Vercel frontend and keep a local origin for smoke tests.
// Set CLIENT_URL to the deployed frontend origin in Render. Entries may contain
// `*` as a wildcard (e.g. `https://*.vercel.app`) to allow the production alias
// and every preview deployment at once — see lib/corsOrigins.js.
// Requests without an Origin header (curl, Postman, tests) are always allowed.
const {
  buildOriginMatcher,
} = require('./lib/corsOrigins')

const { isAllowedOrigin } = buildOriginMatcher(process.env.CLIENT_URL || 'http://localhost:5173', {
  isProduction: process.env.NODE_ENV === 'production',
})

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isAllowedOrigin(origin)) return callback(null, true)
      return callback(null, false)
    },
    // Authentication uses a Bearer JWT in the Authorization header — the app
    // never relies on cookies, so credentialed CORS requests are not enabled.
    credentials: false,
  }),
)

// JSON body parsing (1 MB limit). JSON syntax errors reach the central
// error handler and answer 400 with a readable message.
app.use(express.json({ limit: '1mb' }))

// Lightweight request log — method and path only, never bodies or tokens.
if (process.env.NODE_ENV !== 'test') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`)
    next()
  })
}

// ---------------------------------------------------------------------------
// Health endpoints — no secrets, safe to expose.
// ---------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'Warranto API',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/health/db', (_req, res) => {
  const db = getDbStatus()
  res.json({
    success: true,
    status: db.connected ? 'ok' : 'degraded',
    connected: db.connected,
    state: db.state,
    database: db.database,
  })
})

// ---------------------------------------------------------------------------
// Feature routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/bills', billRoutes)
app.use('/api/tasks', taskRoutes)
app.use('/api/reminders', reminderRoutes)
app.use('/api/reminders/email', reminderEmailRoutes)
app.use('/api/services', serviceRoutes)
app.use('/api/scan', scanRoutes)
app.get('/api/calendar/events', protect, requireDb, calendarController.getCalendarEvents)

// Not-found and centralized error handling (always last).
app.use(notFound)
app.use(errorHandler)

const PORT = Number(process.env.PORT) || 5000

/**
 * Reports missing configuration once at startup. Names only — never values.
 * Missing variables are not fatal: the server still starts so the health
 * endpoints can explain what is wrong.
 */
function reportConfig() {
  const required = ['MONGODB_URI', 'JWT_SECRET', 'CLIENT_URL']
  const missing = required.filter((key) => !String(process.env[key] || '').trim())
  if (!missing.length) return

  console.warn(
    `[config] Missing environment variable(s): ${missing.join(', ')} — see backend/.env.example.`,
  )
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[config] In production set MONGODB_URI, JWT_SECRET and CLIENT_URL (the deployed frontend origin) in the Render dashboard.',
    )
  }
}

/** Starts the API: connect to MongoDB (best effort), then listen. */
async function startServer() {
  reportConfig()
  const connected = await connectDB()
  if (!connected) {
    console.warn('[server] Starting without a database connection — see the [db] messages above.')
  }

  const server = app.listen(PORT, () => {
    console.log(`[server] Warranto API listening on http://localhost:${PORT}`)
    console.log(`[server] Health check:  http://localhost:${PORT}/api/health`)
    console.log(`[server] Database status: http://localhost:${PORT}/api/health/db`)
  })

  // Start the reminder scheduler only once the database is reachable.
  // If SMTP is not configured, the scheduler stays idle and logs a clear reason.
  if (connected) {
    reminderSchedulerHandle = reminderScheduler.startScheduler(server)
  }

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `[server] Port ${PORT} is already in use. Stop the other process or set PORT in backend/.env.`,
      )
    } else {
      console.error(`[server] Failed to start: ${error.message}`)
    }
    process.exit(1)
  })

  // Graceful shutdown: stop the scheduler and accepting connections, then
  // close MongoDB.
  const shutdown = (signal) => {
    console.log(`\n[server] ${signal} received — shutting down gracefully...`)
    if (reminderSchedulerHandle?.task && typeof reminderSchedulerHandle.task.stop === 'function') {
      reminderSchedulerHandle.task.stop()
    }
    server.close(async () => {
      await disconnectDB()
      process.exit(0)
    })
    // Force exit if in-flight requests hang.
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  return server
}

// Keep the process alive on unexpected rejections, with a visible log line.
process.on('unhandledRejection', (reason) => {
  console.error(
    '[server] Unhandled promise rejection:',
    reason instanceof Error ? reason.message : reason,
  )
})

// Only run when executed directly (node server.js), not when imported by tests.
if (require.main === module) {
  startServer()
}

module.exports = { app, startServer }
