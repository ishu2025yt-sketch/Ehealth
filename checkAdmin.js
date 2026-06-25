const mongoose = require('mongoose');
const User = require('./models/user'); // small 'u' file ke hisaab se

mongoose.connect('mongodb://127.0.0.1:27017/ehealth')
  .then(async () => {
    console.log("✅ MongoDB connected");
    const admins = await User.find({ role: 'admin' });
    console.log("🧾 Admin users found:");
    console.log(admins);
    process.exit();
  })
  .catch(err => {
    console.error("❌ Connection error:", err);
  });
