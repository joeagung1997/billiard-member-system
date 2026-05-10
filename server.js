// ============================================================
//  SISTEM MEMBER BILLIARD - Railway.app
//  Versi: PIN Kasir — hanya HP kasir yang bisa check-in
//
//  Alur:
//  1. Member tunjukkan QR ke kasir
//  2. Kasir scan QR dengan HP kasir
//  3. Muncul halaman "Masukkan PIN Kasir"
//  4. Kasir input PIN → check-in berhasil
//  5. HP member yang scan sendiri → tidak bisa tanpa PIN
//
//  Tambahkan variable KASIR_PIN di Railway Variables
// ============================================================

const express = require("express");
const fs      = require("fs");
const path    = require("path");
const cron    = require("node-cron");
const QRCode  = require("qrcode");

const app  = express();
const PORT = process.env.PORT || 3000;

const NAMA_ARENA = process.env.NAMA_ARENA || "Warpat Jombang";
const BATAS_MAIN = parseInt(process.env.BATAS_MAIN) || 10;
const BATAS_HARI = parseInt(process.env.BATAS_HARI) || 30;
const ADMIN_PIN  = process.env.ADMIN_PIN  || "1234";
const KASIR_PIN  = process.env.KASIR_PIN  || "5678";

const DATA_DIR = fs.existsSync("/data") ? "/data" : __dirname;
const DB_PATH  = path.join(DATA_DIR, "db.json");

function bacaDB() {
  try { if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, "utf8")); }
  catch (e) { console.error("bacaDB:", e.message); }
  return { members: [] };
}
function simpanDB(data) {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8"); }
  catch (e) { console.error("simpanDB:", e.message); }
}
if (!fs.existsSync(DB_PATH)) simpanDB({ members: [] });

// ── LOG AKTIVITAS ─────────────────────────────────────────────
const LOG_PATH = require("path").join(DATA_DIR, "log.json");

function bacaLog() {
  try { if (require("fs").existsSync(LOG_PATH)) return JSON.parse(require("fs").readFileSync(LOG_PATH,"utf8")); }
  catch(e){}
  return [];
}
function catatLog(kode, nama, aksi, detail) {
  try {
    const log = bacaLog();
    log.unshift({ ts: new Date().toISOString(), kode, nama, aksi, detail: detail||"" });
    if (log.length > 500) log.splice(500); // simpan max 500 entri
    require("fs").writeFileSync(LOG_PATH, JSON.stringify(log), "utf8");
  } catch(e){}
}



function formatTanggal(date) {
  return new Date(date).toLocaleString("id-ID", {
    weekday:"long", day:"numeric", month:"long", year:"numeric",
    hour:"2-digit", minute:"2-digit", timeZone:"Asia/Jakarta"
  });
}
function selisihHari(a, b) {
  const d1 = new Date(a); d1.setHours(0,0,0,0);
  const d2 = new Date(b); d2.setHours(0,0,0,0);
  return Math.floor((d2 - d1) / 86400000);
}

// ── TIPS harian billiard ─────────────────────────────────────
const TIPS = [
  "Sesi malam lebih sepi — meja lebih leluasa, fokus lebih tajam.",
  "Ajak teman datang bareng, bonus referral menanti!",
  "Posisi tubuh yang rileks = bidikan lebih akurat. Jangan tegang.",
  "Konsisten datang di jam yang sama bantu bangun ritme permainan.",
  "Tantang pemain lain untuk sparring — cara terbaik naik level.",
  "Pegang stik di bagian belakang untuk kontrol maksimal.",
  "Break dulu kalau sudah 2 jam — fokus kembali, permainan makin tajam.",
];
function getTip() { return TIPS[new Date().getDay() % TIPS.length]; }

// ── CSS dasar semua halaman ───────────────────────────────────
const BASE_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{border-radius:24px;padding:28px 22px;max-width:360px;width:100%;text-align:center}
  .arena-tag{font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;margin-bottom:10px}
  .member-name{font-size:22px;font-weight:700;margin-bottom:8px}
  .pesan{font-size:13px;line-height:1.65;margin-bottom:14px}
  .ball-row{display:flex;justify-content:center;flex-wrap:wrap;gap:5px;margin-bottom:8px}
  .ball{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
  .bar{height:7px;border-radius:4px;margin-bottom:5px;overflow:hidden}
  .bar-fill{height:100%;border-radius:4px}
  .bar-txt{font-size:11px;margin-bottom:12px}
  .tip-box{border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.6;text-align:left;margin-bottom:12px}
  .tip-label{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
  .kode-badge{font-size:10px;font-family:monospace;margin-top:12px;opacity:.4}
  .time-txt{font-size:10px;margin-top:6px;opacity:.3}
  input[type=password]{width:100%;padding:14px;border:1.5px solid;border-radius:12px;font-size:28px;text-align:center;letter-spacing:.5em;outline:none;font-family:monospace;margin-bottom:12px;background:transparent}
  button[type=submit]{width:100%;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.04em}
  button[type=submit]:active{opacity:.85;transform:scale(.98)}
  label{display:block;font-size:12px;text-align:left;margin-bottom:5px}
  .field{width:100%;padding:10px 12px;border:1.5px solid #ddd;border-radius:10px;font-size:14px;margin-bottom:14px;outline:none}
  .field:focus{border-color:#1D9E75}
  a.btn-link{display:inline-block;border-radius:10px;padding:10px 22px;font-size:13px;font-weight:600;text-decoration:none}
`;

// ── HTML wrapper umum (admin, home, dll) ─────────────────────
function html(title, body, bg = "#f0f0f0") {
  return `<!DOCTYPE html><html lang="id"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>${NAMA_ARENA}</title>
  <style>${BASE_CSS}
    body{background:${bg}}
    .card{background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .arena-tag{color:#bbb}
    .member-name{color:#111}
    .pesan{color:#666}
    .tip-box{background:#f5f5f5;color:#555}
    .tip-label{color:#999}
    input[type=password]{border-color:#ddd;color:#111}
    button[type=submit]{background:#1D9E75;color:#fff}
    .field:focus{border-color:#1D9E75}
  </style>
  </head><body><div class="card">
  <div class="arena-tag">${NAMA_ARENA}</div>
  ${body}
  </div></body></html>`;
}

// ── Halaman PIN kasir — tema biru gelap ──────────────────────
function halamanPIN(kode, nama, errorMsg) {
  return `<!DOCTYPE html><html lang="id"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>${NAMA_ARENA}</title>
  <style>${BASE_CSS}
    body{background:#0a0f1a}
    .card{background:#0f1829;border:1px solid #1e2d45}
    .arena-tag{color:#3b82f6}
    .member-name{color:#e2e8f0}
    .pesan{color:#64748b}
    .tip-box{background:#1e293b;color:#94a3b8;border:1px solid #1e3a5f}
    .tip-label{color:#3b82f6}
    input[type=password]{border-color:#1e3a5f;color:#e2e8f0;background:#0d1b2e}
    input[type=password]:focus{border-color:#3b82f6}
    button[type=submit]{background:#2563eb;color:#fff}
    .kode-badge{color:#3b82f6}
    ${errorMsg ? ".err{background:#1f0a0a;color:#f87171;border:1px solid #7f1d1d;border-radius:10px;padding:8px 12px;font-size:12px;margin-bottom:12px}" : ""}
  </style>
  </head><body><div class="card">
  <div class="arena-tag">${NAMA_ARENA}</div>
  <div style="font-size:36px;margin-bottom:10px">🔐</div>
  <div style="font-size:17px;font-weight:700;color:#60a5fa;margin-bottom:4px">Konfirmasi Check-in</div>
  <div class="member-name">${nama}</div>
  <p class="pesan" style="margin-bottom:14px">Kasir: masukkan PIN untuk<br>konfirmasi kehadiran member.</p>
  ${errorMsg ? `<div class="err">${errorMsg}</div>` : ""}
  <form action="/checkin" method="POST">
    <input type="hidden" name="id" value="${kode}">
    <input type="password" name="pin" placeholder="••••" maxlength="8" autofocus autocomplete="off">
    <button type="submit">Konfirmasi Check-in</button>
  </form>
  <div class="tip-box" style="margin-top:14px">
    <div class="tip-label">Info</div>
    Hanya kasir yang bisa konfirmasi check-in. Member cukup tunjukkan QR.
  </div>
  <div class="kode-badge">${kode}</div>
  </div></body></html>`;
}

// ── Halaman hasil check-in — tema billiard gelap ─────────────
function halamanHasil(tipe, d) {
  const tm  = d.totalMain || 0;
  const sisa = Math.max(0, BATAS_MAIN - tm);
  const pct = Math.min(Math.round(tm / BATAS_MAIN * 100), 100);

  // Bola billiard
  let bola = "";
  for (let i = 1; i <= BATAS_MAIN; i++) {
    if (i === BATAS_MAIN) {
      bola += `<div class="ball" style="background:#854d0e;color:#fef08a;font-size:9px">FREE</div>`;
    } else if (i < tm) {
      bola += `<div class="ball" style="background:#16a34a;color:#fff">${i}</div>`;
    } else if (i === tm) {
      bola += `<div class="ball" style="background:#15803d;color:#fff;box-shadow:0 0 0 3px #4ade80">${i}</div>`;
    } else {
      bola += `<div class="ball" style="background:#1a2e1e;color:#2d4a30">${i}</div>`;
    }
  }

  // Bola untuk sudah scan (amber)
  let bolaAmber = "";
  for (let i = 1; i <= BATAS_MAIN; i++) {
    if (i === BATAS_MAIN) {
      bolaAmber += `<div class="ball" style="background:#854d0e;color:#fef08a;font-size:9px">FREE</div>`;
    } else if (i <= tm) {
      bolaAmber += `<div class="ball" style="background:#a16207;color:#fef08a">${i}</div>`;
    } else {
      bolaAmber += `<div class="ball" style="background:#2a1e08;color:#4a3510">${i}</div>`;
    }
  }

  // ── SUKSES ───────────────────────────────────────────────────
  if (tipe === "sukses") {
    return `<!DOCTYPE html><html lang="id"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
    <title>${NAMA_ARENA}</title>
    <style>${BASE_CSS}
      body{background:#0a1a0f}
      .card{background:#0d1b12;border:1px solid #1a3320}
      .arena-tag{color:#4ade80}
      .member-name{color:#fff}
      .pesan{color:#4ade80}
      .bar{background:#1a3320}
      .bar-txt{color:#4ade80}
      .tip-box{background:#1a2e1e;color:#86efac;border:1px solid #1a3a20}
      .tip-label{color:#4ade80}
      .kode-badge{color:#4ade80}
      .prog-box{background:#1a2e1e;border-radius:12px;padding:12px 14px;margin-bottom:12px}
      .prog-label{font-size:10px;font-weight:700;color:#4ade80;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
    </style>
    </head><body><div class="card">
    <div class="arena-tag">${NAMA_ARENA}</div>
    <div style="font-size:38px;margin-bottom:8px">🎱</div>
    <div style="font-size:18px;font-weight:700;color:#4ade80;margin-bottom:4px">Check-in Berhasil!</div>
    <div class="member-name">${d.nama||""}</div>
    <p class="pesan" style="margin-bottom:12px">
      ${d.expired ? "Periode baru dimulai — selamat main!" : `Kunjungan ke-<strong>${tm}</strong> bulan ini`}
    </p>
    ${d.expired ? `<div style="background:#1a2e1e;color:#86efac;border:1px solid #1a3a20;border-radius:10px;padding:8px 12px;font-size:12px;margin-bottom:12px">Periode bonus bulan lalu sudah berakhir. Mulai lagi dari awal — semangat!</div>` : ""}
    <div class="prog-box">
      <div class="prog-label">Progress bulan ini</div>
      <div class="ball-row">${bola}</div>
      <div class="bar"><div class="bar-fill" style="background:#16a34a;width:${pct}%"></div></div>
      <div class="bar-txt">${tm} dari ${BATAS_MAIN} sesi &nbsp;·&nbsp; <strong style="color:#4ade80">${sisa} lagi</strong> untuk main gratis</div>
    </div>
    <div class="tip-box">
      <div class="tip-label">Tip hari ini</div>
      ${getTip()}
    </div>
    <div class="kode-badge">${d.kode||""}</div>
    <div class="time-txt" style="color:#4ade80">${formatTanggal(new Date())}</div>
    </div></body></html>`;
  }

  // ── SUDAH SCAN ───────────────────────────────────────────────
  if (tipe === "sudahScan") {
    return `<!DOCTYPE html><html lang="id"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
    <title>${NAMA_ARENA}</title>
    <style>${BASE_CSS}
      body{background:#1a1208}
      .card{background:#1c1309;border:1px solid #2d2008}
      .arena-tag{color:#fbbf24}
      .member-name{color:#fff}
      .pesan{color:#a37a2a}
      .tip-box{background:#2a1e08;color:#fde68a;border:1px solid #3d2e0f}
      .tip-label{color:#fbbf24}
      .prog-box{background:#2a1e08;border-radius:12px;padding:12px 14px;margin-bottom:12px}
      .prog-label{font-size:10px;font-weight:700;color:#fbbf24;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
      .bar-txt{color:#fbbf24}
    </style>
    </head><body><div class="card">
    <div class="arena-tag">${NAMA_ARENA}</div>
    <div style="font-size:38px;margin-bottom:8px">⏰</div>
    <div style="font-size:18px;font-weight:700;color:#fbbf24;margin-bottom:4px">Sudah Check-in Hari Ini</div>
    <div class="member-name">${d.nama||""}</div>
    <p class="pesan" style="margin-bottom:12px">
      Tercatat pukul <strong style="color:#fbbf24">${d.jamScan||""}</strong>.<br>
      Sampai jumpa besok — meja sudah menunggu!
    </p>
    <div class="prog-box">
      <div class="prog-label">Status bulan ini</div>
      <div class="ball-row">${bolaAmber}</div>
      <div class="bar-txt">${tm} dari ${BATAS_MAIN} sesi bulan ini</div>
    </div>
    <div class="tip-box">
      <div class="tip-label">Info</div>
      Scan berikutnya bisa dilakukan mulai besok. Istirahat dulu, besok mainkan lagi dengan fresh!
    </div>
    <div class="time-txt" style="color:#fbbf24">${formatTanggal(new Date())}</div>
    </div></body></html>`;
  }

  // ── GRATIS ───────────────────────────────────────────────────
  if (tipe === "gratis") {
    return `<!DOCTYPE html><html lang="id"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
    <title>${NAMA_ARENA}</title>
    <style>${BASE_CSS}
      body{background:#0d0d0d}
      .card{background:#111;border:1px solid #2a2000}
      .arena-tag{color:#fbbf24}
      .member-name{color:#fff}
      .tip-box{background:#1a1500;color:#fde68a;border:1px dashed #854d0e}
      .tip-label{color:#fbbf24}
      .kode-badge{color:#fbbf24}
    </style>
    </head><body><div class="card">
    <div class="arena-tag">${NAMA_ARENA}</div>
    <div style="font-size:48px;margin-bottom:8px">🏆</div>
    <div style="font-size:13px;font-weight:700;color:#fbbf24;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Selamat!</div>
    <div style="font-size:26px;font-weight:700;color:#fff;margin-bottom:4px">${d.nama||""}</div>
    <div style="background:#1a1500;border:1.5px solid #854d0e;border-radius:14px;padding:14px 16px;margin-bottom:14px">
      <div style="font-size:13px;color:#fde68a;line-height:1.7">
        Kamu sudah main <strong style="color:#fbbf24;font-size:16px">${BATAS_MAIN}x</strong> bulan ini!<br>
        Sesi berikutnya <span style="color:#fef08a;font-size:18px;font-weight:700">GRATIS</span> untukmu 🎉
      </div>
    </div>
    <div style="background:#16a34a;border-radius:10px;padding:9px 14px;font-size:12px;color:#fff;font-weight:600;margin-bottom:12px">
      Reward ke-${d.totalGratis||1} yang kamu dapat 🎯
    </div>
    <div class="tip-box">
      <div class="tip-label">Cara klaim</div>
      Tunjukkan halaman ini ke kasir sebelum mulai main. Berlaku untuk sesi berikutnya saja — jangan tutup layar ini dulu!
    </div>
    <div class="kode-badge">${d.kode||""}</div>
    <div class="time-txt" style="color:#fbbf24">${formatTanggal(new Date())}</div>
    </div></body></html>`;
  }

  // ── ERROR ────────────────────────────────────────────────────
  return `<!DOCTYPE html><html lang="id"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>${NAMA_ARENA}</title>
  <style>${BASE_CSS}
    body{background:#1a0a0a}
    .card{background:#1f0f0f;border:1px solid #3d1515}
    .arena-tag{color:#f87171}
    .tip-box{background:#2a1212;color:#fca5a5;border:1px solid #7f1d1d}
    .tip-label{color:#f87171}
  </style>
  </head><body><div class="card">
  <div class="arena-tag">${NAMA_ARENA}</div>
  <div style="font-size:38px;margin-bottom:8px">❌</div>
  <div style="font-size:18px;font-weight:700;color:#f87171;margin-bottom:10px">${d.judul||"Error"}</div>
  <p style="font-size:13px;color:#fca5a5;line-height:1.65;margin-bottom:14px">${d.pesan||""}</p>
  <div class="tip-box">
    <div class="tip-label">Perlu bantuan?</div>
    Hubungi kasir atau pemilik arena untuk mendaftarkan QR kamu.
  </div>
  </div></body></html>`;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── HOME ─────────────────────────────────────────────────────
app.get("/", (req, res) => res.send(html("Beranda",`
  <div class="ic" style="background:#f5f5f5;font-size:32px">🎱</div>
  <h1 style="color:#111">${NAMA_ARENA}</h1>
  <p class="pesan">Sistem member berjalan normal.</p>
  <a href="/admin" class="btn" style="background:#1D9E75;color:#fff">Dashboard Admin</a>
`)));

// ── SCAN: tampilkan form PIN kasir ───────────────────────────
app.get("/scan", (req, res) => {
  const kode = (req.query.id||"").trim().toUpperCase();

  if (!kode) return res.send(halamanHasil("error",{
    judul:"QR Tidak Valid", pesan:"QR code tidak mengandung kode member. Hubungi kasir."
  }));

  const db  = bacaDB();
  const idx = db.members.findIndex(m => m.kode.toUpperCase()===kode);
  if (idx===-1) return res.send(halamanHasil("error",{
    judul:"Member Tidak Ditemukan", pesan:`Kode "${kode}" tidak terdaftar. Hubungi kasir.`
  }));

  const m = db.members[idx];
  res.send(halamanPIN(kode, m.nama, null));
});

// ── CHECKIN: verifikasi PIN lalu proses ───────────────────────
app.post("/checkin", (req, res) => {
  const kode = (req.body.id||"").trim().toUpperCase();
  const pin  = (req.body.pin||"").trim();

  // PIN salah
  if (pin !== KASIR_PIN) {
    const db = bacaDB();
    const m  = db.members.find(m=>m.kode===kode);
    return res.send(halamanPIN(kode, m?m.nama:kode, "PIN salah. Coba lagi."));
  }

  // PIN benar — proses check-in
  const db  = bacaDB();
  const idx = db.members.findIndex(m=>m.kode.toUpperCase()===kode);
  if (idx===-1) return res.send(halamanHasil("error",{judul:"Member Tidak Ditemukan",pesan:"Kode tidak ditemukan."}));

  const m     = db.members[idx];
  const today = new Date();

  // Sudah scan hari ini
  if (m.sudahScanHariIni && m.tanggalScanTerakhir) {
    const wkt = new Date(m.tanggalScanTerakhir).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"});
    return res.send(halamanHasil("sudahScan",{
      judul:"Sudah Check-in Hari Ini", nama:m.nama, jamScan:wkt,
      pesan:"", totalMain:m.totalMain
    }));
  }

  let expired = false;
  if (m.tanggalMulai) {
    if (selisihHari(m.tanggalMulai, today) >= BATAS_HARI) {
      expired=true; m.totalMain=0; m.tanggalMulai=today.toISOString();
    }
  } else m.tanggalMulai=today.toISOString();

  m.totalMain++;
  m.sudahScanHariIni=true;
  m.tanggalScanTerakhir=today.toISOString();

  // 10x → gratis
  if (m.totalMain >= BATAS_MAIN) {
    m.totalGratis=(m.totalGratis||0)+1;
    m.status="GRATIS"; m.tanggalMulai=today.toISOString();
    const tg=m.totalGratis, tn=m.totalMain; m.totalMain=0;
    db.members[idx]=m; simpanDB(db);
    catatLog(kode,m.nama,"REWARD_GRATIS","Reward ke-"+tg);
    return res.send(halamanHasil("gratis",{
      judul:"Selamat! Main Gratis!", nama:m.nama,
      pesan:`${m.nama} sudah main ${tn}x! Main berikutnya GRATIS.`,
      totalGratis:tg, kode
    }));
  }

  m.status="-"; db.members[idx]=m; simpanDB(db);
  catatLog(kode,m.nama,expired?"SCAN_RESET":"SCAN","Kunjungan ke-"+m.totalMain);
  return res.send(halamanHasil("sukses",{
    judul:"Check-in Berhasil!", nama:m.nama,
    pesan:expired?`Periode bonus direset. Kunjungan ke-1 periode baru!`
      :`Kunjungan ke-${m.totalMain} bulan ini. Butuh ${BATAS_MAIN-m.totalMain}x lagi untuk GRATIS!`,
    totalMain:m.totalMain, kode, expired
  }));
});

// ── SESSION TOKEN — enkripsi PIN di URL ─────────────────────
// PIN tidak pernah muncul di URL. Diganti token sementara.
const crypto   = require("crypto");
const sessions = new Map(); // token -> { pin, exp }

function buatToken(pin) {
  const token = crypto.randomBytes(24).toString("hex");
  const exp   = Date.now() + 4 * 60 * 60 * 1000; // 4 jam
  sessions.set(token, { pin, exp });
  return token;
}

function cekToken(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.exp) { sessions.delete(token); return null; }
  return s.pin;
}

// Bersihkan session expired tiap 30 menit
setInterval(() => {
  for (const [k, v] of sessions) {
    if (Date.now() > v.exp) sessions.delete(k);
  }
}, 30 * 60 * 1000);

// ── ADMIN LOGIN ───────────────────────────────────────────────
app.get("/admin", (req, res) => {
  // Cek token session dulu
  const tk  = req.query.tk || "";
  const pin = tk ? cekToken(tk) : (req.query.pin || "");

  if (!pin || pin !== ADMIN_PIN) {
    const errMsg = req.query.err ? "PIN salah. Coba lagi." : "";
    return res.send(`<!DOCTYPE html><html lang="id"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Admin — ${NAMA_ARENA}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0f1a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
      .card{background:#0f1829;border:1px solid #1e2d45;border-radius:20px;padding:32px 24px;max-width:340px;width:100%;text-align:center}
      .logo{font-size:40px;margin-bottom:12px}
      .arena{font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#3b82f6;margin-bottom:8px}
      h1{font-size:20px;font-weight:700;color:#e2e8f0;margin-bottom:4px}
      .sub{font-size:13px;color:#475569;margin-bottom:24px}
      input{width:100%;padding:14px;background:#0d1b2e;border:1.5px solid #1e3a5f;border-radius:12px;font-size:28px;text-align:center;letter-spacing:.5em;color:#e2e8f0;outline:none;font-family:monospace;margin-bottom:12px}
      input:focus{border-color:#3b82f6}
      button{width:100%;background:#2563eb;color:#fff;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.04em}
      button:active{opacity:.85}
      .err{background:#1f0a0a;color:#f87171;border:1px solid #7f1d1d;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:14px}
    </style>
    </head><body><div class="card">
    <div class="logo">🎱</div>
    <div class="arena">${NAMA_ARENA}</div>
    <h1>Admin Panel</h1>
    <p class="sub">Masukkan PIN untuk masuk</p>
    ${errMsg ? `<div class="err">${errMsg}</div>` : ""}
    <form action="/admin/login" method="post">
      <input type="password" name="pin" placeholder="••••" maxlength="8" autofocus autocomplete="off">
      <button type="submit">Masuk</button>
    </form>
    </div></body></html>`);
  }

  // PIN valid — buat token baru jika belum ada
  const token = tk || buatToken(pin);
  const db  = bacaDB();
  const log = bacaLog();

  const totalMember   = db.members.length;
  const scanHariIni   = db.members.filter(m => m.sudahScanHariIni).length;
  const rewardPending = db.members.filter(m => m.status === "GRATIS").length;
  const aktifBulanIni = db.members.filter(m => m.totalMain > 0).length;

  // Riwayat scan hari ini
  const scanList = db.members
    .filter(m => m.sudahScanHariIni && m.tanggalScanTerakhir)
    .sort((a,b) => new Date(b.tanggalScanTerakhir) - new Date(a.tanggalScanTerakhir))
    .map(m => {
      const jam = new Date(m.tanggalScanTerakhir).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"});
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:.5px solid var(--brd)">
        <div><span style="font-size:13px;font-weight:500;color:var(--txt)">${m.nama}</span>
        <span style="font-size:10px;font-family:monospace;color:var(--muted);margin-left:8px">${m.kode}</span></div>
        <span style="font-size:12px;color:#4ade80;font-weight:600">${jam}</span></div>`;
    }).join("") || `<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px">Belum ada yang check-in hari ini</div>`;

  // Leaderboard — top 5 by totalKunjungan
  const leaderboard = [...db.members]
    .map(m => ({ ...m, totalKunjungan: (m.totalMain||0) + (m.totalGratis||0) * BATAS_MAIN }))
    .sort((a,b) => b.totalKunjungan - a.totalKunjungan)
    .slice(0,5);

  const medals = ["🥇","🥈","🥉","4️⃣","5️⃣"];
  const lbRows = leaderboard.length === 0
    ? `<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px">Belum ada data</div>`
    : leaderboard.map((m,i) => `
      <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:.5px solid var(--brd)">
        <span style="font-size:18px;width:28px;text-align:center">${medals[i]}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.nama}</div>
          <div style="font-size:10px;font-family:monospace;color:var(--muted)">${m.kode}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:14px;font-weight:700;color:#4ade80">${m.totalKunjungan}<span style="font-size:10px;font-weight:400;color:var(--muted)"> kunjungan</span></div>
          <div style="font-size:10px;color:var(--muted)">${m.totalGratis||0}× reward</div>
        </div>
      </div>`).join("");

  // Log aktivitas — 20 terbaru
  const logRows = log.slice(0,20).map(l => {
    const tgl = new Date(l.ts).toLocaleString("id-ID",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"});
    const badge = l.aksi === "REWARD_GRATIS"
      ? `<span style="background:#14532d;color:#4ade80;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700">🎁 Reward</span>`
      : l.aksi === "SCAN_RESET"
      ? `<span style="background:#1e2d45;color:#60a5fa;padding:2px 7px;border-radius:6px;font-size:10px">↺ Reset</span>`
      : `<span style="background:#1a2e1e;color:#4ade80;padding:2px 7px;border-radius:6px;font-size:10px">✓ Scan</span>`;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:.5px solid var(--brd)">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:500;color:var(--txt)">${l.nama} ${badge}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${l.detail||""}</div>
      </div>
      <div style="font-size:10px;color:var(--muted);flex-shrink:0;text-align:right">${tgl}</div>
    </div>`;
  }).join("") || `<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px">Belum ada aktivitas</div>`;

  const hostBase = req.protocol + "://" + req.get("host");

  // ── Filter bulan ──────────────────────────────────────────
  const now        = new Date();
  const bulanOpts  = Array.from({length:12},(_,i)=>{
    const d = new Date(now.getFullYear(), i, 1);
    const lbl = d.toLocaleDateString("id-ID",{month:"long",year:"numeric"});
    const val = `${now.getFullYear()}-${String(i+1).padStart(2,"0")}`;
    return { val, lbl, sel: i === now.getMonth() };
  });
  const filterBulanOpts = bulanOpts.map(o=>
    `<option value="${o.val}" ${o.sel?"selected":""}>${o.lbl}</option>`
  ).join("");

  const rows = db.members.map(m => {
    const pct         = Math.round(m.totalMain / BATAS_MAIN * 100);
    const isGratis    = m.status === "GRATIS";
    const scanUrl     = hostBase + "/scan?id=" + m.kode;
    const tglDaftar   = m.tanggalDaftar ? new Date(m.tanggalDaftar).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"}) : "—";
    const tglTerakhir = m.tanggalScanTerakhir ? new Date(m.tanggalScanTerakhir).toLocaleDateString("id-ID",{day:"numeric",month:"short"}) : "—";
    // Bulan terakhir scan untuk filter
    const bulanScan   = m.tanggalScanTerakhir
      ? new Date(m.tanggalScanTerakhir).toLocaleDateString("id-ID",{year:"numeric",month:"2-digit"}).split("/").reverse().join("-")
      : "";
    const telepon     = m.telepon || "—";
    return `<tr data-bulan="${bulanScan}">
      <td>
        <span style="font-family:monospace;font-size:12px;font-weight:700;color:var(--green)">${m.kode}</span>
        <div style="font-size:11px;color:var(--txt3);margin-top:2px">${tglDaftar}</div>
      </td>
      <td>
        <div style="font-size:13px;font-weight:500;color:var(--txt)">${m.nama}</div>
        <div style="font-size:11px;color:var(--txt3);margin-top:2px;font-family:monospace">${telepon}</div>
      </td>
      <td>
        ${isGratis
          ? `<span class="badge badge-green">🎁 GRATIS</span>`
          : `<div>
              <div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div>
              <span style="font-size:11px;color:var(--green)">${m.totalMain}/${BATAS_MAIN}</span>
            </div>`
        }
      </td>
      <td>
        ${m.sudahScanHariIni
          ? `<span class="badge badge-green">✓ Hadir</span>`
          : `<span style="color:var(--txt3);font-size:12px">—</span>`
        }
      </td>
      <td>
        <span style="font-size:13px;font-weight:700;color:var(--gold)">${m.totalGratis || 0}×</span>
      </td>
      <td style="text-align:center">
        <a href="/admin/qr/${m.kode}?tk=${token}" target="_blank"
          style="display:inline-block">
          <img src="/admin/qr-img/${m.kode}?tk=${token}" width="56" height="56"
               alt="QR ${m.kode}" loading="lazy"
               style="border-radius:6px;background:#fff;padding:3px;display:block">
        </a>
      </td>
      <td>
        <div style="display:flex;gap:4px;align-items:center;justify-content:flex-end;flex-wrap:wrap">
          <a href="/admin/qr/${m.kode}?tk=${token}" class="tbl-btn tbl-btn-blue" download="QR-${m.kode}.png">⬇ QR</a>
          <button onclick="copyUrl('${scanUrl}',this)" class="tbl-btn tbl-btn-blue">Copy</button>
          ${isGratis ? `<a href="/admin/klaim?tk=${token}&kode=${m.kode}"
            onclick="return confirm('Tandai reward ${m.nama} sudah diklaim?')"
            class="tbl-btn tbl-btn-gold">Klaim</a>` : ""}
          <a href="/admin/edit?tk=${token}&kode=${m.kode}" class="tbl-btn">Edit</a>
          <a href="/admin/hapus?tk=${token}&kode=${m.kode}"
            onclick="return confirm('Hapus member ${m.nama}?')"
            class="tbl-btn tbl-btn-red">Hapus</a>
        </div>
      </td>
    </tr>`;
  }).join("");

  res.send(`<!DOCTYPE html><html lang="id" data-theme="dark"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Admin — ${NAMA_ARENA}</title>
  <style>
    /* ── Reset & base ─────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Design tokens ────────────────────────────────────── */
    :root {
      --ff: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
      --fs-xs:   11px;
      --fs-sm:   12px;
      --fs-base: 13px;
      --fs-md:   14px;
      --fs-lg:   16px;
      --fs-xl:   20px;
      --fs-2xl:  26px;
      --fw-normal: 400;
      --fw-medium: 500;
      --fw-bold:   600;
      --fw-black:  700;
      --lh: 1.5;
      --r-sm:  6px;
      --r-md:  10px;
      --r-lg:  14px;
      --r-xl:  18px;
      --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px;
      --sp-4: 16px; --sp-5: 20px; --sp-6: 24px;

      /* dark palette */
      --bg:       #070d18;
      --surface:  #0c1526;
      --surface2: #111f35;
      --border:   rgba(255,255,255,.07);
      --border2:  rgba(255,255,255,.12);
      --txt:      #e8edf5;
      --txt2:     #8496b0;
      --txt3:     #4a5e78;
      --accent:   #3b82f6;
      --green:    #22c55e;
      --green-bg: rgba(34,197,94,.12);
      --gold:     #f59e0b;
      --gold-bg:  rgba(245,158,11,.12);
      --red:      #ef4444;
      --red-bg:   rgba(239,68,68,.10);
    }
    [data-theme="light"] {
      --bg:       #f4f6fa;
      --surface:  #ffffff;
      --surface2: #f0f4f8;
      --border:   rgba(0,0,0,.07);
      --border2:  rgba(0,0,0,.12);
      --txt:      #0d1117;
      --txt2:     #556070;
      --txt3:     #94a3b8;
      --accent:   #2563eb;
      --green:    #16a34a;
      --green-bg: rgba(22,163,74,.1);
      --gold:     #d97706;
      --gold-bg:  rgba(217,119,6,.1);
      --red:      #dc2626;
      --red-bg:   rgba(220,38,38,.08);
    }

    /* ── Base ─────────────────────────────────────────────── */
    body {
      font-family: var(--ff);
      font-size: var(--fs-base);
      line-height: var(--lh);
      color: var(--txt);
      background: var(--bg);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Topbar ───────────────────────────────────────────── */
    .topbar {
      position: sticky; top: 0; z-index: 50;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: var(--sp-3) var(--sp-4);
      display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
    }
    .topbar-brand { display: flex; align-items: center; gap: var(--sp-3); }
    .topbar-logo  { font-size: 20px; line-height: 1; }
    .topbar-name  { font-size: var(--fs-md); font-weight: var(--fw-bold); color: var(--txt); letter-spacing: -.01em; }
    .topbar-label { font-size: var(--fs-xs); color: var(--txt3); margin-top: 1px; }
    .topbar-right { display: flex; align-items: center; gap: var(--sp-2); flex-shrink: 0; }
    .topbar-time  { font-size: var(--fs-xs); color: var(--txt3); }
    .theme-btn {
      background: var(--surface2); border: 1px solid var(--border2);
      border-radius: var(--r-sm); padding: 5px var(--sp-2);
      font-size: var(--fs-sm); color: var(--txt2); cursor: pointer;
      transition: opacity .15s;
    }
    .theme-btn:hover { opacity: .75; }

    /* ── Page layout ──────────────────────────────────────── */
    .page { padding: var(--sp-4); padding-bottom: 60px; max-width: 960px; margin: 0 auto; }

    /* ── Section label ────────────────────────────────────── */
    .sec-label {
      font-size: var(--fs-xs); font-weight: var(--fw-bold);
      letter-spacing: .08em; text-transform: uppercase;
      color: var(--txt3); margin-bottom: var(--sp-2); margin-top: var(--sp-5);
    }

    /* ── Stat cards ───────────────────────────────────────── */
    .stats { display: grid; grid-template-columns: repeat(2,1fr); gap: var(--sp-2); margin-bottom: var(--sp-4); }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-lg); padding: var(--sp-3) var(--sp-4);
    }
    .stat-icon  { font-size: 18px; margin-bottom: var(--sp-1); }
    .stat-num   { font-size: var(--fs-2xl); font-weight: var(--fw-black); color: var(--txt); line-height: 1; }
    .stat-lbl   { font-size: var(--fs-xs); color: var(--txt2); margin-top: 3px; }

    /* ── Card ─────────────────────────────────────────────── */
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-lg); overflow: hidden;
    }

    /* ── Tabs ─────────────────────────────────────────────── */
    .tabs-wrap { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 0; }
    .tab-btn {
      flex: 1; padding: var(--sp-3) var(--sp-2); font-size: var(--fs-sm);
      font-weight: var(--fw-bold); color: var(--txt3); cursor: pointer;
      border-bottom: 2px solid transparent; text-align: center;
      transition: color .15s, border-color .15s; white-space: nowrap;
    }
    .tab-btn.on { color: var(--green); border-bottom-color: var(--green); }
    .tab-body   { display: none; }
    .tab-body.on { display: block; }

    /* ── List items (scan / log / leaderboard) ────────────── */
    .list-item {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: var(--sp-3) var(--sp-4);
      border-bottom: 1px solid var(--border);
    }
    .list-item:last-child { border-bottom: none; }
    .list-main  { flex: 1; min-width: 0; }
    .list-name  { font-size: var(--fs-base); font-weight: var(--fw-medium); color: var(--txt); }
    .list-sub   { font-size: var(--fs-xs); color: var(--txt3); margin-top: 2px; font-family: monospace; }
    .list-meta  { font-size: var(--fs-sm); color: var(--green); font-weight: var(--fw-bold); flex-shrink: 0; }

    /* ── Badges ───────────────────────────────────────────── */
    .badge {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 2px var(--sp-2); border-radius: var(--r-sm);
      font-size: var(--fs-xs); font-weight: var(--fw-bold); line-height: 1.4;
    }
    .badge-green { background: var(--green-bg); color: var(--green); }
    .badge-gold  { background: var(--gold-bg);  color: var(--gold);  }
    .badge-blue  { background: rgba(59,130,246,.12); color: var(--accent); }
    .badge-red   { background: var(--red-bg);  color: var(--red);   }

    /* ── Action bar ───────────────────────────────────────── */
    .action-bar { display: flex; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-3); }
    .btn-primary {
      display: inline-flex; align-items: center; gap: var(--sp-1);
      background: var(--accent); color: #fff; border: none;
      border-radius: var(--r-md); padding: var(--sp-2) var(--sp-4);
      font-size: var(--fs-base); font-weight: var(--fw-bold);
      text-decoration: none; cursor: pointer; transition: opacity .15s;
    }
    .btn-secondary {
      display: inline-flex; align-items: center; gap: var(--sp-1);
      background: var(--surface2); color: var(--txt2);
      border: 1px solid var(--border2); border-radius: var(--r-md);
      padding: var(--sp-2) var(--sp-3); font-size: var(--fs-base);
      font-weight: var(--fw-bold); text-decoration: none; cursor: pointer;
      transition: opacity .15s;
    }
    .btn-primary:hover, .btn-secondary:hover { opacity: .8; }
    .btn-primary:active, .btn-secondary:active { opacity: .65; }

    /* ── Search ───────────────────────────────────────────── */
    .search-wrap { position: relative; margin-bottom: var(--sp-2); }
    .search-input {
      width: 100%; padding: var(--sp-2) var(--sp-3) var(--sp-2) 36px;
      background: var(--surface); border: 1px solid var(--border2);
      border-radius: var(--r-md); color: var(--txt);
      font-size: var(--fs-base); outline: none; font-family: var(--ff);
      transition: border-color .15s;
    }
    .search-input:focus { border-color: var(--accent); }
    .search-input::placeholder { color: var(--txt3); }
    .search-icon { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--txt3); pointer-events: none; }

    /* ── Table ────────────────────────────────────────────── */
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 520px; }
    thead tr { border-bottom: 1px solid var(--border); }
    th {
      padding: var(--sp-2) var(--sp-4);
      font-size: var(--fs-xs); font-weight: var(--fw-bold);
      color: var(--txt3); text-transform: uppercase; letter-spacing: .07em;
      text-align: left; background: var(--surface2); white-space: nowrap;
    }
    tbody tr { border-bottom: 1px solid var(--border); transition: background .1s; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: var(--surface2); }
    td { padding: var(--sp-3) var(--sp-4); vertical-align: middle; }

    /* ── Table action buttons ─────────────────────────────── */
    .tbl-btn {
      display: inline-block; padding: 3px var(--sp-2);
      border-radius: var(--r-sm); font-size: var(--fs-xs);
      font-weight: var(--fw-bold); cursor: pointer; text-decoration: none;
      border: 1px solid var(--border2); color: var(--txt2);
      background: var(--surface2); transition: opacity .15s; white-space: nowrap;
    }
    .tbl-btn:hover { opacity: .75; }
    .tbl-btn-blue  { color: var(--accent); border-color: rgba(59,130,246,.25); background: rgba(59,130,246,.08); }
    .tbl-btn-red   { color: var(--red);    border-color: rgba(239,68,68,.25);  background: var(--red-bg); }
    .tbl-btn-gold  { color: var(--gold);   border-color: rgba(245,158,11,.25); background: var(--gold-bg); }

    /* ── Progress bar ─────────────────────────────────────── */
    .prog-track { background: var(--border2); border-radius: 99px; height: 5px; width: 72px; overflow: hidden; margin-bottom: 4px; }
    .prog-fill  { height: 100%; border-radius: 99px; background: var(--green); }

    /* ── Empty state ──────────────────────────────────────── */
    .empty-state { text-align: center; padding: var(--sp-6); color: var(--txt3); font-size: var(--fs-sm); }

    /* ── Leaderboard rank ─────────────────────────────────── */
    .lb-rank { font-size: 20px; width: 32px; text-align: center; flex-shrink: 0; }
    .lb-score { font-size: var(--fs-md); font-weight: var(--fw-black); color: var(--green); line-height: 1; }
    .lb-score-lbl { font-size: var(--fs-xs); color: var(--txt3); font-weight: var(--fw-normal); }

    /* ── Toast ────────────────────────────────────────────── */
    .toast {
      position: fixed; bottom: var(--sp-5); left: 50%; transform: translateX(-50%);
      background: var(--green-bg); color: var(--green);
      border: 1px solid rgba(34,197,94,.3); border-radius: var(--r-md);
      padding: var(--sp-2) var(--sp-5); font-size: var(--fs-sm); font-weight: var(--fw-bold);
      display: none; z-index: 200; white-space: nowrap; pointer-events: none;
    }
  </style>
  </head><body>

  <!-- ── Topbar ─────────────────────────────────────────────── -->
  <header class="topbar">
    <div class="topbar-brand">
      <span class="topbar-logo">🎱</span>
      <div>
        <div class="topbar-name">${NAMA_ARENA}</div>
        <div class="topbar-label">Admin Dashboard</div>
      </div>
    </div>
    <div class="topbar-right">
      <span class="topbar-time">${new Date().toLocaleString("id-ID",{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"})}</span>
      <button class="theme-btn" onclick="toggleTheme()" id="themeBtn">🌙</button>
    </div>
  </header>

  <!-- ── Page ───────────────────────────────────────────────── -->
  <main class="page">

    <!-- Stat cards -->
    <div class="stats">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-num">${totalMember}</div>
        <div class="stat-lbl">Total member</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📲</div>
        <div class="stat-num">${scanHariIni}</div>
        <div class="stat-lbl">Scan hari ini</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🎁</div>
        <div class="stat-num">${rewardPending}</div>
        <div class="stat-lbl">Reward pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🔥</div>
        <div class="stat-num">${aktifBulanIni}</div>
        <div class="stat-lbl">Aktif bulan ini</div>
      </div>
    </div>

    <!-- Tabs: Hari ini | Leaderboard | Log -->
    <div class="card" style="margin-bottom:var(--sp-4)">
      <div class="tabs-wrap">
        <div class="tab-btn on" onclick="switchTab('scan')">📲 Hari ini</div>
        <div class="tab-btn"   onclick="switchTab('lb')">🏆 Leaderboard</div>
        <div class="tab-btn"   onclick="switchTab('log')">📋 Log</div>
      </div>

      <!-- Scan hari ini -->
      <div id="tab-scan" class="tab-body on">
        ${db.members.filter(m=>m.sudahScanHariIni).length === 0
          ? `<div class="empty-state">Belum ada yang check-in hari ini</div>`
          : db.members
              .filter(m=>m.sudahScanHariIni && m.tanggalScanTerakhir)
              .sort((a,b)=>new Date(b.tanggalScanTerakhir)-new Date(a.tanggalScanTerakhir))
              .map(m=>{
                const jam=new Date(m.tanggalScanTerakhir).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"});
                return `<div class="list-item">
                  <div class="list-main">
                    <div class="list-name">${m.nama}</div>
                    <div class="list-sub">${m.kode}</div>
                  </div>
                  <span class="badge badge-green">${jam}</span>
                </div>`;
              }).join("")
        }
      </div>

      <!-- Leaderboard -->
      <div id="tab-lb" class="tab-body">
        ${leaderboard.length === 0
          ? `<div class="empty-state">Belum ada data kunjungan</div>`
          : leaderboard.map((m,i)=>`
            <div class="list-item">
              <span class="lb-rank">${medals[i]}</span>
              <div class="list-main">
                <div class="list-name">${m.nama}</div>
                <div class="list-sub">${m.kode}</div>
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div class="lb-score">${m.totalKunjungan} <span class="lb-score-lbl">kunjungan</span></div>
                <div style="font-size:var(--fs-xs);color:var(--txt3);margin-top:2px">${m.totalGratis||0}× reward</div>
              </div>
            </div>`).join("")
        }
      </div>

      <!-- Log aktivitas -->
      <div id="tab-log" class="tab-body">
        ${log.length === 0
          ? `<div class="empty-state">Belum ada aktivitas tercatat</div>`
          : log.slice(0,30).map(l=>{
              const tgl=new Date(l.ts).toLocaleString("id-ID",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"});
              const badge = l.aksi==="REWARD_GRATIS"
                ? `<span class="badge badge-gold">🎁 Reward</span>`
                : l.aksi==="SCAN_RESET"
                ? `<span class="badge badge-blue">↺ Reset</span>`
                : `<span class="badge badge-green">✓ Scan</span>`;
              return `<div class="list-item">
                <div class="list-main">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span class="list-name">${l.nama}</span>${badge}
                  </div>
                  <div style="font-size:var(--fs-xs);color:var(--txt3);margin-top:3px">${l.detail||""}</div>
                </div>
                <span style="font-size:var(--fs-xs);color:var(--txt3);flex-shrink:0;text-align:right">${tgl}</span>
              </div>`;
            }).join("")
        }
      </div>
    </div>

    <!-- Kelola member -->
    <div class="sec-label">Kelola Member</div>
    <div class="action-bar">
      <a href="/admin/tambah?tk=${token}" class="btn-primary">＋ Tambah Member</a>
      <a href="/admin/reset?tk=${token}" class="btn-secondary"
         onclick="return confirm('Reset scan harian semua member?')">↺ Reset Harian</a>
    </div>

    <!-- Filter & search bar -->
    <div style="display:flex;gap:var(--sp-2);margin-bottom:var(--sp-2);flex-wrap:wrap">
      <div class="search-wrap" style="flex:1;min-width:180px;margin-bottom:0">
        <span class="search-icon">🔍</span>
        <input class="search-input" type="text" id="cari"
               placeholder="Cari nama, kode, atau no. HP…" oninput="filterTabel()">
      </div>
      <select id="filterBulan" onchange="filterTabel()"
        style="padding:var(--sp-2) var(--sp-3);background:var(--surface);border:1px solid var(--border2);border-radius:var(--r-md);color:var(--txt);font-size:var(--fs-base);outline:none;cursor:pointer;font-family:var(--ff)">
        <option value="">Semua bulan</option>
        ${filterBulanOpts}
      </select>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table id="tabel">
          <thead><tr>
            <th>Kode</th>
            <th>Nama &amp; No. HP</th>
            <th>Progress</th>
            <th>Status</th>
            <th>Reward</th>
            <th style="text-align:center">QR</th>
            <th style="text-align:right">Aksi</th>
          </tr></thead>
          <tbody id="tbody">
            ${rows || `<tr><td colspan="6" class="empty-state">Belum ada member terdaftar</td></tr>`}
          </tbody>
        </table>
      </div>
      <div id="empty-filter" class="empty-state" style="display:none;border-top:1px solid var(--border)">
        Tidak ada member di bulan ini
      </div>
    </div>

  </main>

  <div class="toast" id="toast">✓ URL QR disalin!</div>

  <script>
  const THEME_KEY = "warpat_admin_theme";

  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    document.getElementById("themeBtn").textContent = t === "dark" ? "🌙" : "☀️";
    try { localStorage.setItem(THEME_KEY, t); } catch(e) {}
  }
  function toggleTheme() {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
  }
  try { const s = localStorage.getItem(THEME_KEY); if (s) applyTheme(s); } catch(e) {}

  function switchTab(id) {
    const ids = ["scan","lb","log"];
    document.querySelectorAll(".tab-btn").forEach((b,i) => b.classList.toggle("on", ids[i]===id));
    document.querySelectorAll(".tab-body").forEach(p => p.classList.remove("on"));
    document.getElementById("tab-"+id).classList.add("on");
  }

  function copyUrl(url, btn) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(url).then(() => {
      const prev = btn.textContent;
      btn.textContent = "✓ Disalin";
      btn.classList.add("badge-green");
      const toast = document.getElementById("toast");
      toast.style.display = "block";
      setTimeout(() => {
        btn.textContent = prev;
        btn.classList.remove("badge-green");
        toast.style.display = "none";
      }, 2000);
    });
  }

  function filterTabel() {
    const q     = (document.getElementById("cari").value || "").toLowerCase();
    const bulan = document.getElementById("filterBulan").value;
    let visible = 0;
    document.querySelectorAll("#tbody tr").forEach(r => {
      const matchQ = !q || r.textContent.toLowerCase().includes(q);
      const rowBulan = r.getAttribute("data-bulan") || "";
      // Cocokkan format: bulan = "2026-05", rowBulan = "05/2026" atau "2026-05"
      let matchB = true;
      if (bulan) {
        const [yr, mo] = bulan.split("-");
        matchB = rowBulan.includes(yr) && rowBulan.includes(mo);
      }
      const show = matchQ && matchB;
      r.style.display = show ? "" : "none";
      if (show) visible++;
    });
    const emptyEl = document.getElementById("empty-filter");
    if (emptyEl) emptyEl.style.display = visible === 0 ? "block" : "none";
  }
  </script>
  </body></html>`);
});

// ── ADMIN LOGIN POST ──────────────────────────────────────────
app.post("/admin/login", (req, res) => {
  const pin = (req.body.pin || "").trim();
  if (pin !== ADMIN_PIN) return res.redirect("/admin?err=1");
  const token = buatToken(pin);
  res.redirect(`/admin?tk=${token}`);
});

// ── EDIT NAMA MEMBER ─────────────────────────────────────────
app.get("/admin/edit", (req, res) => {
  const tk  = req.query.tk || "";
  const pin = cekToken(tk);
  if (!pin || pin !== ADMIN_PIN) return res.redirect("/admin");
  const kode = (req.query.kode || "").toUpperCase();
  const db   = bacaDB();
  const idx  = db.members.findIndex(m => m.kode === kode);
  if (idx === -1) return res.redirect("/admin?tk=" + tk);
  const m = db.members[idx];
  const { nama } = req.query;
  if (nama && nama.trim()) {
    m.nama = nama.trim();
    // Update telepon jika ada
    const tlpRaw2 = (req.query.tlp || "").replace(/[^0-9]/g, "");
    if (tlpRaw2.length >= 8) {
      let t2 = tlpRaw2;
      if (t2.startsWith("0"))  t2 = t2.slice(1);
      if (t2.startsWith("62")) t2 = t2.slice(2);
      m.telepon = "+62 " + t2.replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3");
    }
    db.members[idx] = m;
    simpanDB(db);
    return res.redirect("/admin?tk=" + tk);
  }
  const tlpEdit = (m.telepon || "").replace("+62 ","").replace(/[^0-9]/g,"");
  res.send(`<!DOCTYPE html><html lang='id'><head><meta charset='UTF-8'>
  <meta name='viewport' content='width=device-width,initial-scale=1'>
  <title>Edit Member</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#080e18;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#0d1829;border:1px solid #1e2d45;border-radius:20px;padding:28px 22px;max-width:400px;width:100%}
    .back{display:flex;align-items:center;gap:6px;font-size:13px;color:#3b82f6;text-decoration:none;margin-bottom:20px}
    h1{font-size:20px;font-weight:700;color:#e2e8f0;margin-bottom:4px}
    .kode-tag{font-family:monospace;font-size:12px;color:#22c55e;margin-bottom:20px;display:block}
    .fw{margin-bottom:16px}
    label{display:block;font-size:12px;color:#64748b;margin-bottom:6px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
    input{width:100%;padding:13px 14px;background:#0a1422;border:1.5px solid #1e3a5f;border-radius:12px;font-size:15px;color:#e2e8f0;outline:none;font-family:inherit}
    input:focus{border-color:#3b82f6}
    .tel-wrap{display:flex}
    .pre{background:#111f35;border:1.5px solid #1e3a5f;border-right:none;border-radius:12px 0 0 12px;padding:13px 12px;font-size:15px;color:#475569;white-space:nowrap}
    .tel-wrap input{border-radius:0 12px 12px 0}
    .hint{font-size:11px;color:#334155;margin-top:5px}
    button{width:100%;background:#2563eb;color:#fff;border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;margin-top:6px}
  </style>
  </head><body><div class='card'>
  <a href='/admin?tk=${tk}' class='back'>← Kembali</a>
  <h1>Edit Member</h1>
  <span class='kode-tag'>${kode}</span>
  <form action='/admin/edit' method='get'>
    <input type='hidden' name='tk' value='${tk}'>
    <input type='hidden' name='kode' value='${kode}'>
    <div class='fw'>
      <label>Nama</label>
      <input type='text' name='nama' value='${m.nama}' required autofocus autocomplete='off'>
    </div>
    <div class='fw'>
      <label>No. Telepon</label>
      <div class='tel-wrap'>
        <span class='pre'>+62</span>
        <input type='tel' name='tlp' value='${tlpEdit}'
               placeholder='81234567890' autocomplete='off' inputmode='numeric'
               oninput='this.value=this.value.replace(/[^0-9]/g,"")'>
      </div>
      <p class='hint'>Kosongkan jika tidak ingin mengubah nomor</p>
    </div>
    <button type='submit'>Simpan Perubahan</button>
  </form>
  </div></body></html>`);
});

// ── KLAIM REWARD ─────────────────────────────────────────────
app.get("/admin/klaim", (req, res) => {
  const tk  = req.query.tk || "";
  const pin = cekToken(tk);
  if (!pin || pin !== ADMIN_PIN) return res.redirect("/admin");
  const kode = (req.query.kode || "").toUpperCase();
  const db   = bacaDB();
  const idx  = db.members.findIndex(m => m.kode === kode);
  if (idx !== -1 && db.members[idx].status === "GRATIS") {
    db.members[idx].status = "-";
    simpanDB(db);
  }
  res.redirect("/admin?tk=" + tk);
});

// ── HELPER: generate QR sebagai data URL (PNG base64) ───────
async function qrDataUrl(text) {
  return await QRCode.toDataURL(text, {
    errorCorrectionLevel: "M",
    type: "image/png",
    width: 400,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" }
  });
}

// ── HELPER: generate QR sebagai Buffer PNG ───────────────────
async function qrBuffer(text) {
  return await QRCode.toBuffer(text, {
    errorCorrectionLevel: "M",
    type: "png",
    width: 400,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" }
  });
}

// ── HELPER: generate kode premium JMB-MMYY-XX ───────────────
// Format: JMB-0526-K3 (singkatan + bulan-tahun + 2 karakter acak)
// Ganti prefix lewat Railway Variable: KODE_PREFIX (default: JMB)
const KODE_PREFIX = process.env.KODE_PREFIX || "JMB";

function generateKode(members) {
  const now    = new Date();
  const bulan  = String(now.getMonth() + 1).padStart(2, "0");
  const tahun  = String(now.getFullYear()).slice(-2);
  const period = bulan + tahun;
  const chars  = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  const existing = new Set(members.map(m => m.kode));
  let kode, attempts = 0;
  do {
    const r1 = chars[Math.floor(Math.random() * chars.length)];
    const r2 = chars[Math.floor(Math.random() * chars.length)];
    kode = KODE_PREFIX + "-" + period + "-" + r1 + r2;
    attempts++;
    if (attempts > 500) {
      const r3 = chars[Math.floor(Math.random() * chars.length)];
      kode = KODE_PREFIX + "-" + period + "-" + r1 + r2 + r3;
      break;
    }
  } while (existing.has(kode));

  return kode;
}

app.get("/admin/tambah", async (req, res) => {
  const tk  = req.query.tk || "";
  const pin = cekToken(tk);
  if (!pin || pin !== ADMIN_PIN) return res.redirect("/admin");
  const { nama } = req.query;

  const errTelepon = req.query.errtlp ? "Nomor tidak valid. Masukkan 10–13 digit, diawali 08 atau +62." : "";
  if (!nama) return res.send(`<!DOCTYPE html><html lang="id"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Tambah Member — ${NAMA_ARENA}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080e18;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
      .card{background:#0d1829;border:1px solid #1e2d45;border-radius:20px;padding:28px 22px;max-width:400px;width:100%}
      .back{display:flex;align-items:center;gap:6px;font-size:13px;color:#3b82f6;text-decoration:none;margin-bottom:20px}
      h1{font-size:20px;font-weight:700;color:#e2e8f0;margin-bottom:4px}
      .sub{font-size:13px;color:#475569;margin-bottom:24px}
      .field-wrap{margin-bottom:18px}
      label{display:block;font-size:12px;color:#64748b;margin-bottom:6px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}
      .hint{font-size:11px;color:#334155;margin-top:5px}
      input[type=text],input[type=tel]{width:100%;padding:13px 14px;background:#0a1422;border:1.5px solid #1e3a5f;border-radius:12px;font-size:15px;color:#e2e8f0;outline:none;font-family:inherit}
      input:focus{border-color:#3b82f6}
      input::placeholder{color:#2a3a52}
      input.err-field{border-color:#ef4444}
      .err-msg{font-size:12px;color:#f87171;margin-top:6px;padding:8px 10px;background:rgba(239,68,68,.08);border-radius:8px;border:1px solid rgba(239,68,68,.2)}
      .tel-prefix{display:flex;align-items:stretch;gap:0}
      .tel-pre{background:#111f35;border:1.5px solid #1e3a5f;border-right:none;border-radius:12px 0 0 12px;padding:13px 12px;font-size:15px;color:#475569;white-space:nowrap;user-select:none}
      .tel-prefix input{border-radius:0 12px 12px 0}
      button{width:100%;background:#2563eb;color:#fff;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;margin-top:4px}
      button:active{opacity:.85}
    </style>
    </head><body><div class="card">
    <a href="/admin?tk=${tk}" class="back">← Kembali ke dashboard</a>
    <h1>Tambah Member Baru</h1>
    <p class="sub">Kode member dibuat otomatis.</p>
    <form action="/admin/tambah" method="get" id="frm">
      <input type="hidden" name="tk" value="${tk}">

      <div class="field-wrap">
        <label>Nama Lengkap</label>
        <input type="text" name="nama" placeholder="contoh: Budi Santoso"
               required autofocus autocomplete="off">
      </div>

      <div class="field-wrap">
        <label>No. Telepon <span style="color:#ef4444">*</span></label>
        <div class="tel-prefix">
          <span class="tel-pre">+62</span>
          <input type="tel" id="tlpInput" name="tlp" placeholder="81234567890"
                 required autocomplete="off" inputmode="numeric"
                 oninput="this.value=this.value.replace(/[^0-9]/g,'')"
                 class="${errTelepon ? 'err-field' : ''}">
        </div>
        ${errTelepon ? `<div class="err-msg">${errTelepon}</div>` : ""}
        <p class="hint">Hanya angka. Contoh: 81234567890 (tanpa 0 di depan karena sudah ada +62)</p>
      </div>

      <button type="submit" onclick="return validasiForm()">＋ Daftarkan Member</button>
    </form>
    <script>
    function validasiForm() {
      const tlp = document.getElementById("tlpInput").value.replace(/\D/g,"");
      if (tlp.length < 8 || tlp.length > 12) {
        document.getElementById("tlpInput").classList.add("err-field");
        return false;
      }
      return true;
    }
    </script>
    </div></body></html>`);

  // Ambil dan validasi nomor telepon
  const tlpRaw  = (req.query.tlp || "").replace(/\D/g, "");
  // Normalisasi: kalau user ketik 08xxx → strip 0 depan, kalau 8xxx biarkan
  // Format simpan: 62xxxxxxxx (tanpa + )
  let tlpBersih = tlpRaw;
  if (tlpBersih.startsWith("0"))  tlpBersih = tlpBersih.slice(1);
  if (tlpBersih.startsWith("62")) tlpBersih = tlpBersih.slice(2);
  const tlpFull = "62" + tlpBersih;
  const tlpDisplay = "+62 " + tlpBersih.replace(/(\d{3})(\d{4})(\d+)/, "$1-$2-$3");

  // Validasi: panjang 8–12 digit setelah strip prefix
  if (tlpBersih.length < 8 || tlpBersih.length > 12) {
    return res.redirect("/admin/tambah?tk=" + req.query.tk + "&errtlp=1");
  }

  const db  = bacaDB();
  const ku  = generateKode(db.members);
  db.members.push({
    kode: ku, nama: nama.trim(), telepon: tlpDisplay, totalMain: 0,
    tanggalMulai: null, sudahScanHariIni: false, status: "-",
    totalGratis: 0, tanggalDaftar: new Date().toISOString(), tanggalScanTerakhir: null,
  });
  simpanDB(db);

  const scanUrl = req.protocol + "://" + req.get("host") + "/scan?id=" + ku;
  let qrDataUri = "";
  try { qrDataUri = await qrDataUrl(scanUrl); } catch(e) { qrDataUri = ""; }
  const dlUrl = "/admin/qr/" + ku + "?tk=" + tk;

  res.send(`<!DOCTYPE html><html lang="id"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Member Terdaftar — ${NAMA_ARENA}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080e18;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#0d1829;border:1px solid #1e2d45;border-radius:20px;padding:28px 22px;max-width:400px;width:100%;text-align:center}
    .ic{width:52px;height:52px;border-radius:50%;background:#14532d;border:2px solid #22c55e;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 12px}
    h1{font-size:19px;font-weight:700;color:#22c55e;margin-bottom:3px}
    .nm{font-size:21px;font-weight:700;color:#e8edf5;margin-bottom:4px}
    .tp{font-size:13px;color:#4a5e78;margin-bottom:16px;font-family:monospace}
    .kode-row{display:flex;align-items:center;justify-content:center;gap:10px;background:#0a1a0f;border:1.5px solid #22c55e;border-radius:12px;padding:10px 16px;margin-bottom:16px}
    .kode-val{font-family:monospace;font-size:20px;font-weight:700;color:#22c55e;letter-spacing:.08em}
    .qr-wrap{background:#fff;border-radius:14px;padding:12px;display:inline-block;margin-bottom:12px}
    .qr-wrap img{display:block;border-radius:6px}
    .qr-hint{font-size:11px;color:#334155;margin-bottom:16px}
    .btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
    .btn-dl{display:inline-flex;align-items:center;gap:6px;background:#22c55e;color:#fff;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;text-decoration:none}
    .btn-g{display:inline-flex;align-items:center;gap:6px;background:#2563eb;color:#fff;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:700;text-decoration:none}
    .btn-w{display:inline-flex;align-items:center;gap:6px;background:#1e2d45;color:#94a3b8;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:600;text-decoration:none}
  </style>
  </head><body><div class="card">
  <div class="ic">✓</div>
  <h1>Member Terdaftar!</h1>
  <div class="nm">${nama.trim()}</div>
  <div class="tp">${tlpDisplay}</div>

  <div class="kode-row">
    <span class="kode-val">${ku}</span>
  </div>

  <div class="qr-wrap">
    <img src="${qrDataUri}" width="200" height="200" alt="QR Code ${ku}" id="qrimg">
  </div>
  <div class="qr-hint">QR siap dipakai — scan untuk cek, atau download untuk cetak kartu</div>

  <div class="btns">
    <a href="${dlUrl}" class="btn-dl" download="QR-${ku}.png">⬇ Download QR</a>
    <a href="/admin/tambah?tk=${tk}" class="btn-w">＋ Tambah lagi</a>
    <a href="/admin?tk=${tk}" class="btn-g">Dashboard</a>
  </div>
  </div></body></html>`);
});

// ── QR IMAGE inline (untuk thumbnail tabel) ─────────────────
app.get("/admin/qr-img/:kode", async (req, res) => {
  const tk  = req.query.tk || "";
  const pin = cekToken(tk);
  if (!pin || pin !== ADMIN_PIN) return res.status(403).end();

  const kode = req.params.kode.toUpperCase();
  const db   = bacaDB();
  const m    = db.members.find(m => m.kode === kode);
  if (!m) return res.status(404).end();

  const scanUrl = req.protocol + "://" + req.get("host") + "/scan?id=" + kode;
  try {
    const buf = await qrBuffer(scanUrl);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.send(buf);
  } catch (e) {
    res.status(500).end();
  }
});

// ── QR DOWNLOAD (download PNG ke device) ─────────────────────
app.get("/admin/qr/:kode", async (req, res) => {
  const tk  = req.query.tk || "";
  const pin = cekToken(tk);
  if (!pin || pin !== ADMIN_PIN) return res.redirect("/admin");

  const kode = req.params.kode.toUpperCase();
  const db   = bacaDB();
  const m    = db.members.find(m => m.kode === kode);
  if (!m) return res.status(404).send("Member tidak ditemukan");

  const scanUrl = req.protocol + "://" + req.get("host") + "/scan?id=" + kode;
  try {
    const buf = await qrBuffer(scanUrl);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition",
      "attachment; filename=\"QR-" + kode + ".png\"");
    res.send(buf);
  } catch (e) {
    res.status(500).send("Gagal generate QR: " + e.message);
  }
});


app.get("/admin/hapus", (req, res) => {
  const tk  = req.query.tk || "";
  const pin = cekToken(tk);
  if (!pin || pin !== ADMIN_PIN) return res.redirect("/admin");
  const db = bacaDB();
  db.members = db.members.filter(m => m.kode !== (req.query.kode||"").toUpperCase());
  simpanDB(db);
  res.redirect(`/admin?tk=${tk}`);
});

app.get("/admin/reset", (req, res) => {
  const tk  = req.query.tk || "";
  const pin = cekToken(tk);
  if (!pin || pin !== ADMIN_PIN) return res.redirect("/admin");
  const db = bacaDB();
  db.members.forEach(m => { m.sudahScanHariIni = false; });
  simpanDB(db);
  res.redirect(`/admin?tk=${tk}`);
});

cron.schedule("0 19 * * *", () => {
  const db=bacaDB();
  db.members.forEach(m=>{m.sudahScanHariIni=false;});
  simpanDB(db);
  console.log(`[${new Date().toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}] Reset harian selesai.`);
},{timezone:"UTC"});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` ${NAMA_ARENA} — Sistem Member`);
  console.log(` Port    : ${PORT}`);
  console.log(` Limit   : ${BATAS_MAIN}x / ${BATAS_HARI} hari`);
  console.log(` KasirPIN: ${KASIR_PIN}`);
  console.log(`========================================\n`);
});
