require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');

const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');

// Initialize Firebase (optional - for production, add real service account key)
let db;
try {
  const serviceAccount = require('./firebase-key.json');
  console.log('Checking service account key...');
  if (serviceAccount.type === 'service_account') {
    admin.initializeApp({
      credential: admin.cert(serviceAccount)
    });
    db = getFirestore();
    console.log('🔥 Firebase Connected Successfully!');
  } else {
    console.error('❌ Invalid service account type:', serviceAccount.type);
    throw new Error('Invalid service account');
  }
} catch (err) {
  console.error('❌ Firebase Initialization Failed:', err);
  console.log('⚠️ Firebase not configured - using demo mode');
  console.log('   Get real config from Firebase Console > Project Settings > Service Accounts');
  // Create mock db for syntax checking
  db = {
    collection: (collName) => ({
      where: (field, op, value) => ({
        limit: (n) => ({
          get: async () => ({ 
            empty: true, 
            forEach: (cb) => { if(cb) cb({ id: 'demo', data: () => ({}) }); },
            docs: [{ id: 'demo', data: () => ({}) }]
          })
        }),
        get: async () => ({ 
          empty: true, 
          forEach: (cb) => { if(cb) cb({ id: 'demo', data: () => ({}) }); },
          docs: [{ id: 'demo', data: () => ({}) }]
        })
      }),
      add: async () => ({ id: 'demo' }),
      doc: (docId) => ({
        get: async () => ({ 
          exists: false, 
          data: () => ({}),
          id: docId
        })
      }),
      get: async () => ({ 
        empty: true,
        forEach: (cb) => { if(cb) cb({ id: 'demo', data: () => ({}) }); },
        docs: [{ id: 'demo', data: () => ({}) }]
      })
    })
  };
}

const app = express();

// Middleware
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Session config
app.use(session({
  secret: process.env.SESSION_SECRET || 'secretkey',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));
app.use(flash());

// Flash message middleware
app.use((req, res, next) => {
  res.locals.flash = req.flash('message');
  next();
});

// User middleware
app.use(async (req, res, next) => {
  if (req.session.userId) {
    try {
      const userDoc = await db.collection('users').doc(req.session.userId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        res.locals.user = {
          id: userDoc.id,
          name: userData.name,
          email: userData.email,
          role: userData.role
        };
        req.session.user = res.locals.user;
      } else {
        res.locals.user = null;
      }
    } catch (error) {
      res.locals.user = null;
    }
  } else {
    res.locals.user = null;
  }
  next();
});

// Multer config
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
});
const upload = multer({ storage });

// Helper functions
function ensureAuth(req, res, next) {
  if (req.session.userId) return next();
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

function ensureAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).send('Forbidden');
}

// Routes
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('index', { user: req.session.user });
});

// Register
app.get('/register', (req, res) => res.render('register', { user: req.session.user }));

app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.render('register', { error: 'All fields required' });
    }

    const existing = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!existing.empty) {
      return res.render('register', { error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);

    const docRef = await db.collection('users').add({
      name,
      email,
      password: hash,
      role: 'patient',
      createdAt: FieldValue.serverTimestamp()
    });

    req.session.userId = docRef.id;
    req.session.user = {
      id: docRef.id,
      name,
      email,
      role: 'patient'
    };

    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('register', { error: 'Registration failed' });
  }
});

// Login
app.get('/login', (req, res) => res.render('login', { user: req.session.user, next: req.query.next || '' }));
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const userSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();

    if (userSnapshot.empty) {
      return res.render('login', { error: 'Invalid credentials' });
    }

    const userDoc = userSnapshot.docs[0];
    const user = { id: userDoc.id, ...userDoc.data() };

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.render('login', { error: 'Invalid credentials' });

    req.session.userId = user.id;
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };

    const nextUrl = req.body.next || '/dashboard';
    return res.redirect(nextUrl);
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Login failed' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// Dashboard
app.get('/dashboard', ensureAuth, async (req, res) => {
  try {
    if (req.session.user && req.session.user.role === 'admin') {
      return res.redirect('/admin');
    }

    const snapshot = await db.collection('records')
      .where('owner', '==', req.session.userId)
      .get();

    const records = [];
    snapshot.forEach(doc => {
      records.push({ id: doc.id, ...doc.data() });
    });

    res.render('dashboard', { user: req.session.user, records });
  } catch (err) {
    console.error(err);
    res.status(500).send('Dashboard Error');
  }
});

// Record form
app.get('/records', ensureAuth, (req, res) => {
  res.render('upload', { user: req.session.user });
});

// Create record
app.post('/records/add', ensureAuth, upload.single('file'), async (req, res) => {
  try {
    const file = req.file ? {
      filename: req.file.filename,
      originalname: req.file.originalname,
      url: '/uploads/' + req.file.filename,
      uploadedAt: FieldValue.serverTimestamp()
    } : null;

    await db.collection('records').add({
      owner: req.session.userId,
      patientName: req.body.patientName,
      age: req.body.age,
      gender: req.body.gender,
      diagnosis: req.body.diagnosis,
      treatment: req.body.treatment,
      doctor: req.body.doctor,
      file: file,
      createdAt: FieldValue.serverTimestamp()
    });


    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.send('Error saving record');
  }
});

// View single record
app.get('/records/:id', ensureAuth, async (req, res) => {
  try {
    const doc = await db.collection('records').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).send('Record not found');
    }

    const record = { id: doc.id, ...doc.data() };
    const isOwner = record.owner === req.session.userId;
    const isAdmin = req.session.user && req.session.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).send('Forbidden');
    }

    res.render('view-record', { user: req.session.user, record });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading record');
  }
});

// Delete record
app.post('/records/:id/delete', ensureAuth, async (req, res) => {
  try {
    const doc = await db.collection('records').doc(req.params.id).get();
    if (!doc.exists) return res.redirect('/dashboard');

    const record = { id: doc.id, ...doc.data() };
    const isOwner = record.owner === req.session.userId;
    const isAdmin = req.session.user && req.session.user.role === 'admin';

    if (!isOwner && !isAdmin) return res.status(403).send('Forbidden');

    if (record.file && record.file.filename) {
      const p = path.join(UPLOAD_DIR, record.file.filename);
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
    }

    await db.collection('records').doc(req.params.id).delete();
    res.redirect(isAdmin ? '/admin' : '/dashboard');
  } catch (err) {
    console.error(err);
    res.send('Delete error');
  }
});

// Generate PDF
app.get('/records/:id/pdf', ensureAuth, async (req, res) => {
    try {
        const doc = await db.collection('records').doc(req.params.id).get();
        if (!doc.exists) {
            return res.status(404).send('Not found');
        }

        const record = { id: doc.id, ...doc.data() };
        const isOwner = record.owner === req.session.userId;
        const isAdmin = req.session.user && req.session.user.role === 'admin';

        if (!isOwner && !isAdmin) {
            return res.status(403).send('Forbidden');
        }

        const userDoc = await db.collection('users').doc(record.owner).get();
        const ownerName = userDoc.exists ? userDoc.data().name : '-';

        const logoPath = path.join(__dirname, 'public', 'logo.png');
        const PAGE_W = 595; // A4 width in points
        const PAGE_H = 842; // A4 height in points
        const M = 40; // margin
        const CONTENT_W = PAGE_W - M * 2;

        const pdfDoc = new PDFDocument({
            size: [PAGE_W, PAGE_H],
            margin: 0,
            embedFonts: true
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="record_${record.id}.pdf"`);
        pdfDoc.pipe(res);

        const PRIMARY = '#0066cc';
        const LIGHT = '#f5f7fa';
        const DARK = '#2d3748';
        const MUTED = '#718096';

        let y = 0;

        // Header
        pdfDoc.rect(0, 0, PAGE_W, 70).fill(PRIMARY);
        pdfDoc.fillColor('#ffffff');

        if (fs.existsSync(logoPath)) {
            pdfDoc.image(logoPath, M, 18, { width: 36, height: 36 });
        }

        pdfDoc.fontSize(16).font('Helvetica-Bold')
            .text('E-HEALTH RECORD SYSTEM', M + 44, 20);
        pdfDoc.fontSize(9).font('Helvetica')
            .text('Official Digital Health Report', M + 44, 42);

        pdfDoc.fontSize(8).font('Helvetica')
            .text(`Report ID: ${record.id}`, M, 24, { align: 'right', width: PAGE_W - 30 });

        y = 90;

        // Title
        pdfDoc.fillColor(PRIMARY)
            .fontSize(16).font('Helvetica-Bold')
            .text('PATIENT MEDICAL REPORT', M, y, { align: 'center', width: CONTENT_W });
        y += 20;

        pdfDoc.strokeColor('#e2e8f0').lineWidth(1).moveTo(M, y).lineTo(PAGE_W - M, y).stroke();
        y += 18;

        // Patient Information Card
        pdfDoc.fillColor('#ffffff').rect(M, y, CONTENT_W, 85).fill();
        pdfDoc.fillColor(PRIMARY).rect(M, y, CONTENT_W, 4).fill();
        y += 12;

        pdfDoc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text('PATIENT INFORMATION', M + 8, y);
        y += 18;

        const dateVal = record.createdAt && record.createdAt.seconds ?
            new Date(record.createdAt.seconds * 1000).toLocaleDateString() :
            (record.createdAt ? new Date(record.createdAt).toLocaleDateString() : '-');

        const infoData = [
            ['Patient Name', record.patientName || '-'],
            ['Age', String(record.age || '-')],
            ['Gender', record.gender || '-'],
            ['Doctor', record.doctor || '-'],
            ['Date', dateVal],
            ['Recorded By', ownerName]
        ];

        pdfDoc.fontSize(9).font('Helvetica');
        infoData.forEach((row, i) => {
            pdfDoc.fillColor(DARK).text(row[0], M + 8, y + i * 14);
            pdfDoc.fillColor(MUTED).text(':', M + 85, y + i * 14);
            pdfDoc.fillColor(DARK).text(row[1], M + 100, y + i * 14);
        });
        y += 30;

        // Diagnosis
        pdfDoc.fillColor(LIGHT).rect(M, y, CONTENT_W, 10).fill();
        pdfDoc.fillColor(PRIMARY).rect(M, y, 4, 10).fill();
        pdfDoc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text('MEDICAL DIAGNOSIS', M + 10, y + 2);
        y += 16;

        const diagText = record.diagnosis || 'No diagnosis recorded.';
        pdfDoc.fillColor('#ffffff').rect(M, y, CONTENT_W, 60).fill();
        pdfDoc.fillColor(DARK).fontSize(9).font('Helvetica');
        pdfDoc.text(diagText, M + 10, y + 8, { width: CONTENT_W - 20, align: 'left' });
        y += 70;

        // Treatment
        pdfDoc.fillColor(LIGHT).rect(M, y, CONTENT_W, 10).fill();
        pdfDoc.fillColor(PRIMARY).rect(M, y, 4, 10).fill();
        pdfDoc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text('TREATMENT PLAN', M + 10, y + 2);
        y += 16;

        const treatText = record.treatment || 'No treatment plan recorded.';
        pdfDoc.fillColor('#ffffff').rect(M, y, CONTENT_W, 60).fill();
        pdfDoc.fillColor(DARK).fontSize(9).font('Helvetica');
        pdfDoc.text(treatText, M + 10, y + 8, { width: CONTENT_W - 20, align: 'left' });
        y += 70;

        // Attachment
        if (record.file && record.file.originalname) {
            pdfDoc.fillColor(MUTED).fontSize(8).font('Helvetica').text(`📎 Attachment: ${record.file.originalname}`, M, y);
            y += 16;
        }

        // Signature
        pdfDoc.strokeColor(PRIMARY).lineWidth(1).moveTo(PAGE_W - 180, y + 10).lineTo(PAGE_W - M, y + 10).stroke();
        pdfDoc.fillColor(PRIMARY).fontSize(9).font('Helvetica-Bold').text('Authorized Physician Signature', PAGE_W - 180, y + 14);
        y += 30;

        // Footer
        pdfDoc.fillColor('#e2e8f0').rect(0, PAGE_H - 30, PAGE_W, 30).fill();
        pdfDoc.fillColor(MUTED).fontSize(8).font('Helvetica');
        pdfDoc.text(`© ${new Date().getFullYear()} E-Health Record System | Confidential Medical Document`, 0, PAGE_H - 20, {
            align: 'center',
            width: PAGE_W
        });

        pdfDoc.end();

    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).send('PDF error');
    }
});

// Forgot password
app.get('/forgot', (req, res) => res.render('forgot'));
app.post('/forgot', async (req, res) => {
  try {
    const { email } = req.body;
    const userSnapshot = await db.collection('users').where('email', '==', email).limit(1).get();

    if (userSnapshot.empty) {
      return res.render('forgot', { message: 'If account exists, reset link sent.' });
    }

    const userDoc = userSnapshot.docs[0];
    const token = crypto.randomBytes(20).toString('hex');

    await db.collection('users').doc(userDoc.id).update({
      resetToken: token,
      resetExpires: Date.now() + 3600 * 1000
    });

    return res.redirect(`/reset?email=${encodeURIComponent(email)}&token=${token}`);
  } catch (err) {
    console.error(err);
    res.render('forgot', { error: 'Error generating reset token' });
  }
});

// Reset form
app.get('/reset', (req, res) => {
  const email = req.query.email || '';
  const token = req.query.token || '';
  res.render('reset', { email, token, error: null });
});

// Reset password
app.post('/reset', async (req, res) => {
  try {
    const { email, token, password } = req.body;

    const userSnapshot = await db.collection('users')
      .where('email', '==', email)
      .where('resetToken', '==', token)
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      return res.render('reset', { email, token, error: 'Invalid or expired token' });
    }

    const userDoc = userSnapshot.docs[0];
    const hash = await bcrypt.hash(password, 10);

    await db.collection('users').doc(userDoc.id).update({
      password: hash,
      resetToken: null,
      resetExpires: null
    });

    res.render('login', { message: 'Password updated successfully. Please login.' });
  } catch (err) {
    console.error(err);
    res.render('reset', { email: '', token: '', error: 'Reset failed. Try again.' });
  }
});

// Admin area
app.get('/admin', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    const users = [];
    const userMap = {};
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      const u = { 
        id: doc.id, 
        name: data.name, 
        email: data.email, 
        role: data.role, 
        createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt 
      };
      users.push(u);
      userMap[doc.id] = u;
    });

    const recordsSnapshot = await db.collection('records').get();
    const records = [];
    recordsSnapshot.forEach(doc => {
      const data = doc.data();
      records.push({ 
        id: doc.id, 
        ...data, 
        ownerName: userMap[data.owner] ? userMap[data.owner].name : 'Unknown',
        createdAt: data.createdAt && data.createdAt.toDate ? data.createdAt.toDate() : data.createdAt
      });
    });

    res.render('admin', { user: req.session.user, users, records });
  } catch (err) {
    console.error(err);
    res.status(500).send('Admin Panel Error');
  }
});

// Seed admin
app.get('/seed-admin', async (req, res) => {
  try {
    const existing = await db.collection('users').where('email', '==', 'admin@health.com').limit(1).get();
    if (!existing.empty) return res.send('Admin already exists');

    const hash = await bcrypt.hash('admin123', 10);
    await db.collection('users').add({
      name: 'Admin',
      email: 'admin@health.com',
      password: hash,
      role: 'admin',
      createdAt: FieldValue.serverTimestamp()
    });

    res.send('Admin seeded: admin@health.com / admin123');
  } catch (err) {
    res.send('seed error');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
