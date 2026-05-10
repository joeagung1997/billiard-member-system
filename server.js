// ============================================================
//  SISTEM MEMBER BILLIARD - Railway.app
//  
//  Deploy:
//  1. Upload semua file ini ke GitHub repository
//  2. Di Railway: New Project → Deploy from GitHub
//  3. Set Variables di Railway dashboard
//  4. Settings → Domains → Generate Domain
//  5. URL QR: https://[domain]/scan?id=[KODE_MEMBER]
// ============================================================

const express = require("express");
const fs      = require("fs");
const path    = require("path");
const cron    = require("node-cron");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── KONFIGURASI (set di Railway → Variables) ────────────────
const NAMA_ARENA = process.env.NAMA_ARENA || "Arena Billiard";
const BATAS_MAIN = parseInt(process.env.BATAS_MAIN) || 10;
const BATAS_HARI = parseInt(process.env.BATAS_HARI) || 30;
const ADMIN_PIN  = process.env.ADMIN_PIN  || "1234";

// ── DATABASE ─────────────────────────────────────────────────
// Railway persistent volume di /data jika di-mount
// Fallback ke folder project jika volume tidak ada
const DATA_DIR = fs.existsSync("/data") ? "/data" : __dirname;
const DB_PATH  = path.join(DATA_DIR, "db.json");

function bacaDB() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    }
  } catch (e) { console.error("bacaDB error:", e.message); }
  return { members: [] };
}

function simpanDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (e) { console.error("simpanDB error:", e.message); }
}

if (!fs.existsSync(DB_PATH)) {
  simpanDB({ members: [] });
  console.log("db.json dibuat baru di:", DB_PATH);
}

// ── HELPER: format tanggal WIB ───────────────────────────────
function formatTanggal(date) {
  return new Date(date).toLocaleString("id-ID", {
    weekday: "long", day: "numeric", month: "long",
    year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Jakarta"
  });
}

function selisihHari(tgl1, tgl2) {
  const a = new Date(tgl1); a.setHours(0,0,0,0);
  const b = new Date(tgl2); b.setHours(0,0,0,0);
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

// ── HELPER: halaman HTML ─────────────────────────────────────
function halamanHTML({ tipe, nama, judul, pesan, totalMain, totalGratis, kode, expired }) {
  const cfg = {
    sukses    : { bg:"#E1F5EE", accent:"#1D9E75", dark:"#085041", icon:"✓" },
    gratis    : { bg:"#EAF3DE", accent:"#3B6D11", dark:"#173404", icon:"★" },
    sudahScan : { bg:"#FAEEDA", accent:"#BA7517", dark:"#412402", icon:"!" },
    error     : { bg:"#FCEBEB", accent:"#E24B4A", dark:"#501313", icon:"✕" },
  }[tipe] || { bg:"#FCEBEB", accent:"#E24B4A", dark:"#501313", icon:"✕" };

  const tm     = totalMain || 0;
  const persen = Math.min(Math.round((tm / BATAS_MAIN) * 100), 100);
  let dotsHTML = "";
  for (let i = 1; i <= BATAS_MAIN; i++) {
    if (i === BATAS_MAIN)      dotsHTML += `<div class="dot dot-free">FREE</div>`;
    else if (i < tm)           dotsHTML += `<div class="dot dot-done">${i}</div>`;
    else if (i === tm)         dotsHTML += `<div class="dot dot-today">${i}</div>`;
    else                       dotsHTML += `<div class="dot dot-empty">${i}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>${NAMA_ARENA}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f0f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#fff;border-radius:20px;padding:32px 24px 28px;max-width:360px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.10)}
    .arena{font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#aaa;margin-bottom:8px}
    .icon{width:64px;height:64px;border-radius:50%;background:${cfg.bg};color:${cfg.dark};font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}
    h1{font-size:20px;font-weight:700;color:${cfg.dark};margin-bottom:4px}
    .nama{font-size:24px;font-weight:700;color:#111;margin-bottom:10px}
    .pesan{font-size:14px;color:#666;line-height:1.6;margin-bottom:18px}
    .expired-note{background:#FAEEDA;color:#633806;border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:12px}
    .dots{display:flex;justify-content:center;flex-wrap:wrap;gap:5px;margin-bottom:8px}
    .dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600}
    .dot-done{background:${cfg.accent};color:#fff}
    .dot-today{background:${cfg.dark};color:#fff;box-shadow:0 0 0 3px ${cfg.bg}}
    .dot-empty{background:#eee;color:#bbb}
    .dot-free{background:#ffd700;color:#856404;font-size:9px}
    .bar-wrap{background:#eee;border-radius:8px;height:8px;overflow:hidden;margin-bottom:6px}
    .bar-fill{background:${cfg.accent};height:100%;border-radius:8px;width:${persen}%}
    .bar-label{font-size:12px;color:#999}
    .reward-box{background:${cfg.bg};color:${cfg.dark};border-radius:10px;padding:12px 16px;font-size:14px;font-weight:600;margin-bottom:14px}
    .kode{display:inline-block;background:#f5f5f5;border-radius:8px;padding:5px 14px;font-size:11px;font-family:monospace;color:#888;margin-top:14px}
    .time{font-size:11px;color:#ccc;margin-top:14px}
  </style>
</head>
<body>
<div class="card">
  <div class="arena">${NAMA_ARENA}</div>
  <div class="icon">${cfg.icon}</div>
  <h1>${judul}</h1>
  ${nama ? `<div class="nama">${nama}</div>` : ""}
  <p class="pesan">${pesan}</p>
  ${expired ? `<div class="expired-note">Periode bonus sebelumnya sudah berakhir. Periode baru dimulai hari ini.</div>` : ""}
  ${(tipe === "sukses" && tm > 0) ? `
  <div class="dots">${dotsHTML}</div>
  <div class="bar-wrap"><div class="bar-fill"></div></div>
  <div class="bar-label">${tm} dari ${BATAS_MAIN} kunjungan</div>` : ""}
  ${(tipe === "sudahScan" && tm > 0) ? `
  <div class="dots">${dotsHTML}</div>
  <div class="bar-label">${tm} dari ${BATAS_MAIN} kunjungan bulan ini</div>` : ""}
  ${tipe === "gratis" ? `<div class="reward-box">Reward ke-${totalGratis||1}!<br>Tunjukkan halaman ini ke kasir.</div>` : ""}
  ${kode ? `<div class="kode">${kode}</div>` : ""}
  <div class="time">${formatTanggal(new Date())}</div>
</div>
</body></html>`;
}

// ── MIDDLEWARE ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── HOME ─────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html><html lang="id"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${NAMA_ARENA}</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#f0f0f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.card{background:#fff;border-radius:16px;padding:28px 24px;max-width:300px;width:100%;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.08)}.ic{font-size:40px;margin-bottom:12px}h1{font-size:18px;font-weight:600;color:#111;margin-bottom:8px}p{font-size:13px;color:#888;margin-bottom:16px}.btn{display:inline-block;background:#1D9E75;color:#fff;border-radius:8px;padding:10px 20px;font-size:13px;font-weight:600;text-decoration:none}</style>
  </head><body><div class="card">
  <div class="ic">🎱</div>
  <h1>${NAMA_ARENA}</h1>
  <p>Sistem member berjalan normal.</p>
  <a href="/admin" class="btn">Dashboard Admin</a>
  </div></body></html>`);
});

// ── SCAN QR ──────────────────────────────────────────────────
app.get("/scan", (req, res) => {
  const kode = (req.query.id || "").trim().toUpperCase();
  if (!kode) return res.send(halamanHTML({ tipe:"error", judul:"QR Tidak Valid", pesan:"QR code ini tidak mengandung kode member. Hubungi kasir." }));

  const db  = bacaDB();
  const idx = db.members.findIndex(m => m.kode.toUpperCase() === kode);
  if (idx === -1) return res.send(halamanHTML({ tipe:"error", judul:"Member Tidak Ditemukan", pesan:`Kode "${kode}" tidak terdaftar. Hubungi kasir.` }));

  const m     = db.members[idx];
  const today = new Date();

  if (m.sudahScanHariIni && m.tanggalScanTerakhir) {
    const waktu = new Date(m.tanggalScanTerakhir).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit", timeZone:"Asia/Jakarta" });
    return res.send(halamanHTML({ tipe:"sudahScan", nama:m.nama, judul:"Sudah Check-in Hari Ini", pesan:`Kamu sudah check-in pukul ${waktu}. Sampai besok ya!`, totalMain:m.totalMain }));
  }

  let expired = false;
  if (m.tanggalMulai) {
    if (selisihHari(m.tanggalMulai, today) >= BATAS_HARI) {
      expired = true; m.totalMain = 0; m.tanggalMulai = today.toISOString();
    }
  } else { m.tanggalMulai = today.toISOString(); }

  m.totalMain += 1;
  m.sudahScanHariIni = true;
  m.tanggalScanTerakhir = today.toISOString();

  if (m.totalMain >= BATAS_MAIN) {
    m.totalGratis = (m.totalGratis || 0) + 1;
    m.status = "GRATIS"; m.tanggalMulai = today.toISOString();
    const tg = m.totalGratis; const tn = m.totalMain; m.totalMain = 0;
    db.members[idx] = m; simpanDB(db);
    return res.send(halamanHTML({ tipe:"gratis", nama:m.nama, judul:"Selamat! Main Gratis!", pesan:`Kamu sudah main ${tn}x! Main berikutnya GRATIS. Tunjukkan ke kasir.`, totalGratis:tg, kode }));
  }

  m.status = "-"; db.members[idx] = m; simpanDB(db);
  return res.send(halamanHTML({ tipe:"sukses", nama:m.nama, judul:"Check-in Berhasil!", pesan:expired ? `Periode bonus direset. Kunjungan ke-1 periode baru!` : `Kunjungan ke-${m.totalMain} bulan ini. Butuh ${BATAS_MAIN - m.totalMain}x lagi untuk GRATIS!`, totalMain:m.totalMain, kode, expired }));
});

// ── ADMIN ────────────────────────────────────────────────────
app.get("/admin", (req, res) => {
  if ((req.query.pin || "") !== ADMIN_PIN) {
    return res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#f0f0f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.card{background:#fff;border-radius:16px;padding:28px 24px;max-width:300px;width:100%;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.08)}h2{font-size:17px;font-weight:600;margin-bottom:4px;color:#111}.sub{font-size:13px;color:#888;margin-bottom:20px}input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:20px;text-align:center;letter-spacing:.3em;margin-bottom:12px;outline:none;font-family:monospace}input:focus{border-color:#1D9E75}button{width:100%;background:#1D9E75;color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:600;cursor:pointer}</style></head><body><div class="card"><h2>Admin Panel</h2><p class="sub">${NAMA_ARENA}</p><form action="/admin" method="get"><input type="password" name="pin" placeholder="••••" maxlength="8" autofocus><button>Masuk</button></form></div></body></html>`);
  }

  const db  = bacaDB();
  const pin = req.query.pin;
  const rows = db.members.map(m => {
    const bar = `<div style="background:#eee;border-radius:4px;height:6px;width:70px;display:inline-block;vertical-align:middle;margin-right:4px"><div style="background:#1D9E75;height:100%;border-radius:4px;width:${Math.round((m.totalMain/BATAS_MAIN)*100)}%"></div></div><span style="font-size:11px;color:#888">${m.totalMain}/${BATAS_MAIN}</span>`;
    return `<tr><td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#1D9E75;font-weight:500">${m.kode}</td><td style="padding:10px 12px;font-size:13px">${m.nama}</td><td style="padding:10px 12px">${m.status==="GRATIS"?'<span style="background:#EAF3DE;color:#27500A;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">GRATIS</span>':bar}</td><td style="padding:10px 12px;text-align:center;font-size:12px">${m.sudahScanHariIni?'<span style="color:#1D9E75;font-weight:500">✓</span>':'<span style="color:#ccc">—</span>'}</td><td style="padding:10px 12px;text-align:center;font-size:12px;color:#888">${m.totalGratis||0}x</td><td style="padding:10px 12px;text-align:center"><a href="/admin/hapus?pin=${pin}&kode=${m.kode}" onclick="return confirm('Hapus ${m.nama}?')" style="font-size:11px;color:#cc4444;text-decoration:none">Hapus</a></td></tr>`;
  }).join("");

  res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin — ${NAMA_ARENA}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#f5f5f5;padding:16px}.hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px}h1{font-size:17px;font-weight:600;color:#111}.sub{font-size:12px;color:#888;margin-top:2px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.stat{background:#fff;border-radius:8px;padding:10px;text-align:center}.sn{font-size:20px;font-weight:600;color:#111}.sl{font-size:11px;color:#888;margin-top:2px}.card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);margin-bottom:12px;overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:480px}th{background:#f8f8f8;padding:9px 12px;text-align:left;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;border-bottom:1px solid #eee}tr{border-bottom:.5px solid #f0f0f0}tr:last-child{border-bottom:none}.btns{display:flex;gap:8px;flex-wrap:wrap}.btn{display:inline-block;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none}.bg{background:#1D9E75;color:#fff}.bw{background:#f0f0f0;color:#555;border:none;cursor:pointer}</style></head><body>
  <div class="hdr"><div><h1>${NAMA_ARENA}</h1><div class="sub">${new Date().toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}</div></div></div>
  <div class="stats"><div class="stat"><div class="sn">${db.members.length}</div><div class="sl">Member</div></div><div class="stat"><div class="sn">${db.members.filter(m=>m.sudahScanHariIni).length}</div><div class="sl">Scan hari ini</div></div><div class="stat"><div class="sn">${db.members.filter(m=>m.status==="GRATIS").length}</div><div class="sl">Reward pending</div></div></div>
  <div class="card"><table><thead><tr><th>Kode</th><th>Nama</th><th>Progress</th><th>Scan</th><th>Gratis</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:20px;color:#aaa;font-size:13px">Belum ada member</td></tr>'}</tbody></table></div>
  <div class="btns"><a href="/admin/tambah?pin=${pin}" class="btn bg">+ Tambah Member</a><a href="/admin/reset?pin=${pin}" class="btn bw" onclick="return confirm('Reset scan harian?')">Reset Scan Harian</a></div>
  </body></html>`);
});

// ── TAMBAH MEMBER ────────────────────────────────────────────
app.get("/admin/tambah", (req, res) => {
  const pin = req.query.pin || "";
  if (pin !== ADMIN_PIN) return res.redirect("/admin");
  const { nama, kode } = req.query;

  if (!nama || !kode) {
    return res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tambah Member</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#f0f0f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.card{background:#fff;border-radius:16px;padding:28px 24px;max-width:360px;width:100%;box-shadow:0 4px 16px rgba(0,0,0,.08)}h2{font-size:17px;font-weight:600;margin-bottom:16px;color:#111}label{font-size:12px;color:#888;display:block;margin-bottom:4px}input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;margin-bottom:14px;outline:none}input:focus{border-color:#1D9E75}button{width:100%;background:#1D9E75;color:#fff;border:none;border-radius:8px;padding:11px;font-size:14px;font-weight:600;cursor:pointer}.back{display:block;text-align:center;margin-top:12px;font-size:13px;color:#888;text-decoration:none}.hint{font-size:11px;color:#bbb;margin-top:-10px;margin-bottom:12px}</style></head><body><div class="card"><h2>Tambah Member Baru</h2><form action="/admin/tambah" method="get"><input type="hidden" name="pin" value="${pin}"><label>Kode Member</label><input name="kode" placeholder="BLD-0001" style="text-transform:uppercase;font-family:monospace" required><p class="hint">Format: BLD-0001, BLD-0002, dst.</p><label>Nama Member</label><input name="nama" placeholder="Budi Santoso" required><button>Daftarkan Member</button></form><a class="back" href="/admin?pin=${pin}">← Dashboard</a></div></body></html>`);
  }

  const db = bacaDB();
  const kodeUpper = kode.trim().toUpperCase();
  if (db.members.find(m => m.kode === kodeUpper)) {
    return res.send(`<html><body style="font-family:sans-serif;padding:20px"><p style="color:#cc4444">Kode <b>${kodeUpper}</b> sudah ada.</p><a href="/admin/tambah?pin=${pin}" style="color:#1D9E75">← Coba lagi</a></body></html>`);
  }

  db.members.push({ kode:kodeUpper, nama:nama.trim(), totalMain:0, tanggalMulai:null, sudahScanHariIni:false, status:"-", totalGratis:0, tanggalDaftar:new Date().toISOString(), tanggalScanTerakhir:null });
  simpanDB(db);

  const scanUrl = `${req.protocol}://${req.get("host")}/scan?id=${kodeUpper}`;
  res.send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Member Terdaftar</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#f0f0f0;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.card{background:#fff;border-radius:16px;padding:28px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.08)}.ic{width:56px;height:56px;border-radius:50%;background:#E1F5EE;color:#1D9E75;font-size:24px;display:flex;align-items:center;justify-content:center;margin:0 auto 14px}h2{font-size:18px;font-weight:600;color:#111;margin-bottom:4px}.sub{font-size:13px;color:#888;margin-bottom:16px}.kode{background:#f5f5f5;border-radius:8px;padding:10px 16px;font-family:monospace;font-size:18px;font-weight:600;color:#1D9E75;margin-bottom:14px}.lbl{font-size:11px;color:#aaa;margin-bottom:6px}.url{background:#f5f5f5;border-radius:8px;padding:8px 12px;font-size:11px;font-family:monospace;color:#1a73e8;word-break:break-all;text-align:left;margin-bottom:4px;cursor:pointer}.hint{font-size:11px;color:#aaa;margin-bottom:16px}.btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.btn{display:inline-block;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none}.bg{background:#1D9E75;color:#fff}.bw{background:#f0f0f0;color:#333}</style></head><body><div class="card"><div class="ic">✓</div><h2>Member Terdaftar!</h2><p class="sub">${nama.trim()}</p><div class="kode">${kodeUpper}</div><p class="lbl">URL untuk QR code:</p><div class="url" id="u" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.textContent).then(()=>{this.style.background='#E1F5EE';this.style.color='#085041';setTimeout(()=>{this.style.background='';this.style.color=''},1500)})">${scanUrl}</div><p class="hint">Tap URL di atas untuk copy</p><div class="btns"><a href="/admin/tambah?pin=${pin}" class="btn bw">+ Tambah lagi</a><a href="/admin?pin=${pin}" class="btn bg">Dashboard</a></div></div></body></html>`);
});

// ── HAPUS MEMBER ─────────────────────────────────────────────
app.get("/admin/hapus", (req, res) => {
  if ((req.query.pin||"") !== ADMIN_PIN) return res.redirect("/admin");
  const db = bacaDB();
  db.members = db.members.filter(m => m.kode !== (req.query.kode||"").toUpperCase());
  simpanDB(db);
  res.redirect(`/admin?pin=${req.query.pin}`);
});

// ── RESET HARIAN MANUAL ──────────────────────────────────────
app.get("/admin/reset", (req, res) => {
  if ((req.query.pin||"") !== ADMIN_PIN) return res.redirect("/admin");
  const db = bacaDB();
  db.members.forEach(m => { m.sudahScanHariIni = false; });
  simpanDB(db);
  res.redirect(`/admin?pin=${req.query.pin}`);
});

// ── CRON: reset jam 02.00 WIB = 19.00 UTC ───────────────────
cron.schedule("0 19 * * *", () => {
  const db = bacaDB();
  db.members.forEach(m => { m.sudahScanHariIni = false; });
  simpanDB(db);
  console.log(`[${new Date().toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})}] Reset harian selesai.`);
}, { timezone: "UTC" });

// ── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` ${NAMA_ARENA} — Sistem Member`);
  console.log(`========================================`);
  console.log(` Port    : ${PORT}`);
  console.log(` DB      : ${DB_PATH}`);
  console.log(` Limit   : ${BATAS_MAIN}x / ${BATAS_HARI} hari`);
  console.log(`========================================\n`);
});
