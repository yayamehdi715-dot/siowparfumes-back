// routes/adminRoutes.js
const express = require('express')
const router  = express.Router()
const Order   = require('../models/Order')
const Product = require('../models/Product')
const { authenticateAdmin } = require('../middleware/auth')

// ── GET /api/admin/stats ─────────────────────────────────────────
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const [allOrders, products] = await Promise.all([
      Order.find().populate('items.product', 'category'),
      Product.countDocuments(),
    ])

    const byStatus = (status) => allOrders.filter((o) => o.status === status)

    const delivered  = byStatus('livré')
    const returned   = byStatus('retour')
    const confirmed  = byStatus('confirmé')
    const inDelivery = byStatus('en livraison')
    const cancelled  = byStatus('annulé')

    // Chiffre d'affaires = commandes livrées uniquement
    const totalRevenue = delivered.reduce((sum, o) => sum + o.total, 0)

    // Produits livrés (quantités)
    const productsDelivered = delivered.reduce(
      (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0
    )

    // Stats par catégorie (basées sur les commandes livrées)
    const byCategory = {}
    delivered.forEach((order) => {
      order.items.forEach((item) => {
        const cat = item.product?.category || 'Autre'
        if (!byCategory[cat]) byCategory[cat] = { orders: 0, revenue: 0 }
        byCategory[cat].orders  += item.quantity
        byCategory[cat].revenue += item.price * item.quantity
      })
    })

    res.json({
      totalRevenue,
      totalOrders:       allOrders.length,
      deliveredOrders:   delivered.length,
      returnOrders:      returned.length,
      confirmedOrders:   confirmed.length,
      inDeliveryOrders:  inDelivery.length,
      cancelledOrders:   cancelled.length,
      productsDelivered,
      totalProducts:     products,
      byCategory,
    })

  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// ── POST /api/admin/stats/reset ──────────────────────────────────
// Supprime les commandes livrées et retournées (reset compteurs)
router.post('/stats/reset', authenticateAdmin, async (req, res) => {
  try {
    const result = await Order.deleteMany({ status: { $in: ['livré', 'retour'] } })
    res.json({ message: 'Statistiques réinitialisées', deletedCount: result.deletedCount })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router