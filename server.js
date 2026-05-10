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

const NAMA_ARENA = process.env.NAMA_ARENA || "Arena Billiard";
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

// ── ADMIN ─────────────────────────────────────────────────────
app.get("/admin", (req, res) => {
  if ((req.query.pin||"")!==ADMIN_PIN) return res.send(html("Admin",`
    <div class="ic" style="background:#f5f5f5;font-size:28px">🔐</div>
    <h1 style="color:#111">Admin Panel</h1>
    <p class="pesan" style="margin-bottom:20px">${NAMA_ARENA}</p>
    <form action="/admin" method="get">
      <input type="password" name="pin" placeholder="••••" maxlength="8" autofocus autocomplete="off">
      <button type="submit">Masuk</button>
    </form>
  `));

  const db=bacaDB(), pin=req.query.pin;
  const rows=db.members.map(m=>{
    const bar=`<div style="background:#eee;border-radius:4px;height:6px;width:70px;display:inline-block;vertical-align:middle;margin-right:4px"><div style="background:#1D9E75;height:100%;border-radius:4px;width:${Math.round(m.totalMain/BATAS_MAIN*100)}%"></div></div><span style="font-size:11px;color:#888">${m.totalMain}/${BATAS_MAIN}</span>`;
    return `<tr>
      <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#1D9E75;font-weight:500">${m.kode}</td>
      <td style="padding:10px 12px;font-size:13px">${m.nama}</td>
      <td style="padding:10px 12px">${m.status==="GRATIS"?'<span style="background:#EAF3DE;color:#27500A;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">GRATIS</span>':bar}</td>
      <td style="padding:10px 12px;text-align:center;font-size:12px">${m.sudahScanHariIni?'<span style="color:#1D9E75;font-weight:500">✓</span>':'<span style="color:#ccc">—</span>'}</td>
      <td style="padding:10px 12px;text-align:center;font-size:12px;color:#888">${m.totalGratis||0}x</td>
      <td style="padding:10px 12px;text-align:center"><a href="/admin/hapus?pin=${pin}&kode=${m.kode}" onclick="return confirm('Hapus ${m.nama}?')" style="font-size:11px;color:#cc4444;text-decoration:none">Hapus</a></td>
    </tr>`;
  }).join("");

  res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#f5f5f5;padding:16px}.hdr{margin-bottom:12px}h1{font-size:17px;font-weight:600;color:#111}.sub{font-size:12px;color:#888;margin-top:2px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.stat{background:#fff;border-radius:8px;padding:10px;text-align:center}.sn{font-size:20px;font-weight:600}.sl{font-size:11px;color:#888;margin-top:2px}.card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:12px;overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:460px}th{background:#f8f8f8;padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;border-bottom:1px solid #eee}tr{border-bottom:.5px solid #f0f0f0}tr:last-child{border-bottom:none}.btns{display:flex;gap:8px;flex-wrap:wrap}.btn{display:inline-block;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none}.bg{background:#1D9E75;color:#fff}.bw{background:#f0f0f0;color:#555}</style>
  </head><body>
  <div class="hdr"><h1>${NAMA_ARENA}</h1><div class="sub">${new Date().toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}</div></div>
  <div class="stats">
    <div class="stat"><div class="sn">${db.members.length}</div><div class="sl">Member</div></div>
    <div class="stat"><div class="sn">${db.members.filter(m=>m.sudahScanHariIni).length}</div><div class="sl">Scan hari ini</div></div>
    <div class="stat"><div class="sn">${db.members.filter(m=>m.status==="GRATIS").length}</div><div class="sl">Reward pending</div></div>
  </div>
  <div class="card"><table><thead><tr><th>Kode</th><th>Nama</th><th>Progress</th><th>Scan</th><th>Gratis</th><th></th></tr></thead>
  <tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:20px;color:#aaa;font-size:13px">Belum ada member</td></tr>'}</tbody></table></div>
  <div class="btns">
    <a href="/admin/tambah?pin=${pin}" class="btn bg">+ Tambah Member</a>
    <a href="/admin/reset?pin=${pin}" class="btn bw" onclick="return confirm('Reset scan harian?')">Reset Scan Harian</a>
  </div></body></html>`);
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
  const pin = req.query.pin || "";
  if (pin !== ADMIN_PIN) return res.redirect("/admin");
  const { nama } = req.query;

  // Tampilkan form — hanya input NAMA saja
  if (!nama) return res.send(html("Tambah Member", `
    <div class="ic" style="background:#E1F5EE;color:#1D9E75;font-size:24px">+</div>
    <h1 style="color:#111;margin-bottom:6px">Tambah Member Baru</h1>
    <p class="pesan" style="margin-bottom:18px">Kode member dibuat otomatis.</p>
    <form action="/admin/tambah" method="get" style="text-align:left">
      <input type="hidden" name="pin" value="${pin}">
      <label>Nama Member</label>
      <input class="field" type="text" name="nama" placeholder="contoh: Budi Santoso" required autofocus>
      <button type="submit" style="width:100%;background:#1D9E75;color:#fff;border:none;border-radius:10px;padding:13px;font-size:15px;font-weight:600;cursor:pointer">Daftarkan Member</button>
    </form>
    <a href="/admin?pin=${pin}" style="display:block;text-align:center;margin-top:14px;font-size:13px;color:#888;text-decoration:none">← Dashboard</a>
  `));

  // Generate kode otomatis
  const db  = bacaDB();
  const ku  = generateKode(db.members);

  // Simpan member baru
  db.members.push({
    kode: ku, nama: nama.trim(), totalMain: 0,
    tanggalMulai: null, sudahScanHariIni: false, status: "-",
    totalGratis: 0, tanggalDaftar: new Date().toISOString(), tanggalScanTerakhir: null,
  });
  simpanDB(db);

  const scanUrl = `${req.protocol}://${req.get("host")}/scan?id=${ku}`;

  // Halaman sukses — tampilkan kode & URL QR
  res.send(html("Terdaftar", `
    <div class="ic" style="background:#E1F5EE;color:#1D9E75">✓</div>
    <h1 style="color:#085041">Member Terdaftar!</h1>
    <div class="nama">${nama.trim()}</div>

    <div style="background:#f0faf5;border:1.5px solid #1D9E75;border-radius:10px;padding:12px 16px;margin-bottom:14px">
      <div style="font-size:11px;color:#888;margin-bottom:4px">Kode member (auto):</div>
      <div style="font-family:monospace;font-size:22px;font-weight:700;color:#1D9E75">${ku}</div>
    </div>

    <div style="font-size:11px;color:#aaa;margin-bottom:6px">URL untuk generate QR — tap untuk copy:</div>
    <div id="qurl"
      onclick="navigator.clipboard&&navigator.clipboard.writeText(this.textContent).then(()=>{this.style.background='#E1F5EE';this.style.color='#085041';setTimeout(()=>{this.style.background='#f5f5f5';this.style.color='#1a73e8'},1500)})"
      style="background:#f5f5f5;border-radius:8px;padding:9px 10px;font-family:monospace;font-size:10px;color:#1a73e8;word-break:break-all;text-align:left;cursor:pointer;margin-bottom:4px;border:1px solid #e0e0e0"
    >${scanUrl}</div>
    <div style="font-size:10px;color:#ccc;margin-bottom:16px">Tap URL di atas → copy → paste ke qr-code-generator.com</div>

    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <a href="/admin/tambah?pin=${pin}" class="btn" style="background:#f0f0f0;color:#333">+ Tambah lagi</a>
      <a href="/admin?pin=${pin}" class="btn" style="background:#1D9E75;color:#fff">Dashboard</a>
    </div>
  `));
});

app.get("/admin/hapus", (req, res) => {
  if ((req.query.pin||"")!==ADMIN_PIN) return res.redirect("/admin");
  const db=bacaDB();
  db.members=db.members.filter(m=>m.kode!==(req.query.kode||"").toUpperCase());
  simpanDB(db); res.redirect(`/admin?pin=${req.query.pin}`);
});

app.get("/admin/reset", (req, res) => {
  if ((req.query.pin||"")!==ADMIN_PIN) return res.redirect("/admin");
  const db=bacaDB();
  db.members.forEach(m=>{m.sudahScanHariIni=false;});
  simpanDB(db); res.redirect(`/admin?pin=${req.query.pin}`);
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
