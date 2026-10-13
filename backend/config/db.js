/**
 * MongoDB connection helper.
 * Reads the connection string from process.env.MONGODB_URI — credentials are
 * never hardcoded and never printed (any "user:pass@" segment is masked).
 */

const mongoose = require('mongoose')

// Fail fast with a clear error instead of silently buffering queries for 10s
// when the database is unreachable. This lets the API return a helpful 503.
mongoose.set('bufferCommands', false)

/** Masks credentials embedded in a connection string before logging. */
function sanitize(message) {
  return String(message).replace(/\/\/[^@\s]*@/g, '//***@')
}

/**
 * Connects to MongoDB. Returns true on success, false otherwise.
 * Never throws — the server still starts in a degraded state so the health
 * endpoints can explain what is missing.
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI

  if (!uri || !uri.trim()) {
    console.warn('[db] MONGODB_URI is not set.')
    console.warn('[db] Copy backend/.env.example to backend/.env and add your MongoDB Atlas connection string.')
    console.warn('[db] The API will start, but data endpoints will answer 503 until the database is connected.')
    return false
  }

  if (!/^mongodb(\+srv)?:\/\//.test(uri.trim())) {
    console.error('[db] MONGODB_URI must start with mongodb:// or mongodb+srv:// — check backend/.env.')
    return false
  }

  try {
    await mongoose.connect(uri.trim(), { serverSelectionTimeoutMS: 8000 })
    // The database name is not a secret; the URI itself is never logged.
    console.log(`[db] Connected to MongoDB database "${mongoose.connection.name}"`)
    return true
  } catch (error) {
    console.error(`[db] Could not connect to MongoDB: ${sanitize(error.message)}`)
    console.error('[db] Check your Atlas network access (IP allowlist), username and password.')
    return false
  }
}

/** Closes the connection cleanly during shutdown. */
async function disconnectDB() {
  try {
    await mongoose.disconnect()
    console.log('[db] MongoDB connection closed.')
  } catch (error) {
    console.error(`[db] Error while closing MongoDB connection: ${sanitize(error.message)}`)
  }
}

const DB_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
}

/** Safe status object for the /api/health/db endpoint — no credentials. */
function getDbStatus() {
  const readyState = mongoose.connection.readyState
  return {
    connected: readyState === 1,
    state: DB_STATES[readyState] || 'unknown',
    database: mongoose.connection.name || null,
  }
}

module.exports = { connectDB, disconnectDB, getDbStatus }
