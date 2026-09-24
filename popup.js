/**
 * Pertamina S&D Autofill Assistant - Popup Controller (OOP Architecture)
 */

// 1. Logger UI Component
class LoggerUI {
  constructor(terminalId, clearBtnId) {
    this.terminal = document.getElementById(terminalId);
    this.clearBtn = document.getElementById(clearBtnId);
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => this.clear());
    }
  }

  addLog(message, type = 'system') {
    if (!this.terminal) return;
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerText = `[${time}] ${message}`;
    this.terminal.appendChild(entry);
    this.terminal.scrollTop = this.terminal.scrollHeight;
  }

  clear() {
    if (!this.terminal) return;
    this.terminal.innerHTML = '';
    this.addLog('Log console dibersihkan.', 'system');
  }
}

// 2. Date Formatter Utility Class
class DateFormatter {
  static formatExcelDate(excelDate) {
    if (!excelDate) return "";
    console.log('[DEBUG formatExcelDate] tipe:', typeof excelDate, '| nilai:', excelDate, '| instanceof Date:', excelDate instanceof Date);
    const num = parseFloat(excelDate);

    if (!isNaN(num)) {
      const jsDate = new Date(Math.round((num - 25569) * 864e5));

      const yyyy = jsDate.getUTCFullYear();
      const mm = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(jsDate.getUTCDate()).padStart(2, '0');

      const hh = String(jsDate.getUTCHours()).padStart(2, '0');
      const min = String(jsDate.getUTCMinutes()).padStart(2, '0');
      const ss = String(jsDate.getUTCSeconds()).padStart(2, '0');

      return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
    } else {
      const str = excelDate.toString().trim();

      const ddMMyyyyRegex = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
      const yyyyMMddRegex = /^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;

      let match = str.match(ddMMyyyyRegex);
      if (match) {
        const dd = match[1].padStart(2, '0');
        const mm = match[2].padStart(2, '0');
        const yyyy = match[3];
        const hh = (match[4] || '00').padStart(2, '0');
        const min = (match[5] || '00').padStart(2, '0');
        const ss = (match[6] || '00').padStart(2, '0');
        return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
      }

      match = str.match(yyyyMMddRegex);
      if (match) {
        const yyyy = match[1];
        const mm = match[2].padStart(2, '0');
        const dd = match[3].padStart(2, '0');
        const hh = (match[4] || '00').padStart(2, '0');
        const min = (match[5] || '00').padStart(2, '0');
        const ss = (match[6] || '00').padStart(2, '0');
        return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
      }

      try {
        const hasTimezoneInfo = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(str);
        const isoLikeStr = /^\d{4}-\d{2}-\d{2}/.test(str) && !hasTimezoneInfo
          ? str.replace(' ', 'T') + 'Z'
          : str;
        const parsed = new Date(isoLikeStr);
        if (!isNaN(parsed.getTime())) {
          const yyyy = parsed.getUTCFullYear();
          const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(parsed.getUTCDate()).padStart(2, '0');
          const hh = String(parsed.getUTCHours()).padStart(2, '0');
          const min = String(parsed.getUTCMinutes()).padStart(2, '0');
          const ss = String(parsed.getUTCSeconds()).padStart(2, '0');
          return `${yyyy}/${mm}/${dd} ${hh}:${min}:${ss}`;
        }
      } catch (e) {
        // Ignore parsing exceptions
      }

      return str;
    }
  }
}

// 3. Tank Configuration Manager Class
class TankConfigManager {
  constructor(tankInputsMap, saveStatusId) {
    this.tankInputs = tankInputsMap;
    this.saveStatusEl = document.getElementById(saveStatusId);
    this.defaults = {
      'PERTALITE': '11',
      'PERTAMAX': '3',
      'BIOSOLAR B50_1': '15',
      'BIOSOLAR B50_2': '8',
      'PERTADEX': '17',
      'PERTAMAX TURBO': '19',
      'AVTUR': '6'
    };

    this.initAutoSave();
  }

  initAutoSave() {
    Object.values(this.tankInputs).forEach(input => {
      if (input) {
        input.addEventListener('input', () => this.saveTankSettings());
      }
    });
  }

  loadTankSettings() {
    chrome.storage.local.get(['tankConfigs'], (result) => {
      const configs = result.tankConfigs || {};
      Object.keys(this.tankInputs).forEach(key => {
        const val = configs[key] || this.defaults[key] || '';
        if (this.tankInputs[key]) {
          this.tankInputs[key].value = val;
        }
      });
    });
  }

  saveTankSettings() {
    const configs = {};
    Object.keys(this.tankInputs).forEach(key => {
      if (this.tankInputs[key]) {
        configs[key] = this.tankInputs[key].value.trim();
      }
    });

    chrome.storage.local.set({ tankConfigs: configs }, () => {
      if (this.saveStatusEl) {
        this.saveStatusEl.innerText = 'Tersimpan otomatis!';
        setTimeout(() => {
          this.saveStatusEl.innerText = 'Tersimpan otomatis';
        }, 1500);
      }
    });
  }
}

// 4. Excel Parser Class
class ExcelParser {
  constructor(logger, fileNameLabel, rowProgress, progressBar, btnStart) {
    this.logger = logger;
    this.fileNameLabel = fileNameLabel;
    this.rowProgress = rowProgress;
    this.progressBar = progressBar;
    this.btnStart = btnStart;
  }

  static allocateLOsToProducts(loList, produkList, excelVolume = 0) {
    if (!produkList || produkList.length === 0) {
      produkList = ['PERTALITE'];
    }
    if (!loList) loList = [];

    // Normalisasi volume dari Excel ke KL
    const normExcelKL = (vol) => {
      if (!vol || isNaN(vol) || vol <= 0) return 0;
      return vol > 500 ? vol / 1000 : vol;
    };
    const totalKLFromExcel = normExcelKL(excelVolume);

    const items = [];
    const totalLOs = loList.length;

    // Helper hitung volume KL per item: Utamakan volume Excel jika tersedia
    const getVol = (assignedLOs, totalProds = 1) => {
      if (totalKLFromExcel > 0) {
        if (totalLOs > 0 && assignedLOs && assignedLOs.length > 0) {
          return (assignedLOs.length / totalLOs) * totalKLFromExcel;
        } else {
          return totalKLFromExcel / totalProds;
        }
      }
      return (assignedLOs && assignedLOs.length > 0) ? assignedLOs.length * 8 : 8;
    };

    // Skenario 1: 1 Produk (atau 0 produk) -> Seluruh LO dimasukkan sekaligus ke 1 produk
    if (produkList.length === 1) {
      const prod = produkList[0];
      items.push({
        produk: prod,
        loList: loList,
        combinedLO: loList.join(', '),
        volume: getVol(loList, 1)
      });
      return items;
    }

    // Skenario 2: Jumlah Produk = Jumlah LO
    if (loList.length === produkList.length) {
      for (let i = 0; i < produkList.length; i++) {
        const assigned = [loList[i]];
        items.push({
          produk: produkList[i],
          loList: assigned,
          combinedLO: loList[i],
          volume: getVol(assigned, produkList.length)
        });
      }
      return items;
    }

    // Skenario 3: Jumlah LO > Jumlah Produk (misal 3 LO, 2 Produk)
    if (loList.length > produkList.length) {
      // Helper skor prioritas alokasi sisa LO:
      // Pertalite (100) > Biosolar/Solar (80) > Dexlite/Pertadex (60) > Pertamax (40) > Lainnya (10)
      const getPriorityScore = (pName) => {
        const u = (pName || '').toUpperCase();
        if (u.includes('PERTALITE')) return 100;
        if (u.includes('SOLAR') || u.includes('BIOSOLAR')) return 80;
        if (u.includes('DEXLITE') || u.includes('PERTADEX')) return 60;
        if (u.includes('PERTAMAX')) return 40;
        return 10;
      };

      const loCounts = new Array(produkList.length).fill(1);
      let remainingLOs = loList.length - produkList.length;

      // Urutkan indeks produk dari prioritas tertinggi ke terendah
      const indicesWithScore = produkList.map((p, idx) => ({
        idx,
        score: getPriorityScore(p)
      }));

      indicesWithScore.sort((a, b) => b.score - a.score);

      let targetIdxPointer = 0;
      while (remainingLOs > 0) {
        const idxToGive = indicesWithScore[targetIdxPointer % indicesWithScore.length].idx;
        loCounts[idxToGive]++;
        remainingLOs--;
        targetIdxPointer++;
      }

      let loPointer = 0;
      for (let i = 0; i < produkList.length; i++) {
        const count = loCounts[i];
        const assignedLOs = loList.slice(loPointer, loPointer + count);
        loPointer += count;

        items.push({
          produk: produkList[i],
          loList: assignedLOs,
          combinedLO: assignedLOs.join(', '),
          volume: getVol(assignedLOs, produkList.length)
        });
      }

      return items;
    }

    // Skenario 4: Jumlah LO < Jumlah Produk
    for (let i = 0; i < produkList.length; i++) {
      const assignedLOs = i < loList.length ? [loList[i]] : [];
      items.push({
        produk: produkList[i],
        loList: assignedLOs,
        combinedLO: assignedLOs.join(', '),
        volume: getVol(assignedLOs, produkList.length)
      });
    }

    return items;
  }

  parseFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (rows.length === 0) {
          this.logger.addLog('Error: File Excel kosong atau tidak terbaca.', 'error');
          return;
        }

        const parsedRows = rows.map((row, idx) => {
          // Helper pencari nilai kolom berbasis berbagai variasi nama header
          const findVal = (targets) => {
            const rowKeys = Object.keys(row);
            for (let target of targets) {
              const cleanTarget = target.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
              for (let k of rowKeys) {
                const cleanKey = k.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (cleanKey === cleanTarget && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                  return row[k];
                }
              }
            }
            return '';
          };

          let rawNopol = findVal(['No. Polisi', 'No Polisi', 'Nomor Polisi', 'Nopol', 'No.Polisi', 'Plat', 'NO. POLISI', 'NO POLISI']);
          let rawSupir = findVal(['Supir aktual', 'Supir', 'Nama Supir', 'Driver', 'AMT', 'SUPIR AKTUAL', 'NAMA DRIVER']);
          let rawVol = findVal(['Total volume[kL]', 'Volume', 'Total Volume', 'Qty', 'Jumlah', 'TOTAL VOLUME', 'VOL']);
          let rawProduct = findVal(['Produk', 'Nama Produk', 'Product', 'PRODUK']);
          let rawLO = findVal(['LO-KL', 'LO', 'LO KL', 'No LO', 'Nomor LO']);
          let rawSegel = findVal(['Segel', 'No Segel', 'Nomor Segel', 'SEGEL']);
          let rawDateShipment = findVal(['Tanggal Shipment', 'Tanggal', 'Gate In', 'Waktu Gate In', 'TANGGAL SHIPMENT']);
          let rawGateOut = findVal(['Gate Out (State 80)', 'Gate Out', 'Waktu Gate Out', 'GATE OUT']);

          // Fallback cerdas: Jika header nopol tidak cocok, cari sel apapun yang mengandung plat nomor valid (mis. B1234XYZ, DB1234XY, L1234XY)
          if (!rawNopol) {
            const plateRegex = /\b([A-Z]{1,2}\s*\d{1,4}\s*[A-Z]{1,3})\b/i;
            for (let k of Object.keys(row)) {
              const strVal = String(row[k] || '').trim();
              const match = strVal.match(plateRegex);
              if (match) {
                rawNopol = match[1].replace(/\s+/g, '').toUpperCase();
                break;
              }
            }
          }

          let cleanProduct = String(rawProduct || '').trim().replace(/[;\s]+$/, '').toUpperCase();
          let produkList = String(rawProduct || '')
            .split(';')
            .map(s => s.trim().toUpperCase())
            .filter(s => s.length > 0);

          if (produkList.length === 0 && cleanProduct) {
            produkList = [cleanProduct];
          }

          let loList = String(rawLO || '').split(',').map(s => s.trim()).filter(s => s.length > 0);
          let segelList = String(rawSegel || '').split(',').map(s => s.trim()).filter(s => s.length > 0);
          let cleanDateShipment = DateFormatter.formatExcelDate(rawDateShipment);
          let cleanGateOut = DateFormatter.formatExcelDate(rawGateOut);
          let parsedVol = parseFloat(rawVol || '0') || 0;
          let itemsList = ExcelParser.allocateLOsToProducts(loList, produkList, parsedVol);

          return {
            rowNum: idx + 1,
            nopol: String(rawNopol || '').replace(/\s+/g, '').toUpperCase().trim(),
            supir: String(rawSupir || '').trim(),
            volume: parsedVol,
            produk: produkList[0] || cleanProduct || '',
            produkList: produkList,
            gateInTime: cleanDateShipment,
            gateOutTime: cleanGateOut,
            loList: loList,
            itemsList: itemsList,
            segelList: segelList
          };
        }).filter(r => r.nopol !== "");

        if (parsedRows.length === 0) {
          this.logger.addLog('Error: Tidak ditemukan data plat nomor (No. Polisi) yang valid di Excel.', 'error');
          return;
        }

        // Secara otomatis membalikkan urutan agar pemrosesan selalu dimulai dari baris TERBAWAH Excel ke atas
        parsedRows.reverse();

        this.logger.addLog(`Berhasil membaca ${parsedRows.length} data transaksi dari Excel (Urutan: Baris Terbawah ke Atas).`, 'success');
        if (this.fileNameLabel) this.fileNameLabel.innerText = file.name;

        if (this.rowProgress) this.rowProgress.innerText = `0 / ${parsedRows.length}`;
        if (this.progressBar) this.progressBar.style.width = '0%';
        if (this.btnStart) this.btnStart.removeAttribute('disabled');

        chrome.storage.local.set({
          excelData: parsedRows,
          currentIndex: 0,
          completedCount: 0,
          autofillStage: 'CREATE_PENYALURAN'
        }, () => {
          this.logger.addLog('Data transaksi tersimpan pada storage ekstensi. Bot siap berjalan.', 'info');
        });

      } catch (err) {
        this.logger.addLog(`Error parsing file: ${err.message}`, 'error');
        console.error(err);
      }
    };

    reader.onerror = () => {
      this.logger.addLog('Error membaca file.', 'error');
    };

    reader.readAsArrayBuffer(file);
  }
}

// 5. Popup Application Manager (Main Controller)
class PopupAppManager {
  constructor() {
    this.logger = new LoggerUI('log-terminal', 'clear-log-btn');

    this.tankInputs = {
      'PERTALITE': document.getElementById('tank-pertalite'),
      'PERTAMAX': document.getElementById('tank-pertamax'),
      'BIOSOLAR B50_1': document.getElementById('tank-solar-1'),
      'BIOSOLAR B50_2': document.getElementById('tank-solar-2'),
      'PERTADEX': document.getElementById('tank-pertadex'),
      'PERTAMAX TURBO': document.getElementById('tank-turbo'),
      'AVTUR': document.getElementById('tank-avtur')
    };

    this.tankConfigManager = new TankConfigManager(this.tankInputs, 'save-status');

    this.excelFileInput = document.getElementById('excel-file');
    this.dropzone = document.getElementById('dropzone');
    this.fileNameLabel = document.getElementById('file-name-label');
    this.modeSelect = document.getElementById('mode-select');
    this.maxWorkersInput = document.getElementById('max-workers-input');

    this.statusText = document.getElementById('status-text');
    this.rowProgress = document.getElementById('row-progress');
    this.progressBar = document.getElementById('progress-bar');

    this.btnStart = document.getElementById('btn-start');
    this.btnStop = document.getElementById('btn-stop');
    this.btnReset = document.getElementById('btn-reset');

    this.excelParser = new ExcelParser(
      this.logger,
      this.fileNameLabel,
      this.rowProgress,
      this.progressBar,
      this.btnStart
    );

    this.parsedRows = [];
    this.isRunning = false;

    this.initTabNavigation();
    this.initModeSelector();
    this.initDropzoneAndFileInput();
    this.initAutomationControls();
    this.initMessageListener();
  }

  initModeSelector() {
    if (this.modeSelect) {
      chrome.storage.local.get(['skipPengisian'], (res) => {
        if (res.skipPengisian) {
          this.modeSelect.value = 'SKIP_PENGISIAN';
        } else {
          this.modeSelect.value = 'FULL';
        }
      });

      this.modeSelect.addEventListener('change', () => {
        const isSkip = this.modeSelect.value === 'SKIP_PENGISIAN';
        chrome.storage.local.set({ skipPengisian: isSkip }, () => {
          this.logger.addLog(`Mode alur kerja diubah ke: ${isSkip ? 'Semi-Otomatis (Gate In & Gate Out Saja)' : 'Otomatis Penuh'}`, 'info');
        });
      });
    }

    if (this.maxWorkersInput) {
      chrome.storage.local.get(['maxWorkerTabs'], (res) => {
        const val = res.maxWorkerTabs || 3;
        this.maxWorkersInput.value = val;
      });

      this.maxWorkersInput.addEventListener('change', () => {
        let val = parseInt(this.maxWorkersInput.value || '3', 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 10) val = 10;
        this.maxWorkersInput.value = val;

        chrome.storage.local.set({ maxWorkerTabs: val }, () => {
          this.logger.addLog(`Batas maksimal tab pekerja diubah ke: ${val} tab`, 'info');
        });
      });
    }
  }

  switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-btn');
    const tabSections = document.querySelectorAll('.tab-section');

    tabs.forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      }
    });

    tabSections.forEach(s => {
      s.classList.remove('active');
      if (s.id === 'tab-' + tabName) {
        s.classList.add('active');
      }
    });
  }

  initTabNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchTab(tab.dataset.tab);
      });
    });
  }

  initDropzoneAndFileInput() {
    if (this.dropzone) {
      this.dropzone.addEventListener('click', (e) => {
        if (e.target !== this.excelFileInput) {
          if (this.excelFileInput) {
            this.excelFileInput.value = '';
            this.excelFileInput.click();
          }
        }
      });

      this.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dropzone.style.borderColor = 'var(--pertamina-green)';
      });

      this.dropzone.addEventListener('dragleave', () => {
        this.dropzone.style.borderColor = 'rgba(0, 118, 229, 0.3)';
      });

      this.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dropzone.style.borderColor = 'rgba(0, 118, 229, 0.3)';
        const file = e.dataTransfer.files[0];
        if (file) {
          const lowerName = file.name.toLowerCase();
          if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.xlsm')) {
            this.excelParser.parseFile(file);
          } else {
            this.logger.addLog('Peringatan: Harap masukkan file berformat .xlsx, .xls, atau .xlsm.', 'warn');
          }
        }
      });
    }

    if (this.excelFileInput) {
      this.excelFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.excelParser.parseFile(file);
        }
      });
    }
  }

  initAutomationControls() {
    if (this.btnStart) {
      this.btnStart.addEventListener('click', () => this.startAutofill());
    }
    if (this.btnStop) {
      this.btnStop.addEventListener('click', () => this.stopAutofill());
    }
    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => this.resetAutofill());
    }
  }

  startAutofill() {
    chrome.storage.local.get(['excelData', 'currentIndex'], (res) => {
      if (!res.excelData || res.excelData.length === 0) {
        this.logger.addLog('Error: Tidak ada data transaksi untuk diproses.', 'error');
        return;
      }

      chrome.storage.local.set({ autofillActive: true }, () => {
        this.isRunning = true;
        this.updateControlUI(true, 'running', 'Autofill Aktif');
        this.logger.addLog('Bot diaktifkan. Silakan buka halaman portal https://sndone.patraniaga.com/ di browser Anda.', 'success');

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'start-autofill' }, (response) => {
              if (chrome.runtime.lastError) {
                this.logger.addLog('Koneksi ke tab aktif: Harap pastikan tab aktif berada di portal S&D sebelum klik Mulai.', 'warn');
              } else if (response) {
                this.logger.addLog('Mengirim sinyal mulai ke tab aktif.', 'info');
              }
            });
          }
        });
      });
    });
  }

  stopAutofill() {
    chrome.storage.local.set({ autofillActive: false }, () => {
      this.isRunning = false;
      this.updateControlUI(false, 'paused', 'Dihentikan');
      this.logger.addLog('Bot autofill dihentikan sementara oleh user.', 'warn');
    });
  }

  resetAutofill() {
    const isConfirmed = confirm('Apakah Anda yakin ingin me-reset semua data transaksi?\n\n⚠️ PERHATIAN: Pengaturan nomor tangki akan dikembalikan ke nilai bawaan (default).');
    if (!isConfirmed) return;

    chrome.storage.local.clear(() => {
      this.parsedRows = [];
      this.isRunning = false;
      if (this.fileNameLabel) this.fileNameLabel.innerText = 'Belum ada file terpilih';
      if (this.excelFileInput) this.excelFileInput.value = '';

      this.tankConfigManager.loadTankSettings();

      this.updateControlUI(false, 'idle', 'Idle');
      if (this.rowProgress) this.rowProgress.innerText = '0 / 0';
      if (this.progressBar) this.progressBar.style.width = '0%';
      if (this.btnStart) this.btnStart.setAttribute('disabled', 'true');

      this.logger.addLog('Semua data dan antrean transaksi dibersihkan.', 'system');
      this.logger.addLog('⚠️ PENGINGAT: Nomor tangki kembali ke DEFAULT. Harap periksa & sesuaikan di tab "Setting Tanki"!', 'warn');

      // Tampilkan alert pengingat tegas & alihkan ke tab Setting Tanki
      alert('⚠️ PENGINGAT PENTING - SETTING TANKI!\n\nData transaksi telah dibersihkan dan nomor tangki dikembalikan ke pengaturan DEFAULT.\n\nHarap periksa dan setel ulang "Setting Tanki" (Pertalite, Pertamax, Biosolar, dll.) pada tab Setting Tanki sebelum Anda memulai autofill baru!');
      this.switchTab('tanks');
    });
  }

  updateControlUI(running, badgeClass, badgeText) {
    const headerLogo = document.getElementById('app-header-logo');
    if (running) {
      if (this.btnStart) this.btnStart.style.display = 'none';
      if (this.btnStop) {
        this.btnStop.style.display = 'flex';
        this.btnStop.removeAttribute('disabled');
      }
      if (headerLogo) headerLogo.classList.add('driving');
    } else {
      if (this.btnStart) this.btnStart.style.display = 'flex';
      if (this.btnStop) this.btnStop.style.display = 'none';
      if (headerLogo) headerLogo.classList.remove('driving');
    }

    if (this.statusText) {
      this.statusText.className = `gauge-val status-badge ${badgeClass}`;
      this.statusText.innerText = badgeText;
    }
  }

  startStatusPolling() {
    setInterval(() => {
      chrome.storage.local.get(['autofillActive', 'excelData', 'currentIndex', 'completedCount', 'autofillStage'], (res) => {
        if (res.excelData && res.excelData.length > 0) {
          const total = res.excelData.length;
          const completed = Math.min(total, res.completedCount || 0);

          if (this.rowProgress) this.rowProgress.innerText = `${completed} / ${total}`;
          if (this.progressBar) this.progressBar.style.width = `${Math.min(100, (completed / total) * 100)}%`;

          if (res.autofillActive) {
            this.updateControlUI(true, 'running', `Running (${res.autofillStage})`);
            if (this.btnStart) this.btnStart.removeAttribute('disabled');
          } else if (completed === total && total > 0) {
            this.updateControlUI(false, 'completed', 'Completed');
          } else {
            this.updateControlUI(false, 'paused', 'Paused');
          }
        }
      });
    }, 1000);
  }

  initMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'LOG') {
        this.logger.addLog(message.text, message.logType || 'system');
      }
      sendResponse({ received: true });
    });
  }

  init() {
    this.tankConfigManager.loadTankSettings();
    this.startStatusPolling();

    chrome.storage.local.get(['excelData', 'currentIndex', 'autofillActive'], (res) => {
      if (res.excelData && res.excelData.length > 0) {
        this.logger.addLog(`Memuat ${res.excelData.length} data transaksi yang tersimpan.`, 'info');
        if (this.fileNameLabel) this.fileNameLabel.innerText = 'Data tersimpan di-load';
        if (this.btnStart) this.btnStart.removeAttribute('disabled');
        const idx = res.currentIndex || 0;
        const total = res.excelData.length;
        if (this.rowProgress) this.rowProgress.innerText = `${idx} / ${total}`;
        if (this.progressBar) this.progressBar.style.width = `${(idx / total) * 100}%`;
      }
    });
  }
}

// Instantiate and initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new PopupAppManager();
  app.init();
});