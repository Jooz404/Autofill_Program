# Walkthrough: Mode Semi-Otomatis (Gate In & Gate Out Saja)

Telah dilakukan penambahan fitur **Mode Semi-Otomatis** sesuai kebutuhan operasional sementara, di samping perbaikan utama pada arsitektur multi-tab.

---

## 1. Fitur Baru: Mode Semi-Otomatis (Gate In & Gate Out Saja)

### Pilihan Mode di UI Popup
Pada Extension Popup, terdapat dropdown **Mode Alur Kerja**:
- **Otomatis Penuh (Gate In -> Pengisian -> Gate Out):** Menjalankan seluruh tahapan secara otomatis 100%.
- **Semi-Otomatis (Gate In & Gate Out Saja):**
  1. **Gate In (Otomatis):** Mengisi AMT & Waktu Gate In, lalu menekan *Submit Gate In*.
  2. **Pengisian (Manual oleh Pengguna):** Bot **standby** dan membiarkan Anda mengisi modal detail Pengisian secara manual di portal web.
  3. **Gate Out (Otomatis):** Setelah Anda menekan *Submit Pengisian* secara manual, bot mendeteksi *Pengisian* telah selesai, lalu **secara otomatis mengambil alih kembali** untuk memproses *Gate Out* (mengisi segel & waktu *Gate Out*, *Submit Final*, dan menutup tab).

---

## 2. Ringkasan Perubahan Kode

```diff
popup.html:
+ Added Mode Selector Dropdown ("Otomatis Penuh" vs "Semi-Otomatis (Gate In & Gate Out Saja)")

popup.js:
+ Added initModeSelector() to store and restore skipPengisian configuration in chrome.storage.local

content.js:
+ Refactored ProcessBridgePageHandler to check skipPengisian
+ If skipPengisian is active, bot pauses after Gate In and waits for user's manual submit on Pengisian before automatically continuing to Gate Out
+ Added WorkerContextManager for isolated per-tab state
+ Refactored background.js activeWorkerTabs tracking & completion handlers
```

---

## 3. Panduan Pengujian Mode Semi-Otomatis

1. Buka Popup Extension, ubah **Mode Alur Kerja** menjadi: **Semi-Otomatis (Gate In & Gate Out Saja)**.
2. Upload file Excel dan klik **Mulai Autofill**.
3. Amati tab pekerja:
   - Bot mendaftarkan truk dan menyelesaikan **Gate In** secara otomatis.
   - Setelah Gate In selesai, bot akan memberikan log: `[Mode Semi-Otomatis] Gate In SELESAI. Standby menunggu pengisian Pengisian secara manual di portal...` dan **tidak akan mengklik modal Pengisian**.
4. Isi modal Pengisian di portal secara manual dan tekan tombol **Submit Pengisian**.
5. Segera setelah Submit Pengisian manual selesai, amati bot **secara otomatis mengambil alih kembali** membuka halaman **Gate Out**, mengisi segel/waktu, dan menyelesaikan transaksi.
