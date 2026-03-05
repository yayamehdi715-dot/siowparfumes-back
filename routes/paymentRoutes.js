const express = require('express')
const router = express.Router()
const axios = require('axios')
const crypto = require('crypto')
const Order = require('../models/Order')
const Product = require('../models/Product')

const CHARGILY_API_KEY = process.env.CHARGILY_APP_KEY
const CHARGILY_APP_SECRET = process.env.CHARGILY_APP_SECRET
const CHARGILY_BASE_URL = 'https://pay.chargily.net/api/v2'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000'

// POST /api/payment/create
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

    // Créer le checkout Chargily Pay V2
    const checkoutPayload = {
      items: items.map((item) => ({
        price: item.price,
        quantity: item.quantity,
      })),
      success_url: `${FRONTEND_URL}/confirmation?orderId=${order._id}`,
      failure_url: `${FRONTEND_URL}/confirmation?orderId=${order._id}&failed=1`,
      webhook_endpoint: `${BACKEND_URL}/api/payment/webhook`,
      description: `Commande SheinMe #${order._id.toString().slice(-6)}`,
      locale: 'fr',
      payment_method: paymentMode === 'CIB' ? 'cib' : 'edahabia',
      metadata: { orderId: order._id.toString() },
    }

    const chargilyRes = await axios.post(
      `${CHARGILY_BASE_URL}/checkouts`,
      checkoutPayload,
      {
        headers: {
          Authorization: `Bearer ${CHARGILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    )

    const { checkout_url, id: checkoutId } = chargilyRes.data

    order.chargilyInvoiceId = checkoutId
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
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['signature']
    const body = req.body.toString()

    if (CHARGILY_APP_SECRET && signature) {
      const expectedSig = crypto
        .createHmac('sha256', CHARGILY_APP_SECRET)
        .update(body)
        .digest('hex')

      if (signature !== expectedSig) {
        console.warn('Signature webhook invalide')
        return res.status(401).json({ message: 'Signature invalide' })
      }
    }

    const payload = JSON.parse(body)
    const { type, data } = payload

    if (type === 'checkout.paid') {
      const checkoutId = data?.id
      const metadata = data?.metadata
      let order = await Order.findOne({ chargilyInvoiceId: checkoutId })
      if (!order && metadata?.orderId) order = await Order.findById(metadata.orderId)
      if (order) {
        order.paymentStatus = 'payé'
        order.status = 'confirmé'
        await order.save()
      }
    } else if (type === 'checkout.failed') {
      const checkoutId = data?.id
      const metadata = data?.metadata
      let order = await Order.findOne({ chargilyInvoiceId: checkoutId })
      if (!order && metadata?.orderId) order = await Order.findById(metadata.orderId)
      if (order) {
        order.paymentStatus = 'échoué'
        for (const item of order.items) {
          await Product.updateOne(
            { _id: item.product, 'sizes.size': item.size },
            { $inc: { 'sizes.$.stock': item.quantity } }
          )
        }
        await order.save()
      }
    }

    res.json({ message: 'Webhook traité' })

  } catch (err) {
    console.error('Erreur webhook:', err.message)
    res.status(500).json({ message: 'Erreur serveur webhook' })
  }
})

// GET /api/payment/status/:orderId
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