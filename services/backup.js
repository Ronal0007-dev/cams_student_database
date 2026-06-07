/**
 * SMS — Database Backup Service
 * ─────────────────────────────
 * • Auto-detects mysqldump on Windows / Linux / Mac
 * • Falls back to pure-Node SQL export if mysqldump not found
 * • Compresses the dump to .sql.gz
 * • Emails it as an attachment via nodemailer
 * • Deletes local backup files older than BACKUP_RETENTION_DAYS
 * • Logs every backup attempt to backups/backup.log
 */

require('dotenv').config();
const { execFile }  = require('child_process');
const fs            = require('fs');
const path          = require('path');
const zlib          = require('zlib');
const os            = require('os');
const nodemailer    = require('nodemailer');
const cron          = require('node-cron');

// ── Config ────────────────────────────────────────────────────────
const DB_HOST     = process.env.DB_HOST  || 'localhost';
const DB_PORT     = process.env.DB_PORT  || '3306';
const DB_NAME     = process.env.DB_NAME  || 'student_management';
const DB_USER     = process.env.DB_USER  || 'root';
const DB_PASS     = process.env.DB_PASS  || '';

const SMTP_HOST   = process.env.SMTP_HOST    || 'smtp.gmail.com';
const SMTP_PORT   = parseInt(process.env.SMTP_PORT || '587');
const SMTP_SECURE = process.env.SMTP_SECURE  === 'true';
const SMTP_USER   = process.env.SMTP_USER    || '';
const SMTP_PASS   = process.env.SMTP_PASS    || '';

const EMAIL_TO    = process.env.BACKUP_EMAIL_TO || '';
const EMAIL_CC    = process.env.BACKUP_EMAIL_CC || '';
const RETENTION   = parseInt(process.env.BACKUP_RETENTION_DAYS || '30');
const SCHEDULE    = process.env.BACKUP_SCHEDULE || '0 2 */7 * *';

const BACKUP_DIR  = path.join(__dirname, '..', 'backups');
const LOG_FILE    = path.join(BACKUP_DIR, 'backup.log');

// ── Helpers ───────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');

function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` +
         `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (_) {}
}

function formatBytes(b) {
  if (b < 1024)    return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function humanSchedule(s) {
  if (s === '0 2 */7 * *') return 'Every 7 days at 02:00';
  return s;
}

// ── Step 1a: Find mysqldump binary ───────────────────────────────
function findMysqldump() {
  // Allow explicit path override via .env MYSQLDUMP_PATH
  if (process.env.MYSQLDUMP_PATH) {
    const override = process.env.MYSQLDUMP_PATH.trim();
    if (fs.existsSync(override)) {
      log(`🔧 Using MYSQLDUMP_PATH from .env: ${override}`);
      return override;
    }
    log(`⚠ MYSQLDUMP_PATH set in .env but not found: ${override}`);
  }

  const isWin = os.platform() === 'win32';

  // Common Windows installation paths
  const windowsPaths = [
    // XAMPP (most common on Windows dev)
    'C:\\xampp\\mysql\\bin\\mysqldump.exe',
    'C:\\xampp\\mysql\\bin\\mysqldump',
    // MySQL Installer default paths
    'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.1\\bin\\mysqldump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.2\\bin\\mysqldump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.3\\bin\\mysqldump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqldump.exe',
    'C:\\Program Files\\MySQL\\MySQL Server 5.7\\bin\\mysqldump.exe',
    'C:\\Program Files (x86)\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
    // WAMP
    'C:\\wamp64\\bin\\mysql\\mysql8.0.31\\bin\\mysqldump.exe',
    'C:\\wamp\\bin\\mysql\\mysql8.0.31\\bin\\mysqldump.exe',
    'C:\\wamp64\\bin\\mysql\\mysql8.0.27\\bin\\mysqldump.exe',
    // Laragon
    'C:\\laragon\\bin\\mysql\\mysql-8.0.30-winx64\\bin\\mysqldump.exe',
    'C:\\laragon\\bin\\mysql\\mysql-8.1.0-winx64\\bin\\mysqldump.exe',
    // MariaDB (used by XAMPP sometimes)
    'C:\\xampp\\mysql\\bin\\mariadump.exe',
    'C:\\Program Files\\MariaDB 10.11\\bin\\mysqldump.exe',
    'C:\\Program Files\\MariaDB 10.6\\bin\\mysqldump.exe',
  ];

  // Unix paths
  const unixPaths = [
    '/usr/bin/mysqldump',
    '/usr/local/bin/mysqldump',
    '/opt/homebrew/bin/mysqldump',   // macOS Apple Silicon Homebrew
    '/usr/local/mysql/bin/mysqldump',
    '/opt/local/bin/mysqldump',
  ];

  const candidates = isWin ? windowsPaths : unixPaths;

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      log(`🔍 Found mysqldump at: ${p}`);
      return p;
    }
  }

  // Try scanning WAMP/XAMPP dynamically for any version
  if (isWin) {
    const scanRoots = ['C:\\xampp\\mysql\\bin', 'C:\\wamp64\\bin\\mysql', 'C:\\wamp\\bin\\mysql', 'C:\\laragon\\bin\\mysql'];
    for (const root of scanRoots) {
      if (!fs.existsSync(root)) continue;
      try {
        const subs = fs.readdirSync(root);
        for (const sub of subs) {
          const candidate = path.join(root, sub, 'bin', 'mysqldump.exe');
          if (fs.existsSync(candidate)) {
            log(`🔍 Found mysqldump at: ${candidate}`);
            return candidate;
          }
        }
      } catch (_) {}
    }
  }

  return null; // not found — will use Node fallback
}

// ── Step 1b: mysqldump-based dump ────────────────────────────────
function dumpWithMysqldump(sqlFile, mysqldumpPath) {
  return new Promise((resolve, reject) => {
    const args = [
      `--host=${DB_HOST}`,
      `--port=${DB_PORT}`,
      `--user=${DB_USER}`,
      '--single-transaction',
      '--routines',
      '--triggers',
      '--add-drop-table',
      '--complete-insert',
      '--default-character-set=utf8mb4',
      '--result-file=' + sqlFile,
      DB_NAME
    ];

    // Pass password via env var to avoid it appearing in process list
    const env = { ...process.env };
    if (DB_PASS) {
      env.MYSQL_PWD = DB_PASS;
    } else {
      args.unshift('--password=');
    }

    execFile(mysqldumpPath, args, { env }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(`mysqldump failed: ${(stderr || err.message).trim()}`));
      }
      resolve();
    });
  });
}

// ── Step 1c: Pure-Node SQL dump fallback ─────────────────────────
// Used when mysqldump is not available. Exports all tables as INSERT statements.
async function dumpWithNode(sqlFile) {
  log('⚠  mysqldump not found — using built-in Node.js SQL exporter (no stored procedures)');

  const mysql = require('mysql2/promise');
  const conn  = await mysql.createConnection({
    host: DB_HOST, port: DB_PORT,
    user: DB_USER, password: DB_PASS,
    database: DB_NAME,
    multipleStatements: true
  });

  const lines = [];
  const now   = new Date().toISOString();

  lines.push(`-- SMS Database Backup`);
  lines.push(`-- Database: ${DB_NAME}`);
  lines.push(`-- Generated: ${now}`);
  lines.push(`-- Method: Node.js built-in exporter`);
  lines.push(`--`);
  lines.push(`SET NAMES utf8mb4;`);
  lines.push(`SET FOREIGN_KEY_CHECKS=0;`);
  lines.push(`SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';`);
  lines.push('');

  // Get all tables
  const [tables] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`,
    [DB_NAME]
  );

  for (const row of tables) {
    const tbl = row.TABLE_NAME;
    lines.push(`-- ─────────────────────────────────`);
    lines.push(`-- Table: \`${tbl}\``);
    lines.push(`-- ─────────────────────────────────`);

    // DROP + CREATE
    const [[createRow]] = await conn.query(`SHOW CREATE TABLE \`${tbl}\``);
    lines.push(`DROP TABLE IF EXISTS \`${tbl}\`;`);
    lines.push(createRow['Create Table'] + ';');
    lines.push('');

    // Rows — fetch in batches of 500 to keep memory low
    const BATCH = 500;
    let offset  = 0;
    while (true) {
      const [rows] = await conn.query(`SELECT * FROM \`${tbl}\` LIMIT ${BATCH} OFFSET ${offset}`);
      if (rows.length === 0) break;

      for (const r of rows) {
        const vals = Object.values(r).map(v => {
          if (v === null) return 'NULL';
          if (typeof v === 'number') return String(v);
          if (v instanceof Date) return `'${v.toISOString().slice(0,19).replace('T',' ')}'`;
          return `'${String(v).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'\\r')}'`;
        });
        lines.push(`INSERT INTO \`${tbl}\` VALUES (${vals.join(', ')});`);
      }
      offset += BATCH;
    }
    lines.push('');
  }

  lines.push('SET FOREIGN_KEY_CHECKS=1;');
  lines.push(`-- End of backup`);

  await conn.end();

  fs.writeFileSync(sqlFile, lines.join('\n'), 'utf8');
  log(`✅ Node.js SQL export complete — ${tables.length} tables`);
}

// ── Step 2: gzip compress ─────────────────────────────────────────
function compressFile(sqlFile, gzFile) {
  return new Promise((resolve, reject) => {
    const src  = fs.createReadStream(sqlFile);
    const dest = fs.createWriteStream(gzFile);
    const gz   = zlib.createGzip({ level: 9 });
    src.pipe(gz).pipe(dest);
    dest.on('finish', resolve);
    dest.on('error', reject);
    src.on('error',  reject);
  });
}

// ── Step 3: send email ────────────────────────────────────────────
async function sendEmail(gzFile, fileSizeBytes, method) {
  if (!SMTP_USER || !EMAIL_TO) {
    log('⚠ Email not configured — skipping email send');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls:  { rejectUnauthorized: false }
  });

  const fileName = path.basename(gzFile);

  const html = `
  <div style="font-family:'Outfit',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f1424;color:#f1f5f9;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#3b82f6,#7c3aed);padding:28px 32px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;background:rgba(255,255,255,0.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;">🎓</div>
        <div>
          <div style="font-size:1.2rem;font-weight:800;letter-spacing:0.05em;">SMS Backup Report</div>
          <div style="font-size:0.8rem;opacity:0.8;">Student Management System</div>
        </div>
      </div>
    </div>
    <div style="padding:28px 32px;">
      <div style="background:#1a2035;border:1px solid #1e2840;border-radius:12px;padding:20px;margin-bottom:20px;">
        <div style="font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:14px;">Backup Details</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#64748b;font-size:0.82rem;width:140px;">Status</td>
              <td style="padding:8px 0;"><span style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);border-radius:20px;padding:3px 12px;font-size:0.78rem;font-weight:700;">✅ SUCCESS</span></td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:0.82rem;border-top:1px solid #1e2840;">Database</td>
              <td style="padding:8px 0;font-family:monospace;color:#60a5fa;border-top:1px solid #1e2840;">${DB_NAME}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:0.82rem;border-top:1px solid #1e2840;">File Name</td>
              <td style="padding:8px 0;font-family:monospace;font-size:0.82rem;border-top:1px solid #1e2840;">${fileName}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:0.82rem;border-top:1px solid #1e2840;">File Size</td>
              <td style="padding:8px 0;border-top:1px solid #1e2840;">${formatBytes(fileSizeBytes)}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:0.82rem;border-top:1px solid #1e2840;">Method</td>
              <td style="padding:8px 0;border-top:1px solid #1e2840;">${method}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:0.82rem;border-top:1px solid #1e2840;">Date &amp; Time</td>
              <td style="padding:8px 0;border-top:1px solid #1e2840;">${new Date().toLocaleString('en-GB',{dateStyle:'full',timeStyle:'medium'})}</td></tr>
          <tr><td style="padding:8px 0;color:#64748b;font-size:0.82rem;border-top:1px solid #1e2840;">Schedule</td>
              <td style="padding:8px 0;border-top:1px solid #1e2840;">${humanSchedule(SCHEDULE)}</td></tr>
        </table>
      </div>
      <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:14px 16px;font-size:0.8rem;color:#fcd34d;">
        <strong>📎 Attachment:</strong> The compressed backup (.sql.gz) is attached.<br>
        <strong>To restore:</strong><br>
        <code style="background:rgba(0,0,0,0.3);padding:4px 8px;border-radius:4px;display:inline-block;margin-top:6px;font-size:0.78rem;">
          gunzip ${fileName} &amp;&amp; mysql -u ${DB_USER} -p ${DB_NAME} &lt; ${fileName.replace('.gz','')}
        </code>
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #1e2840;font-size:0.72rem;color:#64748b;text-align:center;">
      SMS — Student Management System &nbsp;·&nbsp; Automated Backup &nbsp;·&nbsp; Do not reply
    </div>
  </div>`;

  await transporter.sendMail({
    from:        `"SMS Backup" <${SMTP_USER}>`,
    to:          EMAIL_TO,
    cc:          EMAIL_CC || undefined,
    subject:     `📦 SMS Database Backup — ${DB_NAME} — ${new Date().toLocaleDateString('en-GB')}`,
    html,
    text:        `SMS Backup\nDatabase: ${DB_NAME}\nFile: ${fileName}\nSize: ${formatBytes(fileSizeBytes)}\nDate: ${new Date().toISOString()}`,
    attachments: [{ filename: fileName, path: gzFile }]
  });
  log(`📧 Backup email sent to ${EMAIL_TO}`);
}

// ── Step 4: clean old local backups ───────────────────────────────
function cleanOldBackups() {
  const cutoff = Date.now() - RETENTION * 86400000;
  try {
    fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql.gz') || f.endsWith('.sql'))
      .forEach(f => {
        const fp = path.join(BACKUP_DIR, f);
        if (fs.statSync(fp).mtimeMs < cutoff) {
          fs.unlinkSync(fp);
          log(`🗑  Deleted old backup: ${f}`);
        }
      });
  } catch (err) {
    log(`⚠ Cleanup error: ${err.message}`);
  }
}

// ── Main backup runner ────────────────────────────────────────────
async function runBackup() {
  log('═══════════════════════════════════════════');
  log(`🚀 Starting database backup — ${DB_NAME}`);

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const ts      = timestamp();
  const sqlFile = path.join(BACKUP_DIR, `${DB_NAME}_${ts}.sql`);
  const gzFile  = sqlFile + '.gz';
  let   method  = '';

  try {
    // 1. Dump — try mysqldump first, fall back to Node exporter
    const mysqldumpPath = findMysqldump();

    if (mysqldumpPath) {
      method = `mysqldump (${path.basename(mysqldumpPath)})`;
      log(`💾 Dumping with mysqldump → ${path.basename(sqlFile)}`);
      await dumpWithMysqldump(sqlFile, mysqldumpPath);
    } else {
      method = 'Node.js built-in exporter';
      log(`💾 mysqldump not found — using Node.js exporter → ${path.basename(sqlFile)}`);
      await dumpWithNode(sqlFile);
    }

    const sqlSize = fs.statSync(sqlFile).size;
    log(`✅ Dump complete — raw size: ${formatBytes(sqlSize)}`);

    // 2. Compress
    log('🗜  Compressing…');
    await compressFile(sqlFile, gzFile);
    const gzSize = fs.statSync(gzFile).size;
    const saved  = sqlSize > 0 ? Math.round((1 - gzSize/sqlSize)*100) : 0;
    log(`✅ Compressed → ${path.basename(gzFile)} (${formatBytes(gzSize)}, ${saved}% smaller)`);

    // 3. Remove uncompressed sql
    fs.unlinkSync(sqlFile);

    // 4. Email
    await sendEmail(gzFile, gzSize, method);

    // 5. Clean old backups
    cleanOldBackups();

    log(`✅ Backup completed successfully`);
    log('═══════════════════════════════════════════');
    return { success: true, file: gzFile, size: gzSize, method };

  } catch (err) {
    log(`❌ Backup FAILED: ${err.message}`);
    log('═══════════════════════════════════════════');

    // Send failure alert
    try {
      if (SMTP_USER && EMAIL_TO) {
        const t = nodemailer.createTransport({
          host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_SECURE,
          auth: { user: SMTP_USER, pass: SMTP_PASS },
          tls: { rejectUnauthorized: false }
        });
        await t.sendMail({
          from:    `"SMS Backup" <${SMTP_USER}>`,
          to:      EMAIL_TO,
          subject: `⚠️ SMS Backup FAILED — ${DB_NAME} — ${new Date().toLocaleDateString('en-GB')}`,
          html: `<div style="font-family:Arial;max-width:500px;padding:24px;background:#1a0000;color:#fca5a5;border-radius:12px;">
            <h2 style="color:#f87171;">⚠️ Database Backup Failed</h2>
            <p><strong>Database:</strong> ${DB_NAME}</p>
            <p><strong>Error:</strong> ${err.message}</p>
            <p><strong>Time:</strong> ${new Date().toISOString()}</p>
            <p>Please check the server and run a manual backup from the admin panel.</p>
          </div>`
        });
        log('📧 Failure alert email sent');
      }
    } catch (_) {}

    // Clean partial files
    try { if (fs.existsSync(sqlFile)) fs.unlinkSync(sqlFile); } catch (_) {}
    try { if (fs.existsSync(gzFile))  fs.unlinkSync(gzFile);  } catch (_) {}

    return { success: false, error: err.message };
  }
}

// ── Scheduler ────────────────────────────────────────────────────
function startScheduler() {
  if (!cron.validate(SCHEDULE)) {
    console.error(`❌ Invalid backup schedule: "${SCHEDULE}"`);
    return;
  }
  cron.schedule(SCHEDULE, () => {
    log(`⏰ Scheduled backup triggered (${SCHEDULE})`);
    runBackup();
  }, { timezone: 'Africa/Dar_es_Salaam' });

  log(`⏰ Backup scheduler active — "${SCHEDULE}" (${humanSchedule(SCHEDULE)})`);
  log(`   Backup email → ${EMAIL_TO || '(email not configured)'}`);

  // Log which mysqldump will be used at startup
  const found = findMysqldump();
  if (found) {
    log(`🔧 mysqldump found: ${found}`);
  } else {
    log('🔧 mysqldump not in PATH — will use Node.js built-in SQL exporter');
  }
}

module.exports = { runBackup, startScheduler };
