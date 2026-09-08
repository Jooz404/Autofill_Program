# Implementation Plan: Batas Maksimal Tab Pekerja (Worker Concurrency Control)

Menambahkan opsi konfigurasi dinamis **Batas Maksimal Tab Pekerja (Max Concurrent Worker Tabs)** yang dapat diatur pengguna (1-10 tab) pada Popup Extension, serta memperbarui Master Dispatcher untuk mengontrol pembukaan tab sesuai batas tersebut.

## Proposed Changes

### UI & Configuration (`popup.html`, `popup.js`)

#### [MODIFY] [popup.html](file:///c:/Users/Josua/Downloads/Magang_Pertamina/Project%20Autofill%20RSD/popup.html)
- Menambahkan input field angka `max-workers-input` (range 1 - 10, default 3) di dalam Card Pengaturan Control Panel.

#### [MODIFY] [popup.js](file:///c:/Users/Josua/Downloads/Magang_Pertamina/Project%20Autofill%20RSD/popup.js)
- Membaca dan menyimpan preferensi `maxWorkerTabs` ke `chrome.storage.local`.

---

### Core Automation & Dispatcher (`background.js`, `content.js`)

#### [MODIFY] [background.js](file:///c:/Users/Josua/Downloads/Magang_Pertamina/Project%20Autofill%20RSD/background.js)
- Membaca `maxWorkerTabs` secara dinamis dari `chrome.storage.local` pada handler `OPEN_WORKER_TAB` dan `GET_ACTIVE_WORKER_COUNT`.

#### [MODIFY] [content.js](file:///c:/Users/Josua/Downloads/Magang_Pertamina/Project%20Autofill%20RSD/content.js)
- Memperbarui log pesan pada `ListPageHandler` untuk menampilkan status antrean kuota dinamis (`res.activeCount/res.max`).

---

## Verification Plan

### Automated / Manual Verification
1. Atur **Batas Maksimal Tab Pekerja = 2** pada Popup Extension.
2. Unggah file Excel berisi 5 baris data truk, lalu jalankan **Mulai Autofill**.
3. Verifikasi Master Dispatcher **hanya membuka maksimal 2 tab pekerja secara bersamaan**.
4. Saat 1 tab pekerja selesai *Gate Out* dan ditutup, verifikasi Master Dispatcher secara otomatis membuka tab pekerja ke-3.
5. Ubah batas ke **5 tab**, dan pastikan sistem dapat berjalan dengan 5 tab pekerja simultan.
