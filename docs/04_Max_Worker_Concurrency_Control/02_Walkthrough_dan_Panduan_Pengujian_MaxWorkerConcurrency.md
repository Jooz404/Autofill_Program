# Walkthrough: Batas Maksimal Tab Pekerja (Worker Concurrency Control)

Telah diimplementasikan fitur **Batas Maksimal Tab Pekerja (Max Concurrent Worker Tabs)** yang memungkinkan pengguna mengatur jumlah maksimal tab pekerja yang dapat berjalan secara simultan (1 hingga 10 tab).

---

## 1. Fitur Baru pada Extension

### Input Pengaturan di UI Popup
Pada Extension Popup (dalam Card Mode Alur Kerja), terdapat input angka baru:
- **`Maksimal Tab Pekerja`**: Pengguna dapat memasukkan angka dari `1` sampai `10` (Nilai Default: `3`).
- **Penyimpanan Otomatis:** Nilai yang dimasukkan akan disimpan secara otomatis ke `chrome.storage.local.maxWorkerTabs` dan langsung aktif untuk siklus otomasi berikutnya.

---

## 2. Cara Kerja Master Dispatcher & Service Worker

1. **Antrean Slot Dinamis:**
   - Saat Master Tab hendak membuka tab pekerja baru untuk baris Excel berikutnya, Service Worker `background.js` memeriksa `activeWorkerTabs.size < maxWorkerTabs`.
2. **Penahanan Slot saat Kuota Penuh:**
   - Jika jumlah tab aktif sudah mencapai batas (misal `3/3`), Master Tab memberikan log: `[Master Dispatcher] Antrean tab pekerja penuh (3/3). Menunggu slot tab pekerja selesai...` dan menahan pendaftaran tab baru.
3. **Membuka Tab Baru Otomatis:**
   - Begitu salah satu tab pekerja selesai diproses dan ditutup (`WORKER_TASK_COMPLETED`), slot kosong terbuka (menjadi `2/3`). Master Tab otomatis mengambil baris Excel berikutnya dan membuka tab pekerja baru.

---

## 3. Ringkasan Perubahan Kode

```diff
popup.html:
+ Added number input field #max-workers-input (min 1, max 10, default 3)

popup.js:
+ Bound #max-workers-input to chrome.storage.local.maxWorkerTabs

background.js:
+ Refactored OPEN_WORKER_TAB and GET_ACTIVE_WORKER_COUNT handlers to read maxWorkerTabs dynamically from storage

content.js:
+ Refactored ListPageHandler log outputs to reflect dynamic maxWorkerTabs quota (e.g. 3/5, 5/5)
```

---

## 4. Panduan Pengujian Manual

1. Buka Popup Extension, atur **Maksimal Tab Pekerja** ke `2`.
2. Unggah file Excel berisi 5 data truk, lalu klik **Mulai Autofill**.
3. **Ekspektasi:** Master Tab hanya membuka maksimal 2 tab pekerja secara bersamaan. Ketika 1 tab pekerja selesai dan ditutup, tab pekerja ke-3 otomatis dibuka.
4. Ubah angka ke `5`, dan verifikasi sistem mampu membuka hingga 5 tab simultan jika laptop Anda mumpuni.
