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
    return res.send(halamanHasil("gratis",{
      judul:"Selamat! Main Gratis!", nama:m.nama,
      pesan:`${m.nama} sudah main ${tn}x! Main berikutnya GRATIS.`,
      totalGratis:tg, kode
    }));
  }

  m.status="-"; db.members[idx]=m; simpanDB(db);
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
  const db = bacaDB();

  const totalMember   = db.members.length;
  const scanHariIni   = db.members.filter(m => m.sudahScanHariIni).length;
  const rewardPending = db.members.filter(m => m.status === "GRATIS").length;
  const aktifBulanIni = db.members.filter(m => m.totalMain > 0).length;

  // Riwayat scan hari ini (urut jam terbaru)
  const scanList = db.members
    .filter(m => m.sudahScanHariIni && m.tanggalScanTerakhir)
    .sort((a,b) => new Date(b.tanggalScanTerakhir) - new Date(a.tanggalScanTerakhir))
    .map(m => {
      const jam = new Date(m.tanggalScanTerakhir).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"});
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:.5px solid #111d2e">
        <div>
          <span style="font-size:13px;font-weight:500;color:#e2e8f0">${m.nama}</span>
          <span style="font-size:10px;font-family:monospace;color:#334155;margin-left:8px">${m.kode}</span>
        </div>
        <span style="font-size:12px;color:#4ade80;font-weight:600">${jam}</span>
      </div>`;
    }).join("") || `<div style="text-align:center;padding:16px;color:#334155;font-size:13px">Belum ada yang check-in hari ini</div>`;

  const hostBase = req.protocol + "://" + req.get("host");

  const rows = db.members.map(m => {
    const pct      = Math.round(m.totalMain / BATAS_MAIN * 100);
    const isGratis = m.status === "GRATIS";
    const scanUrl  = hostBase + "/scan?id=" + m.kode;
    const tglDaftar= m.tanggalDaftar ? new Date(m.tanggalDaftar).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"}) : "-";
    const tglTerakhir = m.tanggalScanTerakhir ? new Date(m.tanggalScanTerakhir).toLocaleDateString("id-ID",{day:"numeric",month:"short"}) : "—";
    return `<tr>
      <td>
        <span style="font-family:monospace;font-size:12px;color:#4ade80;font-weight:600">${m.kode}</span>
        <br><span style="font-size:10px;color:#334155">${tglDaftar}</span>
      </td>
      <td>
        <div style="font-size:13px;font-weight:500;color:#e2e8f0">${m.nama}</div>
        <div style="font-size:10px;color:#475569;margin-top:1px">Terakhir: ${tglTerakhir}</div>
      </td>
      <td>
        ${isGratis
          ? `<span style="background:#14532d;color:#4ade80;padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700">🎁 GRATIS</span>
             <br><a href="/admin/klaim?tk=${token}&kode=${m.kode}" onclick="return confirm('Tandai reward ${m.nama} sudah diklaim?')"
               style="font-size:10px;color:#fbbf24;text-decoration:none;margin-top:3px;display:inline-block">Tandai klaim ↗</a>`
          : `<div>
              <div style="background:#1a2e1e;border-radius:4px;height:5px;width:80px;overflow:hidden;margin-bottom:3px">
                <div style="background:#16a34a;height:100%;width:${pct}%;border-radius:4px"></div>
              </div>
              <span style="font-size:11px;color:#4ade80">${m.totalMain}/${BATAS_MAIN}</span>
            </div>`
        }
      </td>
      <td style="text-align:center">
        ${m.sudahScanHariIni
          ? `<span style="background:#14532d;color:#4ade80;padding:2px 8px;border-radius:8px;font-size:11px">✓ Hadir</span>`
          : `<span style="color:#334155;font-size:12px">—</span>`
        }
      </td>
      <td style="text-align:center">
        <span style="font-size:12px;color:#fbbf24;font-weight:600">${m.totalGratis || 0}×</span>
      </td>
      <td>
        <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
          <button onclick="copyUrl('${scanUrl}',this)"
            style="background:#1e2d45;color:#60a5fa;border:1px solid #243447;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer;white-space:nowrap">
            Copy QR
          </button>
          <a href="/admin/edit?tk=${token}&kode=${m.kode}"
            style="color:#94a3b8;font-size:11px;text-decoration:none;padding:3px 8px;border:1px solid #1e2d45;border-radius:6px;white-space:nowrap">
            Edit
          </a>
          <a href="/admin/hapus?tk=${token}&kode=${m.kode}"
            onclick="return confirm('Hapus member ${m.nama}?')"
            style="color:#ef4444;font-size:11px;text-decoration:none;padding:3px 8px;border:1px solid #3d1515;border-radius:6px;white-space:nowrap">
            Hapus
          </a>
        </div>
      </td>
    </tr>`;
  }).join("");

  res.send(`<!DOCTYPE html><html lang="id"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Admin — ${NAMA_ARENA}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080e18;min-height:100vh;color:#e2e8f0}
    .topbar{background:#0d1829;border-bottom:1px solid #1e2d45;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10;gap:10px}
    .topbar-left{display:flex;align-items:center;gap:10px}
    .topbar-logo{font-size:22px}
    .topbar-title{font-size:15px;font-weight:700;color:#e2e8f0}
    .topbar-sub{font-size:11px;color:#475569;margin-top:1px}
    .topbar-right{font-size:11px;color:#334155;text-align:right;flex-shrink:0}
    .wrap{padding:14px 14px 40px}
    .stats{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px}
    .stat{background:#0d1829;border:1px solid #1e2d45;border-radius:14px;padding:14px 16px}
    .stat-num{font-size:26px;font-weight:700;color:#e2e8f0;line-height:1}
    .stat-label{font-size:11px;color:#475569;margin-top:4px}
    .stat-icon{font-size:20px;margin-bottom:6px}
    .section-title{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#475569;margin-bottom:8px;margin-top:16px}
    .box{background:#0d1829;border:1px solid #1e2d45;border-radius:14px;padding:14px 16px;margin-bottom:12px}
    .search-wrap{position:relative;margin-bottom:10px}
    .search-wrap input{width:100%;padding:10px 12px 10px 36px;background:#0a1422;border:1px solid #1e3a5f;border-radius:10px;color:#e2e8f0;font-size:13px;outline:none}
    .search-wrap input:focus{border-color:#3b82f6}
    .search-wrap input::placeholder{color:#334155}
    .search-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:#334155;font-size:15px;pointer-events:none}
    .table-wrap{background:#0d1829;border:1px solid #1e2d45;border-radius:14px;overflow:hidden;overflow-x:auto}
    table{width:100%;border-collapse:collapse;min-width:540px}
    thead tr{background:#0a1422;border-bottom:1px solid #1e2d45}
    th{padding:10px 12px;text-align:left;font-size:10px;font-weight:700;color:#334155;text-transform:uppercase;letter-spacing:.08em}
    tbody tr{border-bottom:.5px solid #111d2e;transition:background .1s}
    tbody tr:last-child{border-bottom:none}
    tbody tr:hover{background:#0f1f35}
    td{padding:10px 12px;vertical-align:middle}
    .action-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
    .btn-p{display:inline-flex;align-items:center;gap:6px;background:#2563eb;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;text-decoration:none;cursor:pointer}
    .btn-s{display:inline-flex;align-items:center;gap:6px;background:#1e2d45;color:#94a3b8;border:1px solid #243447;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer}
    .btn-p:active,.btn-s:active{opacity:.85}
    .empty{text-align:center;padding:32px;color:#334155;font-size:13px}
    .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#14532d;color:#4ade80;border:1px solid #16a34a;border-radius:10px;padding:10px 20px;font-size:13px;font-weight:600;display:none;z-index:100}
  </style>
  </head><body>

  <div class="topbar">
    <div class="topbar-left">
      <div class="topbar-logo">🎱</div>
      <div>
        <div class="topbar-title">${NAMA_ARENA}</div>
        <div class="topbar-sub">Admin Dashboard</div>
      </div>
    </div>
    <div class="topbar-right">${new Date().toLocaleString("id-ID",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",timeZone:"Asia/Jakarta"})}</div>
  </div>

  <div class="wrap">

    <div class="stats">
      <div class="stat"><div class="stat-icon">👥</div><div class="stat-num">${totalMember}</div><div class="stat-label">Total member</div></div>
      <div class="stat"><div class="stat-icon">📲</div><div class="stat-num">${scanHariIni}</div><div class="stat-label">Scan hari ini</div></div>
      <div class="stat"><div class="stat-icon">🎁</div><div class="stat-num">${rewardPending}</div><div class="stat-label">Reward pending</div></div>
      <div class="stat"><div class="stat-icon">🔥</div><div class="stat-num">${aktifBulanIni}</div><div class="stat-label">Aktif bulan ini</div></div>
    </div>

    <div class="section-title">Riwayat check-in hari ini</div>
    <div class="box">${scanList}</div>

    <div class="section-title">Kelola member</div>
    <div class="action-bar">
      <a href="/admin/tambah?tk=${token}" class="btn-p">＋ Tambah Member</a>
      <a href="/admin/reset?tk=${token}" class="btn-s" onclick="return confirm('Reset scan harian semua member?')">↺ Reset Harian</a>
    </div>

    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" id="cari" placeholder="Cari nama atau kode member..." oninput="filterTabel(this.value)">
    </div>

    <div class="table-wrap">
      <table id="tabel">
        <thead><tr>
          <th>Kode</th><th>Nama</th><th>Progress</th>
          <th>Hari ini</th><th>Reward</th><th>Aksi</th>
        </tr></thead>
        <tbody id="tbody">${rows || `<tr><td colspan="6" class="empty">Belum ada member terdaftar</td></tr>`}</tbody>
      </table>
    </div>

  </div>

  <div class="toast" id="toast">✓ URL QR berhasil disalin!</div>

  <script>
  function copyUrl(url, btn) {
    navigator.clipboard && navigator.clipboard.writeText(url).then(() => {
      btn.textContent = "✓ Disalin";
      btn.style.background = "#14532d";
      btn.style.color = "#4ade80";
      const t = document.getElementById("toast");
      t.style.display = "block";
      setTimeout(() => {
        btn.textContent = "Copy QR";
        btn.style.background = "";
        btn.style.color = "";
        t.style.display = "none";
      }, 2000);
    });
  }

  function filterTabel(q) {
    const rows = document.querySelectorAll("#tbody tr");
    const s = q.toLowerCase();
    rows.forEach(r => {
      const txt = r.textContent.toLowerCase();
      r.style.display = (!s || txt.includes(s)) ? "" : "none";
    });
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
    db.members[idx] = m;
    simpanDB(db);
    return res.redirect("/admin?tk=" + tk);
  }
  res.send("<!DOCTYPE html><html lang='id'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Edit Member</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080e18;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.card{background:#0d1829;border:1px solid #1e2d45;border-radius:20px;padding:28px 22px;max-width:380px;width:100%}.back{display:flex;align-items:center;gap:6px;font-size:13px;color:#3b82f6;text-decoration:none;margin-bottom:20px}h1{font-size:20px;font-weight:700;color:#e2e8f0;margin-bottom:4px}.kode-tag{font-family:monospace;font-size:12px;color:#4ade80;margin-bottom:20px;display:block}label{display:block;font-size:12px;color:#64748b;margin-bottom:6px;font-weight:500}input{width:100%;padding:13px 14px;background:#0a1422;border:1.5px solid #1e3a5f;border-radius:12px;font-size:15px;color:#e2e8f0;outline:none;margin-bottom:20px}input:focus{border-color:#3b82f6}button{width:100%;background:#2563eb;color:#fff;border:none;border-radius:12px;padding:13px;font-size:15px;font-weight:700;cursor:pointer}</style></head><body><div class='card'><a href='/admin?tk=" + tk + "' class='back'>← Kembali</a><h1>Edit Nama Member</h1><span class='kode-tag'>" + kode + "</span><form action='/admin/edit' method='get'><input type='hidden' name='tk' value='" + tk + "'><input type='hidden' name='kode' value='" + kode + "'><label>Nama Baru</label><input type='text' name='nama' value='" + m.nama.replace(/'/g, "\'") + "' required autofocus autocomplete='off'><button type='submit'>Simpan Perubahan</button></form></div></body></html>");
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

app.get("/admin/tambah", (req, res) => {
  const tk  = req.query.tk || "";
  const pin = cekToken(tk);
  if (!pin || pin !== ADMIN_PIN) return res.redirect("/admin");
  const { nama } = req.query;

  if (!nama) return res.send(`<!DOCTYPE html><html lang="id"><head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Tambah Member — ${NAMA_ARENA}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080e18;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
      .card{background:#0d1829;border:1px solid #1e2d45;border-radius:20px;padding:28px 22px;max-width:380px;width:100%}
      .back{display:flex;align-items:center;gap:6px;font-size:13px;color:#3b82f6;text-decoration:none;margin-bottom:20px}
      h1{font-size:20px;font-weight:700;color:#e2e8f0;margin-bottom:4px}
      .sub{font-size:13px;color:#475569;margin-bottom:24px}
      label{display:block;font-size:12px;color:#64748b;margin-bottom:6px;font-weight:500}
      input[type=text]{width:100%;padding:13px 14px;background:#0a1422;border:1.5px solid #1e3a5f;border-radius:12px;font-size:15px;color:#e2e8f0;outline:none;margin-bottom:20px}
      input[type=text]:focus{border-color:#3b82f6}
      input::placeholder{color:#334155}
      button{width:100%;background:#2563eb;color:#fff;border:none;border-radius:12px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
      button:active{opacity:.85}
    </style>
    </head><body><div class="card">
    <a href="/admin?tk=${tk}" class="back">← Kembali ke dashboard</a>
    <h1>Tambah Member Baru</h1>
    <p class="sub">Kode member dibuat otomatis — cukup masukkan nama.</p>
    <form action="/admin/tambah" method="get">
      <input type="hidden" name="tk" value="${tk}">
      <label>Nama Lengkap Member</label>
      <input type="text" name="nama" placeholder="contoh: Budi Santoso" required autofocus autocomplete="off">
      <button type="submit">＋ Daftarkan Member</button>
    </form>
    </div></body></html>`);

  const db  = bacaDB();
  const ku  = generateKode(db.members);
  db.members.push({
    kode: ku, nama: nama.trim(), totalMain: 0,
    tanggalMulai: null, sudahScanHariIni: false, status: "-",
    totalGratis: 0, tanggalDaftar: new Date().toISOString(), tanggalScanTerakhir: null,
  });
  simpanDB(db);

  const scanUrl = `${req.protocol}://${req.get("host")}/scan?id=${ku}`;

  res.send(`<!DOCTYPE html><html lang="id"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Member Terdaftar — ${NAMA_ARENA}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080e18;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#0d1829;border:1px solid #1e2d45;border-radius:20px;padding:28px 22px;max-width:380px;width:100%;text-align:center}
    .check{width:56px;height:56px;border-radius:50%;background:#14532d;border:2px solid #16a34a;display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 14px}
    h1{font-size:20px;font-weight:700;color:#4ade80;margin-bottom:4px}
    .member-name{font-size:22px;font-weight:700;color:#e2e8f0;margin-bottom:16px}
    .kode-box{background:#0a1a0f;border:1.5px solid #16a34a;border-radius:12px;padding:12px 16px;margin-bottom:16px}
    .kode-label{font-size:10px;color:#4ade80;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px}
    .kode-val{font-family:monospace;font-size:24px;font-weight:700;color:#4ade80;letter-spacing:.08em}
    .url-label{font-size:11px;color:#475569;margin-bottom:6px}
    .url-box{background:#0a1422;border:1px solid #1e3a5f;border-radius:10px;padding:10px 12px;font-family:monospace;font-size:11px;color:#3b82f6;word-break:break-all;text-align:left;cursor:pointer;margin-bottom:6px}
    .url-hint{font-size:10px;color:#334155;margin-bottom:20px}
    .btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
    .btn-g{display:inline-block;background:#2563eb;color:#fff;border-radius:10px;padding:10px 20px;font-size:13px;font-weight:700;text-decoration:none}
    .btn-w{display:inline-block;background:#1e2d45;color:#94a3b8;border-radius:10px;padding:10px 20px;font-size:13px;font-weight:600;text-decoration:none}
  </style>
  </head><body><div class="card">
  <div class="check">✓</div>
  <h1>Member Terdaftar!</h1>
  <div class="member-name">${nama.trim()}</div>
  <div class="kode-box">
    <div class="kode-label">Kode Member</div>
    <div class="kode-val">${ku}</div>
  </div>
  <div class="url-label">URL untuk generate QR — tap untuk copy:</div>
  <div class="url-box" id="qurl"
    onclick="navigator.clipboard&&navigator.clipboard.writeText(this.textContent).then(()=>{this.style.background='#0a1a0f';this.style.color='#4ade80';this.style.borderColor='#16a34a';setTimeout(()=>{this.style.background='';this.style.color='';this.style.borderColor=''},2000)})"
  >${scanUrl}</div>
  <div class="url-hint">Tap URL → copy → paste ke qr-code-generator.com</div>
  <div class="btns">
    <a href="/admin/tambah?tk=${tk}" class="btn-w">＋ Tambah lagi</a>
    <a href="/admin?tk=${tk}" class="btn-g">Dashboard</a>
  </div>
  </div></body></html>`);
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
