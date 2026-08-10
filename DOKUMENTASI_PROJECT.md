# DOKUMENTASI LENGKAP PERTAMINA S&D AUTOFILL ASSISTANT
**Sistem Otomatisasi Penginputan Data Penyaluran RSD Pertamina Patra Niaga**

---

## 1. PENDAHULUAN & GAMBARAN UMUM

**Pertamina S&D Autofill Assistant** adalah sebuah Browser Extension (Google Chrome & Microsoft Edge) berbasis **Manifest V3** yang dirancang untuk mengotomatisasi penginputan data transaksi Penyaluran Mobil Tangki pada portal web **S&D One (Supply & Distribution)** Pertamina Patra Niaga (`https://sndone.patraniaga.com/`).

### Fitur Utama:
- **Parsing Data Transaksi Excel (.xlsx)**: Membaca file data masal (seperti `snd1.xlsx` atau `snd2.xlsx`) yang berisi daftar nomor polisi, supir, volume, produk, tanggal shipment, gate out, daftar LO, dan nomor segel.
- **Arsitektur OOP & State Machine**: Menggunakan pemrograman berorientasi objek yang rapi dengan pembagian *Page Handlers* independen untuk setiap alur transaksi (Gate In, Pengisian, dan Gate Out).
- **Penganganan Elemen Dinamis (Select2 Helper)**: Mampu menangani dropdown dinamis ber-pencarian (jQuery Select2) dengan algoritma *fuzzy matching* (persis, parsial, nomor tangki `TK-xx`/`Txxx`, dan kata kunci).
- **Dukungan Dual-Tank In-Line Blending**: Otomatis mendeteksi produk campuran seperti Biosolar B50 (Solar + FAME) dan Dexlite, serta mengalokasikan nomor tangki secara terpisah.
- **Manajemen Tangki Otomatis**: Menyimpan konfigurasi nomor tangki harian ke penyimpanan lokal browser (`chrome.storage.local`).
- **Terminal Log Live & Status Gauge**: Menampilkan status *real-time* bot (Idle, Running, Paused, Completed), progress bar baris aktif, dan konsol log aktivitas di popup antarmuka.

---

## 2. STRUKTUR ARSITEKTUR & DESAIN SISTEM

Ekstensi ini dibangun menggunakan prinsip **Object-Oriented Programming (OOP)** untuk pemisahan tanggung jawab (*Separation of Concerns*) dan keterbacaan kode yang tinggi.

### 2.1 Diagram Alur Otomasi (State Machine)

```
[ Upload Excel (.xlsx) ] ──> [ Ekstrak & Simpan ke Storage ]
                                      │
                                      ▼
                      [ Buka Portal S&D One / List Penyaluran ]
                                      │
        ┌─────────────────────────────┴─────────────────────────────┐
        │                                                           │
        ▼                                                           ▼
[ Plat ditemukan (Draft) ]                                 [ Plat tidak ada di List ]
        │                                                           │
        ▼                                                           ▼
[ Buka Halaman Proses ]                                   [ Klik 'Add New Penyaluran' ]
        │                                                           │
        │                                                 [ Isi Moda, Tujuan, Nopol ]
        │                                                           │
        │                                                 [ Submit Pendaftaran Baru ]
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
 • Isi AMT Driver            • Isi Nomor LO                  • Isi Nomor Segel
 • Isi Waktu Gate In         • Pilih Produk & Dual Tank      • Isi Waktu Gate Out
 • Save Draft & Submit       • Set Bay & Meter Awal/Akhir    • Save Draft & Submit
       │                     • Hitung Kompartemen                   │
       │                     • Submit Detail & Final                │
       └──────────────────────────────┼──────────────────────────────┘
                                      │
                                      ▼
                     [ Lanjut ke Transaksi Berikutnya ]
```

---

## 3. STRUKTUR FILE PROYEK

```
Project Autofill RSD/
├── manifest.json                  # Definisi konfigurasi Extension (Manifest V3)
├── popup.html                     # Antarmuka Pengguna (Control Panel & Setting Tanki)
├── popup.css                      # Styling UI (Pertamina Corporate Theme & Dark Mode)
├── popup.js                       # Controller Popup UI (Excel Parser, Storage, UI Manager)
├── content.js                     # Content Automation Engine (OOP Automation Handlers)
├── xlsx.full.min.js               # Library JS lokal untuk parsing file Excel
├── icon.svg                       # Icon resmi aplikasi
├── Spesifikasi_Program_Autofill.docx # Dokumen referensi spesifikasi teknis
├── snd1.xlsx / snd2.xlsx          # Template/contoh file data transaksi Excel
└── DOKUMENTASI_PROJECT.html       # Dokumentasi interaktif berbasis web (HTML)
```

---

## 4. PENJELASAN DETAIL KOMPONEN & KODE PROGRAM

### 4.1 `manifest.json` (Konfigurasi Extension)
- **Manifest Version**: 3 (Sesuai standar keamanan browser terbaru).
- **Permissions**: `storage` (menyimpan antrean data & opsi tangki), `activeTab`, `tabs`.
- **Host Permissions**: Limited ke domain `https://sndone.patraniaga.com/*`.
- **Content Scripts**: `content.js` dieksekusi secara otomatis saat halaman portal dimuat (`document_end`).

### 4.2 Popup Interface (`popup.html` & `popup.css`)
Terdiri dari 2 Tab utama:
1. **Control Panel**:
   - Area Drag-and-Drop / Upload file `.xlsx`.
   - Indicator Gauge Status (`Idle`, `Running`, `Completed`, `Paused`).
   - Progress bar pengerjaan transaksi (contoh: `2 / 10`).
   - Tombol Kontrol: **Mulai Autofill**, **Hentikan**, dan **Reset Data**.
   - Live Activity Terminal Logs: Menampilkan pesan sistem, sukses, peringatan, dan error.
2. **Setting Tanki**:
   - Form konfigurasi nomor tangki aktif per produk (Pertalite, Pertamax, Biosolar B50 Tank 1 & 2, Dexlite Tank 1 & 2, Pertadex, Pertamax Turbo, Avtur).
   - Fitur **Tersimpan Otomatis** ke `chrome.storage.local`.

### 4.3 Popup Controller (`popup.js`)
Terdiri dari beberapa kelas berorientasi objek:
- **`LoggerUI`**: Mengelola tampilan log pada terminal antarmuka dengan timestamp waktu lokal.
- **`DateFormatter`**: Konverter serbaguna untuk mengubah tanggal serial Excel (misal `45509.32`), format string `DD/MM/YYYY`, `YYYY/MM/DD`, atau ISO ke format standar yang diterima portal: `YYYY/MM/DD HH:mm:ss`.
- **`TankConfigManager`**: Memuat dan menyimpan konfigurasi nomor tangki harian secara otomatis.
- **`ExcelParser`**: Membaca file binary Excel menggunakan `XLSX.read`, melakukan *cleaning* string, memisahkan array LO & Segel, lalu menyimpan array `excelData` ke storage browser.
- **`PopupAppManager`**: Kelas utama yang mengontrol event UI, siklus eksekusi bot, komunikasi antar-tab browser via messaging, dan *polling status* setiap 1 detik.

### 4.4 Content Automation Engine (`content.js`)
Merupakan inti dari fungsi otomasi web portal, dibangun dengan struktur kelas OOP:

1. **`Logger`**: Mengirim log dari content script ke UI Popup via `chrome.runtime.sendMessage`.
2. **`Select2Helper`**: Penangan elemen UI jQuery Select2 & Raw `<select>`.
   - Mengidentifikasi container `select2-container` secara fleksibel pada Select2 V4.
   - Mendukung pencocokan otomatis format nomor tangki (seperti `15` atau `8` yang secara otomatis dicocokkan ke `T015 - TK-15`, `T008 - TK-08`).
   - Algoritma pencarian bertingkat: *Exact Match* ➔ *Tank & Digit Matching (`TK-08` / `T008` / `TK-15` / `T015`)* ➔ *Includes Match* ➔ *Keyword Match* ➔ *Fallback*.
3. **`DOMUtils`**: Utility untuk ekstraksi NIP/ID supir dari format `Nama [ID]`, pemeriksaan visibilitas elemen, simulasi event klik MouseEvent asli, deteksi status transaksi (`Completed`/`Selesai`), dan navigasi antar halaman.
4. **`BasePageHandler`**: Kelas abstrak dasar untuk semua modul handler halaman.
5. **`ListPageHandler`**: Mengelola daftar transaksi penyaluran di halaman utama.
   - Menggunakan perbandingan plat nomor presisi (`DOMUtils.isRowMatchNopol`) yang mengabaikan perbedaan spasi/tanda hubung (contoh: `DB 8015 RK` match ke `DB8015RK`).
   - Hanya memproses atau melanjutkan transaksi yang plat nomornya **persis cocok** dengan target Excel.
   - Jika transaksi untuk plat nomor tersebut belum ada di tabel list (baik status *Complete* maupun *In Progress*), bot **tidak akan mengklik baris plat lain**, melainkan langsung menekan tombol **`+ Add New`** (`#btn-add-penyaluran`) untuk membuat pendaftaran penyaluran baru.
   - Jika transaksi untuk plat nomor tersebut sudah *Complete*, bot akan secara otomatis melompati (*skip*) baris Excel tersebut.
6. **`PenyaluranAddPageHandler`**: Otomatis mengisi form pendaftaran penyaluran baru (Moda: `TRUCK`, Tujuan: `SPBU`, Nopol).
7. **`ProcessBridgePageHandler`**: Menavigasi link sub-aktivitas berdasarkan tahapan transaksi (*Gate In*, *Pengisian*, *Gate Out*).
8. **`GateInPageHandler`**: Otomatis mengisi formulir MT Gate In (Driver AMT & Waktu Gate In), menangani perpindahan mode View ke Mode Edit (`#btn-editing`), menyimpan draf (`#btn-draft`), dan melakukan submit akhir (`#btn-completedEdit`).
9. **`PengisianPageHandler`**: Mengelola dialog modal pengisian multi-LO.
   - Menggunakan urutan pengisian terverifikasi: Nomor LO -> In-Line Blending Checkbox -> Tangki 1 (jeda AJAX 700ms) -> Tangki 2 (jeda AJAX 700ms) -> Pilih Produk Utama (terakhir) -> Volume & Kompartemen.
   - Mendeteksi produk *In-Line Blending* (Biosolar B50 / Dexlite) dan mengaktifkan checkbox dual-tank.
   - Menggunakan pencocokan kode produk presisi (seperti `A040900219` untuk Biosolar B50) melalui API jQuery Select2 `.val().trigger('change')` guna menghindari kesalahan pemilihan produk lain (seperti `BIOFAME` atau `SOLAR` biasa).
   - Memiliki proteksi `setProdukAndVerify` yang memantau listener AJAX portal dan secara otomatis memaksa ulang nilai produk jika terdeteksi perubahan tak terduga.
   - Mengisi Bay Number, No Meter, Volume (Liter), dan menghitung kompartemen (contoh: `1.2.3`).
   - Menyimpan detail modal secara otomatis dan mengeksekusi submit final pengisian.
10. **`GateOutPageHandler`**: Mengisi nomor segel (penggabungan list segel) dan Waktu Gate Out, menyimpan draf, serta mengeksekusi submit transaksi final hingga beralih ke baris Excel berikutnya.
11. **`AutofillEngine`**: Kelas orchestrator utama yang membaca URL path dan elemen DOM aktif untuk mengarahkan ke `PageHandler` yang sesuai.

---

## 5. FORMAT DATA EXCEL INPUT (`snd1.xlsx` / `snd2.xlsx`)

Agar aplikasi dapat membaca data dengan sukses, file Excel harus memiliki header kolom sebagai berikut (huruf besar/kecil tidak sensitif):

| Nama Kolom di Excel | Nama Property JSON | Deskripsi & Format Contoh |
| :--- | :--- | :--- |
| **No. Polisi** | `nopol` | Nomor plat mobil tangki (contoh: `B 9123 TEK`) |
| **Supir aktual** | `supir` | Nama & NIP supir (contoh: `301928 - BUDI SANTOSO` atau `BUDI [301928]`) |
| **Total volume[kL]** | `volume` | Volume total dalam kL (contoh: `16` atau `24`) |
| **Produk** | `produk` | Nama BBM (contoh: `PERTALITE`, `PERTAMAX`, `BIOSOLAR B50`, `DEXLITE`) |
| **Tanggal Shipment** | `gateInTime` | Waktu Gate In (contoh: `2026-08-05 08:30:00` atau serial Excel) |
| **Gate Out (State 80)** | `gateOutTime` | Waktu Gate Out (contoh: `2026-08-05 10:15:00`) |
| **LO-KL** | `loList` | Nomor LO. Jika lebih dari satu, pisahkan dengan koma (contoh: `802938102, 802938103`) |
| **Segel** | `segelList` | Nomor segel. Pisahkan dengan koma (contoh: `SGL-001, SGL-002, SGL-003`) |

---

## 6. PANDUAN INSTALASI EXTENSION DI BROWSER

### Untuk Microsoft Edge / Google Chrome:

1. buka browser Anda (Microsoft Edge atau Google Chrome).
2. Akses halaman manajemen Ekstensi:
   - **Microsoft Edge**: Ketik `edge://extensions/` di address bar.
   - **Google Chrome**: Ketik `chrome://extensions/` di address bar.
3. Aktifkan **Developer Mode** (Mode Pengembang) di pojok kiri bawah (Edge) atau pojok kanan atas (Chrome).
4. Klik tombol **Load unpacked** (Muat ekstensi yang tidak dikemas).
5. Cari dan pilih folder proyek:
   `C:\Users\Josua\Downloads\Magang_Pertamina\Project Autofill RSD`
6. Ekstensi **Pertamina S&D Autofill Assistant** akan muncul di daftar ekstensi aktif browser Anda.

---

## 7. PANDUAN PENGGUNAAN LANGKAH DEMI LANGKAH

1. **Buka Portal S&D One Pertamina**:
   Buka browser dan login ke portal `https://sndone.patraniaga.com/`.
2. **Buka Ekstensi Autofill**:
   Klik ikon puzzle / ekstensi di toolbar browser Anda dan pilih **S&D Autofill**.
3. **Pengaturan Nomor Tangki (Tab 'Setting Tanki')**:
   - Pindah ke tab **Setting Tanki**.
   - Masukkan nomor tangki aktif hari ini sesuai jadwal pengisian (Filling Shed).
   - Pengaturan akan tersimpan secara otomatis.
4. **Upload File Excel (Tab 'Control Panel')**:
   - Pindah ke tab **Control Panel**.
   - Drag & drop file Excel (misal: `snd1.xlsx`) ke area dropzone atau klik untuk memilih file.
   - Sistem akan menampilkan jumlah transaksi yang berhasil dibaca.
5. **Jalankan Otomatisasi**:
   - Klik tombol **Mulai Autofill**.
   - Bot akan mulai mengeksekusi penginputan data transaksi secara linier dari baris pertama hingga terakhir.
   - Log aktivitas dan progress bar dapat dipantau langsung dari antarmuka popup ekstensi.

---

## 8. FAQ & TROUBLESHOOTING

| Masalah / Kendala | Penyebab Umum | Solusi / Penanganan |
| :--- | :--- | :--- |
| **"Koneksi ke tab aktif: Harap pastikan tab aktif berada di portal S&D"** | Tab yang sedang terbuka di browser bukan halaman portal `sndone.patraniaga.com`. | Buka dan aktifkan tab browser yang menampilkan portal S&D One sebelum menekan tombol Mulai Autofill. |
| **Nomor Tangki tidak terpilih otomatis** | Format teks nomor tangki di portal berbeda atau belum di-set di tab Setting Tanki. | Pastikan nomor tangki telah diisi pada tab **Setting Tanki** di popup. |
| **Bot berhenti/pause di tengah jalan** | Terjadi masalah koneksi internet atau portal S&D sedang mengalami kendala server (Timeout). | Klik tombol **Mulai Autofill** kembali untuk melanjutkan dari transaksi terakhir tanpa kehilangan data. |
| **Ingin mengulang pengisian dari awal** | Data transaksi lama masih tersimpan di storage lokal ekstensi. | Klik tombol **Reset Data** di popup untuk membersihkan antrean transaksi. |

---
*Dokumentasi ini dibuat secara komprehensif untuk mendukung pemeliharaan, pengembangan, dan operasional penginputan data Penyaluran RSD Pertamina Patra Niaga.*
