const mongoose = require('mongoose')

const extraitSchema = new mongoose.Schema({
  ml:    { type: Number, required: true, min: 1 },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, default: 0 },
}, { _id: false })

const productSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    brand:       { type: String, default: '', trim: true },
    category: {
      type: String,
      required: true,
      enum: ['Montres', 'Parfums', 'Parfums Saoudiens', 'Essentiels'],
    },
    price:       { type: Number, required: true, min: 0 },
    description: { type: String, default: '' },
    images:      [{ type: String }],

    // Pour Montres & Essentiels : tailles avec stock
    sizes: [
      {
        size:  { type: String, required: true },
        stock: { type: Number, required: true, min: 0, default: 0 },
      },
    ],

    // Pour Parfums & Parfums Saoudiens : stock du flacon complet
    flaconStock: { type: Number, default: 0, min: 0 },

    // Pour Parfums & Parfums Saoudiens : vente en extraits
    extraits: [extraitSchema],

    tags:       [{ type: String }],
    bestSeller: { type: Boolean, default: false },
    featured:   { type: Boolean, default: false },
  },
  { timestamps: true }
)

// Index full-text pour la recherche
productSchema.index({ name: 'text', brand: 'text', description: 'text' })

module.exports = mongoose.model('Product', productSchema)