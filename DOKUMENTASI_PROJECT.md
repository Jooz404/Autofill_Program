# KONTRAK & DOKUMENTASI LENGKAP PERTAMINA S&D AUTOFILL ASSISTANT
**Master Architectural Blueprint & Technical Specification Contract**

---

## 📜 1. KONTRAK & ATURAN EMAS PROYEK (PROJECT CONTRACT & GOLDEN RULES)

Dokumen ini adalah **Kontrak Acuan Utama (Master Contract)** untuk seluruh pengembang maupun sistem AI yang mengelola proyek **Pertamina S&D Autofill Assistant**. Seluruh modifikasi kode, penambahan fitur, dan perbaikan bug **WAJIB** mematuhi aturan emas di bawah ini untuk mencegah halusinasi arsitektur atau kekeliruan konsep.

### 🌟 5 Aturan Emas Arsitektur (Golden Rules):

1. **Standardized OOP & Page Handler Separation**:
   * Setiap alur halaman portal `S&D One` **harus** memiliki handler kelas independen yang mewarisi `BasePageHandler` di `content.js` (`ListPageHandler`, `GateInPageHandler`, `PengisianPageHandler`, `GateOutPageHandler`).
   * Dilarang mencampur logika spesifik halaman (misal: modal pengisian) ke dalam handler halaman lain (misal: Gate In).

2. **Strict Guardrail Pengisian Produk (Anti-Looping Modal)**:
   * Jumlah baris produk yang berada di draf web portal **dilarang keras** melebihi jumlah item produk dari alokasi Excel (`existingCount >= totalItems`).
   * Jika draf sudah lengkap (`existingCount >= totalItems`), bot **DILARANG KERAS** mengklik tombol `+ Add New` (`#btn-add-modal`).
   * Tombol Submit Final **wajib** dicari menggunakan fungsi `findFinalSubmitBtn()` yang mengecualikan tombol Add/Draft/Edit/Cancel. Dilarang menggunakan fallback selector generik seperti `button.btn-success` tanpa verifikasi ID/Teks.

3. **Prioritas Alokasi Produk Pertalite (Pertalite Priority Rule)**:
   * Dalam fungsi `ExcelParser.allocateLOsToProducts` di `popup.js`, pembagian sisa LO/volume dari Excel **WAJIB** mendahulukan produk **PERTALITE** (Skor Prioritas: 100) dibanding produk lain, meskipun sama-sama produk subsidi seperti Biosolar (Skor Prioritas: 80).
   * Contoh: Untuk 3 LO (24 KL) dengan produk Biosolar & Pertalite, Pertalite **harus** dialokasikan 2 LO (16 KL) dan Biosolar 1 LO (8 KL).

4. **Arsitektur Parallel Master-Worker Multi-Tab**:
   * Tab utama bertindak sebagai **Master Dispatcher** yang memindai list transaksi dan membuka maksimum **3 Tab Pekerja** di background.
   * Isolasi state untuk tab pekerja **harus** menggunakan `sessionStorage` melalui `WorkerContextManager` agar tidak saling menimpa data transaksi tab lain di `chrome.storage.local`.

5. **Network Resilience & Locking**:
   * Setiap aksi pemicu AJAX/Network request (seperti klik Simpan Modal atau Submit Final) **harus** mengunci polling interval bot menggunakan `window._autofillLockUntil` dan menandai elemen dengan dataset `autofillSaving`/`autofillClicked` untuk mencegah *double-click* akibat jeda jaringan.

---

## 🏗️ 2. GAMBARAN UMUM SISTEM

**Pertamina S&D Autofill Assistant** adalah Chrome Extension berbasis **Manifest V3** yang dirancang untuk mengotomatisasi penginputan data transaksi Penyaluran Mobil Tangki pada portal **S&D One (Supply & Distribution)** Pertamina Patra Niaga (`https://sndone.patraniaga.com/`).

### Diagram Alur Utama (State Machine):

```
[ Upload Excel (.xlsx) ] ──> [ Parse & Simpan ke chrome.storage.local ]
                                       │
                                       ▼
                       [ Buka Portal S&D One / List Penyaluran ]
                                       │
        ┌─────────────────────────────┴─────────────────────────────┐
        │ (Plat Ditemukan)                                          │ (Plat Belum Ada)
        ▼                                                           ▼
[ Buka Halaman Proses ]                                   [ Klik 'Add New Penyaluran' ]
        │                                                           │
        │                                                 [ Isi Moda, Tujuan, Nopol ]
        │                                                           │
        └─────────────────────────────┬─────────────────────────────┘
                                       │
                                       ▼
                           [ Process Bridge Stepper ]
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        │ (Stage 1)                    │ (Stage 2)                    │ (Stage 3)
        ▼                              ▼                              ▼
[ MT Gate In Form ]          [ Pengisian Form Modal ]       [ MT Gate Out Form ]
 • Isi Supir AMT             • Isi Nomor LO                  • Isi Nomor Segel
 • Isi Waktu Gate In         • Pertalite Priority Allocation • Isi Waktu Gate Out
 • Save Draft & Submit       • Set Bay & Meter Awal/Akhir    • Save Draft & Submit
        │                    • Guardrail Max Row Constraint         │
        │                    • Submit Detail & Final                │
        └──────────────────────────────┼──────────────────────────────┘
                                       │
                                       ▼
                      [ Lanjut ke Transaksi Berikutnya ]
```

---

## 📁 3. STRUKTUR FILE PROYEK

```
Project Autofill RSD/
├── manifest.json                  # Konfigurasi Extension V3 (Permissions & Content Scripts)
├── popup.html                     # Interface Control Panel & Setting Tangki
├── popup.css                      # Styling UI (Pertamina Corporate Theme)
├── popup.js                       # Logic Popup (ExcelParser, Priority Allocator, Tank Manager)
├── content.js                     # Content Automation Engine (OOP Page Handlers & DOM Utils)
├── xlsx.full.min.js               # Library JS lokal untuk parsing file Excel
├── icon.svg                       # Icon resmi aplikasi
├── DOKUMENTASI_PROJECT.md         # Dokumen Kontrak & Spesifikasi Teknis Utama
└── docs/                          # Folder dokumentasi perbaikan & walkthrough historis
```

---

## 📊 4. FORMAT DATA EXCEL INPUT (`snd1.xlsx` / `snd2.xlsx` / `eksekusi.xlsx`)

File Excel masal yang diunggah harus memuat kolom-kolom berikut:

| Nama Kolom Excel | Property JSON | Deskripsi & Format |
| :--- | :--- | :--- |
| **No. Polisi** | `nopol` | Plat nomor kendaraan (contoh: `B 9427 SFV`) |
| **Supir aktual** | `supir` | Nama & ID supir (contoh: `BUDI SANTOSO [301928]`) |
| **Total volume[kL]** | `volume` | Total volume kL (contoh: `16` atau `24`) |
| **Produk** | `produk` | Nama produk BBM (contoh: `PERTALITE;`, `BIOSOLAR B50`) |
| **Tanggal Shipment** | `gateInTime` | Waktu Gate In (`YYYY-MM-DD HH:mm:ss`) |
| **Gate Out (State 80)** | `gateOutTime` | Waktu Gate Out (`YYYY-MM-DD HH:mm:ss`) |
| **LO-KL** | `loList` | Nomor LO, dipisahkan koma jika > 1 (contoh: `8144192909, 8144245367`) |
| **Segel** | `segelList` | Nomor segel dipisahkan koma (contoh: `1002857, 1002858`) |

---

## ⚙️ 5. PANDUAN PENGGUNAAN & TROUBLESHOOTING

1. **Instalasi**:
   - Buka `chrome://extensions/` di Google Chrome / Edge.
   - Aktifkan **Developer Mode** ➔ Klik **Load unpacked** ➔ Pilih folder `Project Autofill RSD`.
2. **Pengoperasian**:
   - Buka portal `https://sndone.patraniaga.com/`.
   - Buka Popup Ekstensi ➔ Tab **Setting Tanki** (Atur nomor tangki aktif).
   - Tab **Control Panel** ➔ Unggah file Excel ➔ Klik **Mulai Autofill**.
3. **Reset Data**:
   - Jika ingin mengulang atau mengganti file Excel, klik tombol **Reset Data** di Popup Control Panel.
