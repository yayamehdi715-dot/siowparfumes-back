// routes/authRoutes.js
const express       = require('express')
const router        = express.Router()
const jwt           = require('jsonwebtoken')
const bcrypt        = require('bcryptjs')
const AdminSettings = require('../models/AdminSettings')
const { authenticateAdmin } = require('../middleware/auth')

// ─── Protection brute-force : 5 tentatives / 15 min par IP ───────────────────
const loginAttempts = new Map()

function bruteForceCheck(req, res, next) {
  const ip      = req.ip || req.headers['x-forwarded-for'] || 'unknown'
  const now     = Date.now()
  const WINDOW  = 15 * 60 * 1000 // 15 minutes
  const MAX     = 5

  let entry = loginAttempts.get(ip)

  // Réinitialiser si la fenêtre est expirée
  if (entry && entry.resetAt < now) {
    loginAttempts.delete(ip)
    entry = null
  }

  if (entry && entry.count >= MAX) {
    const remaining = Math.ceil((entry.resetAt - now) / 60000)
    return res.status(429).json({
      message: `Trop de tentatives échouées. Réessayez dans ${remaining} minute(s).`,
    })
  }

  req._loginIp = ip
  next()
}

function recordFailedAttempt(ip) {
  const now    = Date.now()
  const WINDOW = 15 * 60 * 1000
  const entry  = loginAttempts.get(ip) || { count: 0, resetAt: now + WINDOW }
  entry.count++
  loginAttempts.set(ip, entry)
}

// ─── Initialiser les credentials en DB depuis .env si 1ère utilisation ────────
async function ensureAdminExists() {
  const count = await AdminSettings.countDocuments()
  if (count === 0 && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const passwordHash = await AdminSettings.hashPassword(process.env.ADMIN_PASSWORD)
    await AdminSettings.create({ username: process.env.ADMIN_USERNAME, passwordHash })
    console.log('[Auth] Compte admin initialisé depuis les variables d\'environnement.')
  }
}

// Lancer la migration au démarrage
ensureAdminExists().catch((err) => console.error('[Auth] Erreur init admin:', err))

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', bruteForceCheck, async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ message: 'Identifiant et mot de passe requis' })
    }

    // Chercher en base
    const admin = await AdminSettings.findOne({ username: username.trim() })

    if (!admin) {
      recordFailedAttempt(req._loginIp)
      // Délai artificiel pour éviter l'énumération
      await new Promise((r) => setTimeout(r, 500))
      return res.status(401).json({ message: 'Identifiants incorrects' })
    }

    const valid = await admin.verifyPassword(password)
    if (!valid) {
      recordFailedAttempt(req._loginIp)
      await new Promise((r) => setTimeout(r, 500))
      return res.status(401).json({ message: 'Identifiants incorrects' })
    }

    // Succès → réinitialiser le compteur
    loginAttempts.delete(req._loginIp)

    const token = jwt.sign(
      { username: admin.username, role: 'admin', id: admin._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({ token, message: 'Connexion réussie', admin: { username: admin.username } })

  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message })
  }
})

// ─── GET /api/auth/verify ─────────────────────────────────────────────────────
router.get('/verify', (req, res) => {
  try {
    const token   = req.header('Authorization')?.replace('Bearer ', '')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    res.json({ valid: true, admin: decoded })
  } catch {
    res.status(401).json({ valid: false })
  }
})

// ─── PUT /api/auth/credentials — Changer identifiant / mot de passe ───────────
// Requiert : token admin valide + mot de passe actuel
router.put('/credentials', authenticateAdmin, async (req, res) => {
  try {
    const { currentPassword, newUsername, newPassword } = req.body

    if (!currentPassword) {
      return res.status(400).json({ message: 'Mot de passe actuel requis' })
    }

    // Charger l'admin depuis la DB
    const admin = await AdminSettings.findOne({ username: req.admin.username })
    if (!admin) return res.status(404).json({ message: 'Compte introuvable' })

    // Vérifier le mot de passe actuel
    const valid = await admin.verifyPassword(currentPassword)
    if (!valid) {
      return res.status(401).json({ message: 'Mot de passe actuel incorrect' })
    }

    // Appliquer les changements demandés
    if (newUsername && newUsername.trim()) {
      // Vérifier que le nouveau username n'existe pas déjà
      const exists = await AdminSettings.findOne({
        username: newUsername.trim(), _id: { $ne: admin._id },
      })
      if (exists) return res.status(409).json({ message: 'Ce nom d\'utilisateur est déjà pris' })
      admin.username = newUsername.trim()
    }

    if (newPassword) {
      if (newPassword.length < 8) {
        return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 8 caractères' })
      }
      admin.passwordHash = await AdminSettings.hashPassword(newPassword)
    }

    await admin.save()

    // Générer un nouveau token avec les nouvelles infos
    const newToken = jwt.sign(
      { username: admin.username, role: 'admin', id: admin._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )

    res.json({
      message: 'Identifiants mis à jour avec succès',
      token: newToken,
      admin: { username: admin.username },
    })

  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message })
  }
})

module.exports = router