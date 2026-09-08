# Analisis Teknis & Rencana Implementasi: Network Timeout & Blank Page Recovery Watchdog

Dokumen ini berisi analisis penyebab halaman *blank* (tampilan putih kosong / server error) saat jaringan lambat pada URL `ProsesList?cmd=search&x_IdReferensi...` serta rancangan solusi **Self-Healing Watchdog** untuk mencegah otomasi terhenti (*stuck*).

---

## 1. Analisis Akar Masalah (Root Cause Analysis)

### 📌 Mengapa Terjadi Blank Page?
URL `https://sndone.patraniaga.com/ProsesList?cmd=search&x_IdReferensi%5B%5D=S-1419-20260907-0015&search=&searchtype=` adalah URL hasil pencarian/redirect server. Saat terjadi masalah jaringan atau *server overload*:
1. **Server-side Timeout / Empty HTTP Response:** Server web backend Pertamina gagal memuat template HTML dan mengembalikan *body* kosong (`<body></body>`) atau kode status error (seperti *504 Gateway Time-out*, *500 Internal Server Error*, *Service Unavailable*).
2. **Loss of DOM Context:** Karena halaman tidak memiliki elemen HTML standar (seperti tabel `.table`, tombol `#btn-add-penyaluran`, atau form), script `content.js` di tab pekerja tidak dapat menemukan elemen target apa pun.
3. **Bot Stuck/Freeze:** Script `content.js` terjebak dalam kondisi *looping/idle* tanpa melakukan aksi karena halaman tidak merespons dan tidak merefresh diri secara otomatis.

---

## 2. Rancangan Solusi: Automatic Self-Healing & Network Watchdog

Untuk memastikan otomasi **100% tahan banting (resilient)** terhadap jaringan lambat dan halaman *blank*, kita mengimplementasikan **Network Timeout & Blank Page Watchdog** pada `content.js`:

### 🛠️ Komponen 1: Blank Page & Server Error Detector
Setiap kali script `content.js` dimuat atau dijalankan di halaman portal:
- Memeriksa apakah `document.body` kosong (`document.body.children.length === 0` atau `document.body.innerText.trim() === ""`).
- Memeriksa apakah `document.body.innerText` mengandung kata kunci error server:
  - `"504 Gateway Time-out"`
  - `"500 Internal Server Error"`
  - `"Service Unavailable"`
  - `"The page cannot be displayed"`
  - `"Bad Gateway"`

### 🛠️ Komponen 2: Auto-Redirect & Reload Sanitizer
Jika terdeteksi *Blank Page* atau *Server Error*:
1. Logger mencatat warning: `[Network Watchdog] Halaman blank / Server error terdeteksi pada URL pencarian. Mencoba refresh/redirect otomatis dalam 3 detik...`
2. Jika URL mengandung parameter pencarian yang bermasalah (`cmd=search`), script mengarahkan ulang ke URL bersih **`/ProsesList`** atau memanggil `window.location.reload()`.
3. Menambahkan jeda acak/backoff 3 detik agar server tidak dibom *request*.

### 🛠️ Komponen 3: Tab Stuck Watchdog (Timer Proteksi 25 Detik)
Jika tab pekerja berada di suatu halaman selama lebih dari 25 detik tanpa ada navigasi atau interaksi elemen yang berhasil:
- Watchdog otomatis memicu `window.location.reload()` atau kembali ke halaman jembatan `/ProsesList` untuk melanjutkan tahapan transaksi yang terhenti.

---

## 3. Rincian Perubahan Berdasarkan File

#### [MODIFY] [content.js](file:///c:/Users/Josua/Downloads/Magang_Pertamina/Project%20Autofill%20RSD/content.js)
- Menambahkan kelas `NetworkWatchdog` yang berjalan otomatis saat script diinjeksi.
- Menambahkan pemeriksaan halaman *blank/error* sebelum `AutofillEngine` mengeksekusi handler.
- Menambahkan metode `sanitizeAndReload()` untuk mengembalikan navigasi ke URL bersih `/ProsesList`.

---

## 4. Verification Plan

### Manual Verification
1. Simulasi *Blank Page*: Buka halaman portal yang sengaja di-clear HTML-nya atau buat tab dengan teks "504 Gateway Time-out".
2. Verifikasi `NetworkWatchdog` mendeteksi kondisi tersebut dan melakukan reload/redirect otomatis dalam 3 detik.
3. Pastikan bot melanjutkan transaksi yang terpending tanpa *stuck*.
