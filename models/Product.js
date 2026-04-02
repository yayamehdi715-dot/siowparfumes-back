const mongoose = require('mongoose')

const productSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    brand:       { type: String, default: '', trim: true },
    category: {
      type: String,
      required: true,
      enum: ['Watches', 'Fragrances', 'Saudi Coll.', 'Essentials'],
    },
    price:       { type: Number, required: true, min: 0 },
    description: { type: String, default: '' },
    images:      [{ type: String }],
    sizes: [
      {
        size:  { type: String, required: true },
        stock: { type: Number, required: true, min: 0, default: 0 },
      },
    ],
    tags: [{ type: String }],
    bestSeller: { type: Boolean, default: false },
    featured:   { type: Boolean, default: false },
  },
  { timestamps: true }
)

// Index full-text pour la recherche
productSchema.index({ name: 'text', brand: 'text', description: 'text' })

module.exports = mongoose.model('Product', productSchema)