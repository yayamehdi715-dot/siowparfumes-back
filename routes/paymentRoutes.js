const express = require('express')
const router = express.Router()
const axios = require('axios')
const crypto = require('crypto')
const Order = require('../models/Order')
const Product = require('../models/Product')

const CHARGILY_API_KEY = process.env.CHARGILY_APP_KEY
const CHARGILY_APP_SECRET = process.env.CHARGILY_APP_SECRET
const CHARGILY_BASE_URL = 'https://epay.chargily.com.dz/api'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000'

// POST /api/payment/create
// Crée la commande en BDD puis redirige vers Chargily
router.post('/create', async (req, res) => {
  try {
    const { customerInfo, items, total, paymentMode } = req.body

    if (!customerInfo || !items || !total || !paymentMode) {
      return res.status(400).json({ message: 'Données incomplètes' })
    }

    if (!['CIB', 'EDAHABIA'].includes(paymentMode)) {
      return res.status(400).json({ message: 'Mode de paiement invalide' })
    }

    // Vérifier le stock disponible
    for (const item of items) {
      const product = await Product.findById(item.product)
      if (!product) {
        return res.status(404).json({ message: `Produit introuvable : ${item.name}` })
      }
      const sizeData = product.sizes.find((s) => s.size == item.size)
      if (!sizeData || sizeData.stock < item.quantity) {
        return res.status(400).json({
          message: `Stock insuffisant pour ${item.name} en taille ${item.size}`
        })
      }
    }

    // Décrémenter le stock
    for (const item of items) {
      await Product.updateOne(
        { _id: item.product, 'sizes.size': item.size },
        { $inc: { 'sizes.$.stock': -item.quantity } }
      )
    }

    // Créer la commande en BDD
    const order = new Order({
      customerInfo,
      items,
      total,
      status: 'en attente',
      paymentMethod: paymentMode,
      paymentStatus: 'en attente',
    })
    await order.save()

    // Créer la facture Chargily
    const invoice = {
      client: `${customerInfo.firstName} ${customerInfo.lastName}`,
      client_email: `order-${order._id}@sheinme.dz`,
      invoice_number: order._id.toString().slice(-8).toUpperCase(),
      amount: total,
      discount: 0,
      mode: paymentMode,
      back_url: `${FRONTEND_URL}/confirmation?orderId=${order._id}`,
      webhook_url: `${BACKEND_URL}/api/payment/webhook`,
      comment: `Commande SheinMe #${order._id.toString().slice(-6)}`,
    }

    const chargilyRes = await axios.post(`${CHARGILY_BASE_URL}/invoice`, invoice, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Authorization': CHARGILY_API_KEY,
      },
      timeout: 10000,
    })

    const { checkout_url, invoice_id } = chargilyRes.data

    // Sauvegarder l'ID de facture Chargily
    order.chargilyInvoiceId = invoice_id || null
    await order.save()

    res.json({ checkout_url, orderId: order._id })

  } catch (err) {
    console.error('Erreur Chargily:', err?.response?.data || err.message)
    res.status(500).json({
      message: 'Erreur lors de la création du paiement',
      error: err?.response?.data || err.message
    })
  }
})

// POST /api/payment/webhook
// Reçoit la confirmation de Chargily et met à jour la commande
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Vérifier la signature si l'app_secret est défini
    if (CHARGILY_APP_SECRET) {
      const signature = req.headers['x-chargily-signature']
      const body = req.body.toString()
      const expectedSig = crypto
        .createHmac('sha256', CHARGILY_APP_SECRET)
        .update(body)
        .digest('hex')

      if (signature !== expectedSig) {
        console.warn('⚠️ Signature webhook invalide')
        return res.status(401).json({ message: 'Signature invalide' })
      }
    }

    const payload = typeof req.body === 'string'
      ? JSON.parse(req.body)
      : JSON.parse(req.body.toString())

    const { invoice_id, status } = payload

    // Chercher la commande par chargilyInvoiceId
    const order = await Order.findOne({ chargilyInvoiceId: invoice_id })

    if (!order) {
      console.warn(`Commande introuvable pour invoice_id: ${invoice_id}`)
      return res.status(404).json({ message: 'Commande introuvable' })
    }

    if (status === 'paid') {
      order.paymentStatus = 'payé'
      order.status = 'confirmé'
    } else if (status === 'failed' || status === 'canceled') {
      order.paymentStatus = 'échoué'
      // Remettre le stock si paiement échoué
      for (const item of order.items) {
        await Product.updateOne(
          { _id: item.product, 'sizes.size': item.size },
          { $inc: { 'sizes.$.stock': item.quantity } }
        )
      }
    }

    await order.save()
    res.json({ message: 'Webhook traité' })

  } catch (err) {
    console.error('Erreur webhook:', err.message)
    res.status(500).json({ message: 'Erreur serveur webhook' })
  }
})

// GET /api/payment/status/:orderId
// Vérifie le statut d'une commande (pour la page de confirmation)
router.get('/status/:orderId', async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .select('status paymentStatus paymentMethod total')
    if (!order) return res.status(404).json({ message: 'Commande introuvable' })
    res.json(order)
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

module.exports = router