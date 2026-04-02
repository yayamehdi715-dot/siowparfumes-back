const express = require('express')
const router  = express.Router()
const axios   = require('axios')
const Order   = require('../models/Order')
const Product = require('../models/Product')
const { authenticateAdmin } = require('../middleware/auth')

// ─── Telegram notification ────────────────────────────────────────────────────
async function sendTelegramNotification(order) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return // pas configuré → ignoré silencieusement

  try {
    const lignesArticles = order.items
      .map((item) => {
        const prix = ((item.price ?? 0) * item.quantity).toLocaleString('fr-DZ')
        return `  • ${item.quantity}× <b>${item.name}</b> / ${item.size} — ${prix} DZD`
      })
      .join('\n')

    const message = [
      `🛍️ <b>Nouvelle commande — SIOW PARFUMES</b>`,
      ``,
      `👤 <b>Client :</b> ${order.customerInfo.firstName} ${order.customerInfo.lastName}`,
      `📞 <b>Téléphone :</b> ${order.customerInfo.phone}`,
      `📍 <b>Wilaya :</b> ${order.customerInfo.wilaya}`,
      `🏘️ <b>Commune :</b> ${order.customerInfo.commune}`,
      ``,
      `📦 <b>Articles :</b>`,
      lignesArticles,
      ``,
      `💰 <b>Total : ${(order.total ?? 0).toLocaleString('fr-DZ')} DZD</b>`,
      `💳 <b>Paiement :</b> À la livraison`,
    ].join('\n')

    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id:    chatId,
      text:       message,
      parse_mode: 'HTML',
    })
  } catch (err) {
    // Ne jamais bloquer une commande si Telegram échoue
    console.error('[Telegram] Erreur notification :', err.message)
  }
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { customerInfo, items, total } = req.body
    if (!customerInfo || !items || !total) {
      return res.status(400).json({ message: 'Données incomplètes' })
    }

    for (const item of items) {
      const product = await Product.findById(item.product)
      if (!product) {
        return res.status(404).json({ message: `Produit introuvable : ${item.name}` })
      }
    }

    const order = new Order({ customerInfo, items, total, status: 'en attente' })
    await order.save()

    // Notification Telegram en arrière-plan (ne bloque pas la réponse)
    sendTelegramNotification({ customerInfo, items, total })

    res.status(201).json(order)
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message })
  }
})

// ─── GET /api/orders ──────────────────────────────────────────────────────────
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const orders = await Order.find()
      .populate('items.product', 'name brand images')
      .sort({ createdAt: -1 })
    res.json(orders)
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message })
  }
})

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.product', 'name brand images')
    if (!order) return res.status(404).json({ message: 'Commande introuvable' })
    res.json(order)
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message })
  }
})

// ─── PUT /api/orders/:id ──────────────────────────────────────────────────────
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body
    const validStatuses = ['en attente', 'confirmé', 'en livraison', 'livré', 'retour', 'annulé']
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Statut invalide' })
    }
    const order = await Order.findById(req.params.id)
    if (!order) return res.status(404).json({ message: 'Commande introuvable' })
    order.status = status
    await order.save()
    res.json(order)
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', error: err.message })
  }
})

module.exports = router