// routes/productRoutes.js
const express  = require('express')
const router   = express.Router()
const Product  = require('../models/Product')
const cloudinary = require('../config/cloudinary')
const { authenticateAdmin } = require('../middleware/auth')

// Extraire le public_id Cloudinary depuis une URL
function getPublicId(url) {
  try {
    const parts      = url.split('/')
    const uploadIdx  = parts.indexOf('upload')
    const startIdx   = parts[uploadIdx + 1]?.startsWith('v')
      ? uploadIdx + 2
      : uploadIdx + 1
    const filePart   = parts.slice(startIdx).join('/')
    return filePart.replace(/\.[^/.]+$/, '')
  } catch {
    return null
  }
}

// ── GET /api/products ────────────────────────────────────────────
// Paramètres optionnels : ?category=  ?search=  ?bestSeller=true  ?featured=true  ?limit=
router.get('/', async (req, res) => {
  try {
    const { category, search, bestSeller, featured, limit } = req.query
    const filter = {}

    if (category)                          filter.category   = category
    if (bestSeller === 'true')             filter.bestSeller = true
    if (featured   === 'true')             filter.featured   = true
    if (search) {
      filter.$or = [
        { name:        { $regex: search, $options: 'i' } },
        { brand:       { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ]
    }

    let query = Product.find(filter).sort({ createdAt: -1 })
    if (limit) query = query.limit(parseInt(limit, 10))

    const products = await query
    res.json(products)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// ── GET /api/products/:id ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' })
    res.json(product)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

// ── POST /api/products (admin) ───────────────────────────────────
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const product    = new Product(req.body)
    const newProduct = await product.save()
    res.status(201).json(newProduct)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

// ── PUT /api/products/:id (admin) ────────────────────────────────
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' })
    res.json(product)
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

// ── DELETE /api/products/:id (admin) ────────────────────────────
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
    if (!product) return res.status(404).json({ message: 'Produit non trouvé' })

    // Supprimer les images Cloudinary associées
    if (product.images?.length > 0) {
      await Promise.all(
        product.images.map((url) => {
          const publicId = getPublicId(url)
          return publicId ? cloudinary.uploader.destroy(publicId) : Promise.resolve()
        })
      )
    }

    await Product.findByIdAndDelete(req.params.id)
    res.json({ message: 'Produit et images supprimés' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router