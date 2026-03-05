// models/Order.js
const mongoose = require('mongoose')

const orderSchema = new mongoose.Schema({
  customerInfo: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    phone: { type: String, required: true },
    wilaya: { type: String, required: true },
    commune: { type: String, required: true },
  },
  items: [
    {
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      name: { type: String, required: true },
      size: { type: String, required: true },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
    },
  ],
  total: { type: Number, required: true },
  status: {
    type: String,
    enum: ['en attente', 'confirmé', 'en livraison', 'livré', 'retour', 'annulé'],
    default: 'en attente',
  },
  // ===== Chargily ePay =====
  paymentMethod: {
    type: String,
    enum: ['livraison', 'CIB', 'EDAHABIA'],
    default: 'livraison',
  },
  paymentStatus: {
    type: String,
    enum: ['non payé', 'en attente', 'payé', 'échoué'],
    default: 'non payé',
  },
  chargilyInvoiceId: { type: String, default: null },
  // =========================
}, { timestamps: true })

module.exports = mongoose.model('Order', orderSchema)