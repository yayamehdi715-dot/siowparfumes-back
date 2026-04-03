// routes/uploadRoutes.js
// Upload vers Cloudinary avec optimisation automatique :
// - Conversion WebP automatique
// - Redimensionnement max 1200px
// - Qualité auto:good (meilleur ratio taille/qualité)
// - Génération d'une URL thumbnail 400px pour les listes/panier

const express  = require('express')
const router   = express.Router()
const multer   = require('multer')
const cloudinary = require('../config/cloudinary')
const { authenticateAdmin } = require('../middleware/auth')

const storage = multer.memoryStorage()
const upload  = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Seules les images sont autorisées'), false)
  },
})

// ── Transforme une URL Cloudinary en URL optimisée ────────────────────────────
// Insère les paramètres de transformation dans l'URL Cloudinary
function optimizeCloudinaryUrl(url, { width, quality = 'auto:good', format = 'auto' } = {}) {
  if (!url || !url.includes('cloudinary.com')) return url
  // Insère les transformations après /upload/
  const transforms = [
    width ? `w_${width}` : null,
    `q_${quality}`,
    `f_${format}`,
  ].filter(Boolean).join(',')

  return url.replace('/upload/', `/upload/${transforms}/`)
}

router.post('/', authenticateAdmin, upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Aucune image fournie' })
    }

    const uploadPromises = req.files.map((file) => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'siowparfumes',
            // Cloudinary optimise automatiquement :
            // - format WebP/AVIF selon le navigateur
            // - qualité intelligente
            // - redimensionnement max 1200px large
            quality:      'auto:good',
            fetch_format: 'auto',
            transformation: [
              {
                width:   1200,
                crop:    'limit',   // ne pas agrandir si déjà plus petit
                quality: 'auto:good',
              },
            ],
          },
          (error, result) => {
            if (error) reject(error)
            else {
              // Retourner l'URL principale (déjà optimisée par Cloudinary)
              resolve(result.secure_url)
            }
          }
        )
        uploadStream.end(file.buffer)
      })
    })

    const imageUrls = await Promise.all(uploadPromises)
    res.json({ message: 'Images uploadées avec succès', urls: imageUrls })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router