// models/AdminSettings.js
// Stocke les credentials admin en base avec mot de passe hashé (bcrypt)
const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const adminSettingsSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
}, { timestamps: true })

// Méthode pour vérifier le mot de passe
adminSettingsSchema.methods.verifyPassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash)
}

// Méthode statique pour hasher un mot de passe
adminSettingsSchema.statics.hashPassword = async function (plain) {
  return bcrypt.hash(plain, 12)
}

module.exports = mongoose.model('AdminSettings', adminSettingsSchema)