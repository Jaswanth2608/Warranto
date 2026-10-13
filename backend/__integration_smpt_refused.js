'use strict'

const { app } = require('./server')
const { signToken } = require('./middleware/authMiddleware')
const { connectDB, disconnectDB } = require('./config/db')
const Reminder = require('./models/Reminder')
const Product = require('./models/Product')
const User = require('./models/User')

let base
const server = app.listen(0, () => {
  const addr = server.address()
  if (!addr || typeof addr !== 'object' || !addr.port) { server.close(); return }
  base = 'http://127.0.0.1:' + addr.port
})

const post = (path, body, token) =>
  fetch(new Request(
    (base.endsWith('/') ? base.slice(0, -1) : base) + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {})
      },
      body: JSON.stringify(body ?? {})
    }
  )).then(res => res.json().then(data => ({ status: res.status, data })))

const email = `user+${Date.now()}@example.example`

;(async () => {
  await new Promise(r => setTimeout(r, 200))
  await connectDB()

  process.env.MAIL_MODE = 'smtp'
  process.env.SMTP_HOST = 'localhost'
  process.env.SMTP_PORT = '2525'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'u'
  process.env.SMTP_PASS = 'p'
  process.env.MAIL_FROM = 'noreply@example.example'
  process.env.MAIL_TEST_TO = email

  const alice = await User.create({ fullName:'Alice', email, password:'x' })
  const token = signToken(alice._id.toString())

  const products = await Product.insertMany([
    {
      user: alice._id.toString(),
      name: 'T',
      brand: 't',
      category: 'electronics',
      purchaseDate: '2026-02-01',
      purchasePrice: 100,
      warrantyMonths: 12
    }
  ])

  const reminder = await Reminder.createReminder({
    userId: alice._id.toString(),
    product: products[0]._id.toString(),
    targetMilestone: 90,
    targetDate: new Date()
  })

  const res = await post('/api/reminders/email/send-test/' + reminder._id.toString(), {}, token)
  const bodySnip = String(JSON.stringify(res.data)).slice(0, 600)
  console.log(JSON.stringify(
    { smtp_refused_response: { status: res.status, body_snippet: bodySnip } },
    null,
    2
  ))

  server.close()
  await disconnectDB()
})().catch(err => { console.error(err); server.close(); process.exit(1) })
