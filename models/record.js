const mongoose = require('mongoose');

const recordSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  patientName: { type: String, required: true },
  age: Number,
  gender: String,
  diagnosis: String,
  treatment: String,
  doctor: String,
  file: {
    filename: String,
    originalname: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Record', recordSchema);