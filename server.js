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

// ── HTML wrapper ─────────────────────────────────────────────
function html(title, body, bg = "#f0f0f0") {
  return `<!DOCTYPE html><html lang="id"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>${NAMA_ARENA}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${bg};min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#fff;border-radius:20px;padding:28px 22px;max-width:360px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.10)}
    .arena{font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#bbb;margin-bottom:10px}
    .ic{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px}
    h1{font-size:19px;font-weight:700;margin-bottom:4px}
    .nama{font-size:22px;font-weight:700;color:#111;margin-bottom:10px}
    .pesan{font-size:13px;color:#666;line-height:1.65;margin-bottom:16px}
    input[type=password],input[type=text]{width:100%;padding:12px;border:1.5px solid #ddd;border-radius:10px;font-size:24px;text-align:center;letter-spacing:.4em;outline:none;font-family:monospace;margin-bottom:12px}
    input:focus{border-color:#1D9E75}
    button[type=submit]{width:100%;background:#1D9E75;color:#fff;border:none;border-radius:10px;padding:13px;font-size:15px;font-weight:600;cursor:pointer}
    button[type=submit]:active{background:#15896a}
    .dots{display:flex;justify-content:center;flex-wrap:wrap;gap:5px;margin-bottom:8px}
    .dot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600}
    .bar-wrap{background:#eee;border-radius:8px;height:8px;overflow:hidden;margin-bottom:5px}
    .bar-fill{height:100%;border-radius:8px}
    .bar-label{font-size:11px;color:#aaa}
    .kode-badge{display:inline-block;background:#f5f5f5;border-radius:8px;padding:4px 12px;font-size:11px;font-family:monospace;color:#999;margin-top:12px}
    .time{font-size:10px;color:#ccc;margin-top:12px}
    .reward-box{border-radius:10px;padding:12px 16px;font-size:14px;font-weight:600;margin-bottom:14px}
    .err-note{background:#FAEEDA;color:#633806;border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:10px}
    a.btn{display:inline-block;border-radius:10px;padding:10px 22px;font-size:13px;font-weight:600;text-decoration:none}
    label{display:block;font-size:12px;color:#888;text-align:left;margin-bottom:5px}
    .field{width:100%;padding:10px 12px;border:1.5px solid #ddd;border-radius:10px;font-size:14px;margin-bottom:14px;outline:none}
    .field:focus{border-color:#1D9E75}
  </style>
  </head><body><div class="card">
  <div class="arena">${NAMA_ARENA}</div>
  ${body}
  </div></body></html>`;
}

// ── hasil check-in ───────────────────────────────────────────
function halamanHasil(tipe, d) {
  const C = {
    sukses   :{bg:"#E1F5EE",ac:"#1D9E75",dk:"#085041",ic:"✓"},
    gratis   :{bg:"#EAF3DE",ac:"#3B6D11",dk:"#173404",ic:"★"},
    sudahScan:{bg:"#FAEEDA",ac:"#BA7517",dk:"#412402",ic:"!"},
    error    :{bg:"#FCEBEB",ac:"#E24B4A",dk:"#501313",ic:"✕"},
  }[tipe]||{bg:"#FCEBEB",ac:"#E24B4A",dk:"#501313",ic:"✕"};
  const tm = d.totalMain||0;
  const pct = Math.min(Math.round(tm/BATAS_MAIN*100),100);
  let dots = "";
  for(let i=1;i<=BATAS_MAIN;i++){
    if(i===BATAS_MAIN) dots+=`<div class="dot" style="background:#ffd700;color:#856404;font-size:9px">FREE</div>`;
    else if(i<tm) dots+=`<div class="dot" style="background:${C.ac};color:#fff">${i}</div>`;
    else if(i===tm) dots+=`<div class="dot" style="background:${C.dk};color:#fff;box-shadow:0 0 0 3px ${C.bg}">${i}</div>`;
    else dots+=`<div class="dot" style="background:#eee;color:#bbb">${i}</div>`;
  }
  return html(d.judul,`
    <div class="ic" style="background:${C.bg};color:${C.dk}">${C.ic}</div>
    <h1 style="color:${C.dk}">${d.judul}</h1>
    ${d.nama?`<div class="nama">${d.nama}</div>`:""}
    <p class="pesan">${d.pesan}</p>
    ${d.expired?`<div class="err-note">Periode bonus sebelumnya sudah berakhir. Periode baru dimulai hari ini.</div>`:""}
    ${(tipe==="sukses"&&tm>0)?`<div class="dots">${dots}</div><div class="bar-wrap"><div class="bar-fill" style="background:${C.ac};width:${pct}%"></div></div><div class="bar-label">${tm} dari ${BATAS_MAIN} kunjungan</div>`:""}
    ${(tipe==="sudahScan"&&tm>0)?`<div class="dots">${dots}</div><div class="bar-label">${tm} dari ${BATAS_MAIN} kunjungan bulan ini</div>`:""}
    ${tipe==="gratis"?`<div class="reward-box" style="background:${C.bg};color:${C.dk}">Reward ke-${d.totalGratis||1}!<br>Tunjukkan halaman ini ke kasir.</div>`:""}
    ${d.kode?`<div class="kode-badge">${d.kode}</div>`:""}
    <div class="time">${formatTanggal(new Date())}</div>
  `);
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
  res.send(html("Check-in",`
    <div class="ic" style="background:#E1F5EE;color:#085041">🎱</div>
    <h1 style="color:#085041">Check-in Member</h1>
    <div class="nama">${m.nama}</div>
    <p class="pesan">Kasir: masukkan PIN untuk konfirmasi check-in.</p>
    <form action="/checkin" method="POST">
      <input type="hidden" name="id" value="${kode}">
      <input type="password" name="pin" placeholder="••••" maxlength="8" autofocus autocomplete="off">
      <button type="submit">Konfirmasi Check-in</button>
    </form>
    <div style="font-size:11px;color:#ccc;margin-top:14px">${kode}</div>
  `,"#f0f4ff"));
});

// ── CHECKIN: verifikasi PIN lalu proses ───────────────────────
app.post("/checkin", (req, res) => {
  const kode = (req.body.id||"").trim().toUpperCase();
  const pin  = (req.body.pin||"").trim();

  // PIN salah
  if (pin !== KASIR_PIN) {
    const db  = bacaDB();
    const m   = db.members.find(m=>m.kode===kode);
    return res.send(html("PIN Salah",`
      <div class="ic" style="background:#FCEBEB;color:#791F1F">✕</div>
      <h1 style="color:#791F1F">PIN Salah</h1>
      <div class="nama">${m?m.nama:kode}</div>
      <p class="pesan">PIN yang dimasukkan salah. Coba lagi.</p>
      <form action="/checkin" method="POST">
        <input type="hidden" name="id" value="${kode}">
        <input type="password" name="pin" placeholder="••••" maxlength="8" autofocus autocomplete="off" style="border-color:#E24B4A">
        <button type="submit">Coba Lagi</button>
      </form>
    `,"#fff5f5"));
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
      judul:"Sudah Check-in Hari Ini", nama:m.nama,
      pesan:`${m.nama} sudah check-in pukul ${wkt}. Sampai besok!`, totalMain:m.totalMain
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

app.get("/admin/tambah", (req, res) => {
  const pin=req.query.pin||"";
  if (pin!==ADMIN_PIN) return res.redirect("/admin");
  const {nama,kode}=req.query;
  if (!nama||!kode) return res.send(html("Tambah Member",`
    <div class="ic" style="background:#E1F5EE;color:#1D9E75;font-size:24px">+</div>
    <h1 style="color:#111;margin-bottom:16px">Tambah Member Baru</h1>
    <form action="/admin/tambah" method="get" style="text-align:left">
      <input type="hidden" name="pin" value="${pin}">
      <label>Kode Member</label>
      <input class="field" type="text" name="kode" placeholder="BLD-0001" required style="text-transform:uppercase;font-family:monospace;letter-spacing:.1em">
      <label>Nama Member</label>
      <input class="field" type="text" name="nama" placeholder="Budi Santoso" required>
      <button type="submit" style="width:100%;background:#1D9E75;color:#fff;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:600;cursor:pointer">Daftarkan Member</button>
    </form>
    <a href="/admin?pin=${pin}" style="display:block;text-align:center;margin-top:14px;font-size:13px;color:#888;text-decoration:none">← Dashboard</a>
  `));

  const db=bacaDB(), ku=kode.trim().toUpperCase();
  if (db.members.find(m=>m.kode===ku)) return res.send(html("Kode Ada",`
    <div class="ic" style="background:#FCEBEB;color:#cc4444">✕</div>
    <h1 style="color:#cc4444">Kode Sudah Ada</h1>
    <p class="pesan">Kode <b>${ku}</b> sudah terdaftar.</p>
    <a href="/admin/tambah?pin=${pin}" class="btn" style="background:#1D9E75;color:#fff">← Coba Lagi</a>
  `));

  db.members.push({kode:ku,nama:nama.trim(),totalMain:0,tanggalMulai:null,
    sudahScanHariIni:false,status:"-",totalGratis:0,
    tanggalDaftar:new Date().toISOString(),tanggalScanTerakhir:null});
  simpanDB(db);

  const scanUrl=`${req.protocol}://${req.get("host")}/scan?id=${ku}`;
  res.send(html("Terdaftar",`
    <div class="ic" style="background:#E1F5EE;color:#1D9E75">✓</div>
    <h1 style="color:#085041">Member Terdaftar!</h1>
    <div class="nama">${nama.trim()}</div>
    <div style="background:#f5f5f5;border-radius:8px;padding:8px 14px;font-family:monospace;font-size:17px;font-weight:600;color:#1D9E75;margin-bottom:14px">${ku}</div>
    <div style="font-size:11px;color:#aaa;margin-bottom:6px">URL untuk generate QR:</div>
    <div onclick="navigator.clipboard&&navigator.clipboard.writeText(this.textContent).then(()=>{this.style.background='#E1F5EE';this.style.color='#085041';setTimeout(()=>{this.style.background='';this.style.color=''},1500)})"
      style="background:#f5f5f5;border-radius:8px;padding:8px 10px;font-family:monospace;font-size:10px;color:#1a73e8;word-break:break-all;text-align:left;cursor:pointer;margin-bottom:14px">${scanUrl}</div>
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
