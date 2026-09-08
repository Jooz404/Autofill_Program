# Walkthrough: Perbaikan Bug Multi-Tab Synchronization & Master Completion Tracking

Telah dilakukan perbaikan komprehensif pada **Pertamina S&D Autofill Assistant** untuk mengatasi dua permasalahan utama:
1. **Eliminasi Bottleneck (Tab Saling Menunggu):** Setiap tab pekerja kini beroperasi secara terisolasi dan mandiri dari *Gate In -> Pengisian -> Gate Out*.
2. **Perbaikan Bug Aplikasi Berhenti Prematur:** Master tab tidak lagi menyet status otomasi menjadi non-aktif saat data Excel habis, melainkan menunggu hingga seluruh tab pekerja yang sedang berjalan menyelesaikan transaksi dan menutup diri.

---

## Perubahan Kode Utama

### 1. `background.js` (Master & Worker Context Orchestrator)
- **Pelacakan Worker Active (`activeWorkerTabs`):** Menambahkan `Map` di Service Worker background untuk memetakan `tabId` ke `workerData` (termasuk `rowData` dan `rowIndex`).
- **Handler Messaging:**
  - `GET_WORKER_CONTEXT`: Memungkinkan tab pekerja mengambil data transaksi khusus miliknya saat halaman berpindah/reload.
  - `WORKER_TASK_COMPLETED`: Menghapus tab dari `activeWorkerTabs`, menutup tab pekerja, dan mengecek apakah masih ada pekerja aktif.
  - `GET_ACTIVE_WORKER_COUNT`: Memungkinkan Master Dispatcher mengecek sisa tab pekerja yang sedang memproses *Gate Out*.

### 2. `content.js` (Per-Tab Isolated State & Linear Flow)
- **`WorkerContextManager`:** Pembungkus state per-tab yang memanfaatkan `sessionStorage`. Menyimpan data transaksi (`rowData`), posisi sub-index detail (`subIdx`), dan flag pendaftaran/submit (`gateInSubmitted`, `pengisianSubmitted`, `gateOutSubmitted`) tanpa mempengaruhi tab pekerja lainnya.
- **Refactoring Page Handlers:**
  - **`ProcessBridgePageHandler`:** Membaca status penyelesaian transaksi khusus baris pekerja tersebut. Jika seluruh tahap (*Gate In*, *Pengisian*, *Gate Out*) selesai, sinyal `WORKER_TASK_COMPLETED` dikirimkan.
  - **`GateInPageHandler` & `PengisianPageHandler` & `GateOutPageHandler`:** Menggunakan `WorkerContextManager` untuk membaca/menulis state lokal tab, mencegah bentrokan state antar-tab.
- **`AutofillEngine.initAutofill`:**
  - Tab Pekerja menjalankan alur berdasarkan `WorkerContextManager.getRowData()`.
  - Master Tab memantau antrean data Excel. Jika data Excel habis (`idx >= excelData.length`), Master Dispatcher memeriksa `GET_ACTIVE_WORKER_COUNT`. Jika masih ada tab pekerja aktif, Master menyet `waitingForWorkers: true` dan tetap siaga hingga seluruh tab pekerja selesai.

---

## Ringkasan Perubahan File

```diff
background.js:
+ Set activeWorkerTabs Map for tracking tabId -> workerData
+ Added GET_WORKER_CONTEXT handler
+ Added WORKER_TASK_COMPLETED handler with auto tab cleanup and final completion check
+ Added GET_ACTIVE_WORKER_COUNT handler

content.js:
+ Added WorkerContextManager class using sessionStorage for isolated per-tab state
+ Refactored ProcessBridgePageHandler for independent worker tab navigation
+ Refactored GateInPageHandler, PengisianPageHandler, GateOutPageHandler with per-tab flags
+ Refactored AutofillEngine to initialize WorkerContextManager and handle Master Dispatcher waiting mode
```

---

## Panduan Pengujian Manual oleh User

1. **Uji Otomasi Multi-Tab:**
   - Buka popup Chrome extension dan unggah file Excel berisi beberapa data penyaluran (misalnya 3 atau 5 baris data).
   - Klik **Mulai Otomasi**.
   - **Ekspektasi:** Master tab akan membuka tab pekerja baru untuk setiap baris. Masing-masing tab pekerja akan melanjutkan proses *Gate In* -> *Pengisian* -> *Gate Out* secara mandiri tanpa menunggu di setiap gerbang/tahapan.

2. **Uji Penutupan Tab Pekerja & Master Completion:**
   - Amati saat tab pekerja mencapai tahap *Gate Out* dan mengklik **Submit**.
   - **Ekspektasi:** Tab pekerja tersebut akan menutup secara otomatis setelah submit selesai. Master tab akan terus mencatat dan menampilkan log di popup hingga tab pekerja terakhir selesai, baru kemudian menyet status otomasi menjadi *Selesai/Inactive*.
