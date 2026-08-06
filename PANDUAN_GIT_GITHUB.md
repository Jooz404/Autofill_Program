# PANDUAN LENGKAP PENGGUNAAN GIT & GITHUB FOR VERSION CONTROL
**Project Pertamina S&D Autofill Assistant**

Panduan ini disusun khusus untuk membantu Anda mengelola versi kode (*Version Control*) menggunakan **Git** dan **GitHub**. Dengan cara ini, Anda dapat menyimpan (*backup*) setiap titik perkembangan fitur yang berhasil tanpa perlu membuat salinan folder berformat `.zip`.

---

## 1. KONSEP DASAR (MENGAPA MEMAKAI GIT & GITHUB?)

- **File ZIP vs Git**:
  - **ZIP**: Membuat banyak folder terpisah (`Project_v1.zip`, `Project_v2_final.zip`, `Project_fix_bisa.zip`), memakan ruang penyimpanan, dan sulit melacak baris kode mana yang diubah.
  - **Git**: Hanya ada 1 folder project. Setiap perubahan disimpan sebagai **Commit** (snapshot/riwayat) yang sangat ringan dan dapat dikembalikan kapan saja dalam hitungan detik.
- **Git vs GitHub**:
  - **Git**: Alat pengontrol versi lokal di komputer Anda.
  - **GitHub**: Layanan cloud (internet) untuk menyimpan backup repository Git Anda secara aman.

---

## 2. PERSIAPAN AWAL (DILAKUKAN 1 KALI SAJA DI AWAL)

Buka PowerShell / Terminal di folder project:
`c:\Users\Josua\Downloads\Magang_Pertamina\Project Autofill RSD`

### Langkah 2.1: Inisialisasi Git di Folder Project
Ketik perintah berikut di terminal:
```bash
git init
```
*Perintah ini akan membuat repository Git lokal di dalam folder project Anda.*

### Langkah 2.2: Atur Identitas Pengguna Git (Jika Belum Ada)
```bash
git config --global user.name "NamaAnda"
git config --global user.email "emailanda@example.com"
```

### Langkah 2.3: Hubungkan ke Repository GitHub
1. Buka [GitHub.com](https://github.com/) dan buat **New Repository** (misalnya bernama `Project-Autofill-RSD`).
2. Jangan centang "Initialize with README".
3. Salin URL repository GitHub Anda (contoh: `https://github.com/username/Project-Autofill-RSD.git`).
4. Jalankan perintah ini di terminal komputer Anda:
```bash
git branch -M main
git remote add origin https://github.com/username/Project-Autofill-RSD.git
```

---

## 3. ALUR KERJA PEMBACKUPAN RUTIN (SETIAP FITUR BERHASIL)

Lakukan 3 langkah ini **setiap kali Anda menyelesaikan suatu fitur/perbaikan** yang sudah berjalan lancar:

### Langkah 3.1: Cek File yang Diubah
```bash
git status
```
*Akan menampilkan daftar file yang baru ditambahkan atau dimodifikasi (berwarna merah).*

### Langkah 3.2: Tandai Perubahan untuk Disimpan (Stage)
```bash
git add .
```
*(Titik `.` artinya menandai seluruh perubahan di folder project).*

### Langkah 3.3: Simpan Snapshot Lokal (Commit)
Berikan pesan komit yang jelas menggambarkan fitur yang baru selesai:
```bash
git commit -m "Memperbaiki matching plat nomor dan pendaftaran baru"
```

### Langkah 3.4: Upload Backup ke Cloud GitHub (Push)
```bash
git push -u origin main
```
*File project Anda kini aman tersimpan di cloud GitHub!*

---

## 4. CARA KEMBALI KE VERSI LAMA (RESTORE / REVERT KESALAHAN)

Ketika Anda membuat kesalahan saat koding dan ingin mengembalikan project ke kondisi sebelumnya, gunakan panduan berikut sesuai kondisi:

---

###  KONDISI A: Ingin membatalkan perubahan SEBELUM di-commit
*(Anda baru saja mengedit kode, terjadi error, dan belum menekan `git commit`)*

Batal edit seluruh file kembali ke kondisi commit terakhir:
```bash
git restore .
```
*Seketika seluruh file akan kembali persis seperti commit terakhir!*

---

### 🔍 KONDISI B: Ingin melihat daftar riwayat versi (History Commit)
Ketik perintah ini untuk melihat riwayat commit beserta ID (Hash 7 karakter):
```bash
git log --oneline
```
Contoh hasil output:
```text
a1b2c3d (HEAD -> main) Memperbaiki matching plat nomor dan pendaftaran baru
e5f6g7h Menambahkan dokumentasi proyek HTML dan MD
9i8j7k6 Inisialisasi awal proyek autofill RSD
```
*Perhatikan kode Hash 7 karakter di sebelah kiri (misal: `e5f6g7h`).*

---

###  KONDISI C: Ingin mengintip / mencoba versi lama tanpa merusak versi baru
Misalnya ingin melihat versi `e5f6g7h`:
```bash
git checkout e5f6g7h
```
*Kode project Anda akan mundur ke kondisi saat commit `e5f6g7h` dibuat.*

Untuk kembali lagi ke versi terbaru:
```bash
git checkout main
```

---

### ⏪ KONDISI D: Ingin membatalkan commit terakhir (Revert aman)
Misal commit terbaru ternyata ada bug dan ingin membuat commit baru yang membatalkannya secara aman:
```bash
git revert HEAD
```
Lalu push ke GitHub:
```bash
git push origin main
```

---

### ⚠️ KONDISI E: Ingin TOTAL MENGHAPUS perubahan baru & kembali keras ke versi lama (Hard Reset)
**PERHATIAN**: Perintah ini akan menghapus semua commit sesudahnya secara permanen.

Misalnya ingin reset keras ke versi `e5f6g7h`:
```bash
git reset --hard e5f6g7h
```
Jika ingin memaksa update di GitHub juga:
```bash
git push origin main --force
```

---

## 5. FITUR PERCABANGAN (BRANCHING) UNTUK UJI COBA FITUR BERISIKO

Jika ingin mencoba fitur eksperimental yang berisiko merusak sistem yang sudah berjalan:

1. **Buat Cabang Baru (Branch)**:
   ```bash
   git checkout -b fitur-eksperimen
   ```
2. **Koding & Simpan di Branch ini**:
   ```bash
   git add .
   git commit -m "Mencoba fitur baru X"
   ```
3. **Jika Fitur Berhasil ➔ Gabungkan ke Main**:
   ```bash
   git checkout main
   git merge fitur-eksperimen
   ```
4. **Jika Fitur Gagal / Rusak ➔ Tinggal Hapus Branch-nya**:
   ```bash
   git checkout main
   git branch -D fitur-eksperimen
   ```
   *Versi `main` Anda tetap aman 100% tanpa tersentuh error!*

---

## 💡 RINGKASAN PERINTAH CEPAT (CHETSHEET)

| Tujuan / Aksi | Perintah Git |
| :--- | :--- |
| **Status Perubahan** | `git status` |
| **Backup Rutin** | `git add .` <br> `git commit -m "Pesan"` <br> `git push origin main` |
| **Batal Edit Sebelum Commit** | `git restore .` |
| **Lihat Riwayat Versi** | `git log --oneline` |
| **Kembali ke Versi Lama (Permanen)** | `git reset --hard <HASH_COMMIT>` |
| **Buat Cabang Eksperimen** | `git checkout -b <nama_branch>` |

---
*Simpan file `PANDUAN_GIT_GITHUB.md` ini sebagai referensi utama alur kerja pengembangan proyek Anda!*
