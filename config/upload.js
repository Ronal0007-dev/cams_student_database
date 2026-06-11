const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'school-docs');

// Ensure directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = file.fieldname + '_' + Date.now() + ext;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${ext}. Allowed: PDF, images, Word documents`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB per file
});

// Field names matching the form
const schoolUpload = upload.fields([
  { name: 'SchoolMapFile',      maxCount: 1 },
  { name: 'PearsonCertFile',    maxCount: 1 },
  { name: 'CambridgeCertFile',  maxCount: 1 },
  { name: 'LogoFile',           maxCount: 1 }
]);

module.exports = { schoolUpload, UPLOAD_DIR };
