// server.js
const express  = require('express')
const mongoose = require('mongoose')
const cors     = require('cors')
require('dotenv').config()

const app = express()

// ── CORS ────────────────────────────────────────────────────────
const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:4173']
  : ['http://localhost:5173', 'http://localhost:4173']

app.use(cors({
  origin: (origin, cb) => {
    // Autoriser les requêtes sans origin (Postman, Render health checks…)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS bloqué pour origin: ${origin}`))
  },
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}))

// ── Middlewares ─────────────────────────────────────────────────
app.use(express.json())

// ── Routes ──────────────────────────────────────────────────────
app.use('/api/products', require('./routes/productRoutes'))
app.use('/api/orders',   require('./routes/orderRoutes'))
app.use('/api/auth',     require('./routes/authRoutes'))
app.use('/api/upload',   require('./routes/uploadRoutes'))
app.use('/api/admin',    require('./routes/adminRoutes'))
app.use('/api/payment',  require('./routes/paymentRoutes'))

// ── Health check ────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status:  'ok',
    service: 'SIOW Parfumes API',
    version: '2.0.0',
  })
})

// ── MongoDB ─────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch((err) => console.error('❌ Erreur MongoDB:', err))

// ── Démarrage ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`🚀 SIOW Parfumes API — port ${PORT}`)
})