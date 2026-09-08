# Walkthrough: Solusi Halaman Blank Page & Network Timeout (Self-Healing Watchdog)

Telah diimplementasikan kelas **`NetworkWatchdog`** di `content.js` untuk mendeteksi dan memulihkan otomasi secara otomatis jika terjadi **halaman blank / server error (504 Gateway Timeout / 500 Error)** saat jaringan lambat pada URL pencarian `ProsesList?cmd=search&x_IdReferensi...`.

---

## 1. Analisis & Cara Kerja Self-Healing Watchdog

Ketika server Pertamina mengembalikan halaman kosong (*blank*) atau pesan error jaringan:
1. **Deteksi Otomatis (`checkAndRecover()`):**
   - Mendeteksi apakah `document.body` kosong (`children.length === 0`).
   - Mendeteksi apakah halaman berisi pesan error server: `504 Gateway Time-out`, `500 Internal Server Error`, `Service Unavailable`, `Bad Gateway`, `The page cannot be displayed`, dsb.
2. **Pemulihan Navigasi Otomatis (`sanitizeAndReload`):**
   - Jika terdeteksi *blank/error* pada URL pencarian (`cmd=search`), bot memberikan peringatan di log dan **secara otomatis mengarahkan ulang ke URL bersih `/ProsesList` dalam 3 detik**.
   - Jika terjadi di halaman lain, bot melakukan **auto-reload tab (`window.location.reload()`)** dalam 3 detik.
3. **Stuck Timer Protection (`startStuckTimer`):**
   - Jika tab pekerja tidak merespons atau tertahan di halaman yang tidak valid selama **25 detik**, watchdog secara otomatis memicu *reload* untuk memulihkan alur otomasi.

---

## 2. Perubahan Kode Utama (`content.js`)

```diff
content.js:
+ Added NetworkWatchdog class with checkAndRecover() and startStuckTimer()
+ Integrated NetworkWatchdog.checkAndRecover() into AutofillEngine.initAutofill()
+ Auto-redirect search URL timeout (ProsesList?cmd=search&...) to clean base URL (/ProsesList)
```

---

## 3. Ringkasan Verifikasi & Pengujian

- **Skenario 1 (Network Timeout / 504 Gateway Timeout):** Bot mendeteksi teks error, mencatat log `[Network Watchdog] Halaman blank/server error terdeteksi...`, dan mengarahkan kembali ke `/ProsesList` bersih dalam 3 detik.
- **Skenario 2 (Blank Body):** Jika server hanya menampilkan halaman putih kosong tanpa HTML, watchdog mengenali `body.children.length === 0` dan merefresh halaman secara otomatis.
- **Skenario 3 (Stuck Tab):** Jika tab pekerja berhenti bergerak > 25 detik saat otomasi aktif, watchdog merefresh tab untuk memulihkan koneksi.
