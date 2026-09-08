# Analisis Teknis & Rencana Implementasi: Perbaikan Multi-Tab Sync & Bug Otomasi Berhenti

Dokumen ini berisi hasil analisis mendalam mengenai 2 permasalahan utama pada aplikasi **Pertamina S&D Autofill Assistant (Multi-Tab)** serta rancangan solusi teknis sebelum dilakukan pengkodean.

---

## 1. Hasil Analisis Masalah & Akar Penyebab (Root Cause Analysis)

### 📌 Masalah 1: Tab Pekerja Saling Menunggu (Bentrokan State & Navigasi Berulang)
* **Temuan pada Kode (`content.js` & `background.js`):**
  1. **Global Storage Collision (Paling Kritis):** 
     Saat ini seluruh Tab Pekerja (Tab 1, Tab 2, Tab 3) dan Master Tab membaca & menulis variabel status yang **sama** di `chrome.storage.local`, seperti `autofillStage`, `gateInSubmitted`, `pengisianSubmitted`, `gateOutSubmitted`, `subIdx`, dan `currentIndex`.
     * *Dampak:* Ketika Tab 1 mengubah `gateInSubmitted = true`, Tab 2 & Tab 3 ikut membaca `gateInSubmitted = true` dari storage global yang sama. Akibatnya, Tab 2 & 3 mengira tahapan Gate In milik mereka sudah selesai, atau saling menimpa nilai `subIdx` (detail LO pengisian).
  2. **Ketergantungan pada `currentIndex` Global:**
     Di `initAutofill()`, setiap tab mengambil data baris Excel menggunakan `res.excelData[res.currentIndex]`. Padahal Master Tab terus menambah `currentIndex` setiap kali membuka tab baru. Akibatnya, Tab Pekerja 1 yang sedang memproses Plat A tiba-tiba membaca data Plat B milik Tab 2.
  3. **Navigasi Berulang via Halaman Jembatan (`/ProsesList`):**
     Setelah Gate In selesai, tab pekerja diarahkan kembali ke `/ProsesList` untuk membaca status tabel dan mengklik link Pengisian, lalu balik lagi ke `/ProsesList` sebelum klik Gate Out. Hal ini menciptakan titik tunggu (*bottleneck*) antar-tab.

---

### 📌 Masalah 2: Aplikasi Berhenti Saat Data Excel Habis Padahal Pekerja Belum Selesai Gate Out
* **Temuan pada Kode (`content.js`):**
  ```javascript
  const idx = res.currentIndex || 0;
  if (idx >= res.excelData.length) {
    Logger.log('Semua data di Excel telah selesai diproses!', 'success');
    chrome.storage.local.set({ autofillActive: false }); // 🚨 BUG UTAMA!
    return;
  }
  ```
* **Akar Penyebab:**
  1. Begitu Master Tab selesai mendistribusikan seluruh baris Excel ke tab pekerja (`currentIndex >= excelData.length`), sistem **langsung menyet `autofillActive: false`**.
  2. Di saat yang sama, seluruh Tab Pekerja menjalankan polling `initAutofill()` setiap 1.5 detik yang mengecek `res.autofillActive`. Karena bernilai `false`, **seluruh tab pekerja di background LANGSUNG BERHENTI (FREEZE)** saat itu juga, meskipun transaksi di tab tersebut baru sampai di tahap Gate In atau Pengisian.
  3. Aplikasi menganggap "Master selesai dispatch" sebagai "Seluruh proses Gate Out selesai".

---

## 2. Rancangan Solusi & Perubahan Arsitektur

### 🛠️ Solusi 1: Isolasi State Per-Tab Pekerja (Tab-Scoped Storage Context)
* **Mekanisme Baru:**
  1. Saat Master Tab membuka tab pekerja via `OPEN_WORKER_TAB`, `background.js` menyimpan data transaksi spesifik per `tabId` (misal: `worker_context_<tabId>`).
  2. Saat `content.js` berjalan di Tab Pekerja, script akan mendeteksi `tabId` (atau mendaftarkan diri ke background) untuk mengambil `worker_context` khusus milik tab tersebut.
  3. Tab Pekerja **TIDAK AKAN LAGI** membaca/menulis `autofillStage`, `gateInSubmitted`, `pengisianSubmitted`, `subIdx`, atau `currentIndex` global. Semua state disimpan terisolasi di `worker_context_<tabId>`.

### 🛠️ Solusi 2: Alur Mandiri Tanpa Henti (Gate In ➡️ Pengisian ➡️ Gate Out)
* **Mekanisme Baru:**
  1. Tab Pekerja yang sudah memegang 1 data transaksi (Nopol & LO) akan mengeksekusi alur secara linier:
     MT Gate In -> Pengisian (Modal LO) -> MT Gate Out
  2. Setelah submit Gate In, Tab Pekerja langsung melanjutkan ke Pengisian tanpa harus terhambat oleh state tab pekerja lain.
  3. Tab pekerja hanya akan **menunggu dan selesai di tahap Gate Out**. Setelah submit Gate Out sukses, tab tersebut memberi sinyal `WORKER_TASK_COMPLETED` ke `background.js` dan menutup dirinya sendiri.

### 🛠️ Solusi 3: Master Dispatcher & Completion Tracking
* **Mekanisme Baru:**
  1. Ketika `currentIndex >= excelData.length`, Master Tab **TIDAK BOLEH** langsung menyet `autofillActive: false`.
  2. Master Tab berpindah ke status **`WAITING_FOR_WORKERS`** (Menunggu Seluruh Tab Pekerja Selesai).
  3. Background Service Worker akan memantau jumlah tab pekerja aktif (`activeWorkerTabs.size`).
  4. Status `autofillActive` baru diubah menjadi `false` (dan UI di-popup berubah menjadi Completed) HANYA KETIKA:
     `currentIndex >= excelData.length` DAN `activeWorkerTabs.size === 0`

---

## 3. Rincian Perubahan Berdasarkan File

### 1. `background.js`
* Tambahkan endpoint pesan untuk mendapatkan data context spesifik per `tabId` (`GET_WORKER_CONTEXT`).
* Tambahkan pengecekan status akhir: jika Master sudah selesai kirim semua baris Excel DAN `activeWorkerTabs.size === 0`, baru kirim notifikasi otomasi selesai total.

### 2. `content.js`
* **Refactoring State Storage:** Buat modul/helper `WorkerContext` untuk mengelola storage per-tab (`worker_context_<tabId>`).
* **Update Engine:** `initAutofill()` memisahkan alur untuk **Master Tab** (halaman list/dispatch) dan **Worker Tab** (halaman Gate In, Pengisian, Gate Out).
* **Update Master Engine:** Hapus pemanggilan `autofillActive: false` di `idx >= excelData.length`. Ubah ke pemonitoran tab pekerja aktif.
* **Update Handlers:** `GateInPageHandler`, `PengisianPageHandler`, dan `GateOutPageHandler` menggunakan data terisolasi dari `WorkerContext`.

### 3. `popup.js`
* Update tampilan status ketika Master Tab sudah selesai mendistribusikan semua data tetapi tab pekerja masih berproses (menampilkan `Menunggu Pekerja... [Sisa X Tab]`).
