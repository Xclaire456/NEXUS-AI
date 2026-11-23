# NEXUS AI – Programmer & Academic Mentor

Aplikasi chat mentor programming dan akademik yang berjalan di laptopmu sendiri. Tidak perlu membuka claude.ai. Server lokal kecil memanggil API Anthropic, dan halaman chat dibuka di browser lewat `localhost`.

## Yang dibutuhkan

1. **Node.js 18 atau lebih baru.** Cek dengan `node -v`. Unduh dari https://nodejs.org jika belum ada.
2. **Kunci API Anthropic** dari https://console.anthropic.com (menu API Keys). Penagihan API terpisah dari langganan Claude: biaya dihitung per pemakaian dan perlu saldo kredit di akun console.

Tidak ada `npm install`, karena proyek ini tidak memakai library tambahan.

## Cara menjalankan

1. Ekstrak folder ini, lalu buka terminal di dalamnya.
2. Salin file contoh pengaturan:
   - macOS/Linux: `cp .env.example .env`
   - Windows (PowerShell): `copy .env.example .env`
3. Buka `.env`, isi `ANTHROPIC_API_KEY=` dengan kunci milikmu.
4. Jalankan: `node server.js` (atau `npm start`).
5. Buka http://localhost:3000 di browser.

Hentikan server dengan `Ctrl + C`.

## Pengaturan (.env)

| Variabel | Fungsi | Bawaan |
|---|---|---|
| `ANTHROPIC_API_KEY` | Kunci API (wajib) | kosong |
| `ANTHROPIC_MODEL` | Model yang dipakai. Daftar model ada di dokumentasi Anthropic | `claude-sonnet-5-5` |
| `MAX_TOKENS` | Batas panjang jawaban | `4096` |
| `PORT` | Port server | `3000` |

Setelah mengubah `.env` atau `config.js`, hentikan server lalu jalankan lagi.

## Struktur proyek

```
nexus-ai/
├── server.js        # server HTTP, proxy ke API, streaming jawaban
├── config.js        # persona NEXUS dan 9 mode (edit di sini)
├── public/
│   └── index.html   # antarmuka chat
├── .env.example     # contoh pengaturan
└── package.json
```

## Keamanan

- Kunci API hanya dibaca server dan tidak dikirim ke browser.
- Server hanya mendengarkan di `127.0.0.1`, jadi tidak bisa diakses dari perangkat lain di jaringan.
- Jangan commit file `.env` ke GitHub. `.gitignore` sudah mengecualikannya.
- Jika kunci pernah terbagikan, buat kunci baru di console dan hapus yang lama.

## Menyesuaikan

- **Persona dan mode:** ubah teks `SYS` dan `MODES` di `config.js`.
- **Riwayat chat:** tersimpan di browser (localStorage). Tombol "Percakapan baru" menghapusnya.
- Hanya 20 pesan terakhir yang dikirim ke model, supaya biaya dan panjang konteks terkendali.

## Masalah umum

| Gejala | Penyebab dan solusi |
|---|---|
| "ANTHROPIC_API_KEY belum diisi" | File `.env` belum dibuat atau kuncinya kosong. Ikuti langkah 2–3, lalu jalankan ulang server. |
| "Kunci API ditolak" | Kunci salah atau sudah dicabut. Salin ulang dari console. |
| Error soal saldo atau kredit | Akun console belum punya kredit. Tambahkan di bagian Billing. |
| Error soal model | Nama di `ANTHROPIC_MODEL` tidak valid untuk akunmu. Cek daftar model di dokumentasi. |
| "Port sudah dipakai" | Ganti `PORT` di `.env`, misalnya `3001`. |
| "Server NEXUS tidak terjangkau" | Server di terminal sudah berhenti. Jalankan lagi `node server.js`. |

## Mode overlay (seperti OSD)

Selain lewat browser, NEXUS bisa berjalan sebagai jendela melayang tanpa bingkai yang selalu berada di atas aplikasi lain, dibuka dan ditutup dengan hotkey global.

1. Pasang Electron sekali saja: `npm install --save-dev electron`
2. Jalankan: `npm run overlay`
3. Tekan **Ctrl+Shift+Space** (macOS: **Cmd+Shift+Space**) untuk menampilkan atau menyembunyikan jendela dari mana saja. **Esc** atau tombol × juga menyembunyikannya.
4. Klik kanan ikon NEXUS di system tray untuk: tampil/sembunyi, selalu di atas, mengatur transparansi (100% sampai 70%), atau **Keluar**. Jendela ditutup lewat Esc atau × hanya menyembunyikan, aplikasi tetap hidup di tray.

Pengaturan tambahan di `.env`:

| Variabel | Fungsi | Bawaan |
|---|---|---|
| `NEXUS_HOTKEY` | Hotkey global ([format Electron Accelerator](https://www.electronjs.org/docs/latest/api/accelerator)) | `CommandOrControl+Shift+Space` |
| `NEXUS_HIDE_ON_BLUR` | `true` = jendela otomatis hilang saat kamu klik di luar | `false` |

Catatan:
- Mode overlay memakai port **3737**, jadi bisa berjalan bersamaan dengan versi browser (port 3000). `PORT` di `.env` tidak berlaku untuk mode ini.
- Jendela muncul di atas aplikasi berjendela dan layar penuh jenis borderless. Aplikasi atau game dengan **exclusive fullscreen** bisa tetap menutupinya; ini batasan sistem operasi, bukan pengaturan.
- Di Linux, ikon tray butuh dukungan AppIndicator di desktop environment-mu. Jika ikon tidak muncul, hotkey tetap berfungsi.
- Mulai otomatis saat login belum disertakan. Itu butuh aplikasi dikemas menjadi installer (misalnya dengan electron-builder).
