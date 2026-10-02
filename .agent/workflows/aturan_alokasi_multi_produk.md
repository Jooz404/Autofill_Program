---
description: Aturan Vital Alokasi Multi-Produk dan Pemetaan Nomor LO
---

# ATURAN VITAL - ALOKASI MULTI-PRODUK & PEMETAAN LO (S&D ONE)

File ini berisi **Aturan Emas (Gold Rules)** untuk modul pengisian multi-produk pada program Autofill S&D ONE. **DILARANG MENGUBAH ATURAN INI** tanpa persetujuan ketat dari user.

---

## 1. Pemetaan LO & Produk (1-to-1 Excel Left-to-Right)
- Pada file Excel, kolom `Produk` (dipisah `;`) dan kolom `LO-KL` (dipisah `,`) dipasangkan **1-ke-1 secara ketat dari kiri ke kanan** sesuai urutan asli di Excel.
- **TIDAK BOLEH MEMUTAR / SORTING `produkList` BERDASARKAN PRIORITAS PRODUK.**
- Contoh:
  - Excel `Produk`: `PERTAMAX,BULK;PERTALITE;`
  - Excel `LO-KL`: `8144861616,8144781841,`
  - Hasil wajib:
    - Produk 1 (`PERTAMAX,BULK`) => Menerima LO 1 (`8144861616`)
    - Produk 2 (`PERTALITE`) => Menerima LO 2 (`8144781841`)

---

## 2. Alokasi Volume & Kompartemen (8 KL per Block)
- Truk Pertamina dialokasikan dalam satuan kompartemen (standar 8 KL per kompartemen).
- Jika ada lebih dari 1 produk:
  - Setiap produk harus menerima **minimal 1 kompartemen (8 KL)**.
  - Sisa kompartemen dialokasikan ke produk dengan skor prioritas lebih tinggi (`Pertalite` > `Solar/Biosolar` > `Dexlite` > `Pertamax`).
  - **TETAP PERTAHANKAN URUTAN ARRAY PRODUK ASLI DARI EXCEL**.

---

## 3. Penanganan Modal Pengisian (`content.js`)
- `itemsList` diproses satu per satu sesuai urutan hasil `allocateLOsToProducts()`.
- Produk pertama mengisi kompartemen `1` (atau `1.2` jika 16 KL).
- Produk kedua mengisi kompartemen kelanjutannya (`2` atau `3`).
