# Implementation Plan: Mode Semi-Otomatis (Skip Pengisian / Gate In + Gate Out Saja)

Menambahkan fitur opsional **Mode Semi-Otomatis** di mana extension mengotomatisasi Pendaftaran Penyaluran, Gate In, dan Gate Out saja, sementara proses Pengisian diserahkan secara manual kepada pengguna di portal web.

## Proposed Changes

### UI & Configuration (`popup.html`, `popup.js`, `popup.css`)

#### [MODIFY] [popup.html](file:///c:/Users/Josua/Downloads/Magang_Pertamina/Project%20Autofill%20RSD/popup.html)
- Menambahkan pilihan Mode Operasi di Control Panel:
  - **Mode Penuh (Otomatis 100%)**: Gate In -> Pengisian -> Gate Out
  - **Mode Semi-Otomatis**: Gate In -> Pengisian Manual -> Gate Out Otomatis (`skipPengisian: true`)

#### [MODIFY] [popup.js](file:///c:/Users/Josua/Downloads/Magang_Pertamina/Project%20Autofill%20RSD/popup.js)
- Membaca dan menyimpan preferensi `skipPengisian` ke `chrome.storage.local`.

---

### Core Automation Logic (`content.js`)

#### [MODIFY] [content.js](file:///c:/Users/Josua/Downloads/Magang_Pertamina/Project%20Autofill%20RSD/content.js)
- Pada `ProcessBridgePageHandler.handle()`:
  - Membaca opsi `skipPengisian` dari `chrome.storage.local`.
  - Jika `skipPengisian === true` dan *Gate In* sudah completed:
    - Jika *Pengisian* **belum** completed -> Standby & berikan log pemberitahuan ke pengguna untuk mengisi Pengisian secara manual di portal.
    - Jika *Pengisian* **sudah** completed (setelah disubmit manual oleh pengguna) -> Otomatis mengarahkan ke **Gate Out** dan memproses *Gate Out* secara otomatis hingga selesai.

---

## Verification Plan

### Automated / Manual Verification
1. Pilih **Mode Semi-Otomatis** pada popup extension.
2. Jalankan **Mulai Autofill**.
3. Verifikasi bot mendaftarkan truk dan menyelesaikan **Gate In** secara otomatis.
4. Verifikasi bot **standby** setelah Gate In selesai dan tidak menekan modal Pengisian.
5. Isi detail Pengisian secara manual di portal dan tekan **Submit Pengisian**.
6. Verifikasi bot **langsung mengambil alih kembali** untuk masuk ke **Gate Out**, mengisi segel/waktu, dan menyelesaikan transaksi.
