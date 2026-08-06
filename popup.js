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
      'DEXLITE_1': '15',
      'DEXLITE_2': '8',
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

  parseFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        if (rows.length === 0) {
          this.logger.addLog('Error: File Excel kosong atau tidak terbaca.', 'error');
          return;
        }

        const parsedRows = rows.map((row, idx) => {
          let rawProduct = (row['Produk'] || row['PRODUK'] || '').toString().trim();
          let cleanProduct = rawProduct.replace(/[;,\s]+$/, '').toUpperCase();

          let rawLO = (row['LO-KL'] || row['LO'] || '').toString().trim();
          let loList = rawLO.split(',').map(s => s.trim()).filter(s => s.length > 0);

          let rawSegel = (row['Segel'] || row['SEGEL'] || '').toString().trim();
          let segelList = rawSegel.split(',').map(s => s.trim()).filter(s => s.length > 0);

          let rawDateShipment = row['Tanggal Shipment'] || row['TANGGAL SHIPMENT'] || '';
          let cleanDateShipment = DateFormatter.formatExcelDate(rawDateShipment);

          let rawGateOut = row['Gate Out (State 80)'] || row['GATE OUT'] || '';
          let cleanGateOut = DateFormatter.formatExcelDate(rawGateOut);

          return {
            rowNum: idx + 1,
            nopol: (row['No. Polisi'] || row['NO. POLISI'] || '').toString().trim(),
            supir: (row['Supir aktual'] || row['SUPIR'] || '').toString().trim(),
            volume: parseFloat(row['Total volume[kL]'] || row['VOLUME'] || '0'),
            produk: cleanProduct,
            gateInTime: cleanDateShipment,
            gateOutTime: cleanGateOut,
            loList: loList,
            segelList: segelList
          };
        }).filter(r => r.nopol !== "");

        if (parsedRows.length === 0) {
          this.logger.addLog('Error: Tidak ditemukan data plat nomor (No. Polisi) yang valid di Excel.', 'error');
          return;
        }

        this.logger.addLog(`Berhasil membaca ${parsedRows.length} data transaksi dari Excel.`, 'success');
        if (this.fileNameLabel) this.fileNameLabel.innerText = file.name;

        if (this.rowProgress) this.rowProgress.innerText = `0 / ${parsedRows.length}`;
        if (this.progressBar) this.progressBar.style.width = '0%';
        if (this.btnStart) this.btnStart.removeAttribute('disabled');

        chrome.storage.local.set({
          excelData: parsedRows,
          currentIndex: 0,
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

    reader.readAsBinaryString(file);
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
      'DEXLITE_1': document.getElementById('tank-dexlite-1'),
      'DEXLITE_2': document.getElementById('tank-dexlite-2'),
      'PERTADEX': document.getElementById('tank-pertadex'),
      'PERTAMAX TURBO': document.getElementById('tank-turbo'),
      'AVTUR': document.getElementById('tank-avtur')
    };

    this.tankConfigManager = new TankConfigManager(this.tankInputs, 'save-status');

    this.excelFileInput = document.getElementById('excel-file');
    this.dropzone = document.getElementById('dropzone');
    this.fileNameLabel = document.getElementById('file-name-label');

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
    this.initDropzoneAndFileInput();
    this.initAutomationControls();
    this.initMessageListener();
  }

  initTabNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');
    const tabSections = document.querySelectorAll('.tab-section');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabSections.forEach(s => s.classList.remove('active'));

        tab.classList.add('active');
        const activeSection = document.getElementById('tab-' + tab.dataset.tab);
        if (activeSection) activeSection.classList.add('active');
      });
    });
  }

  initDropzoneAndFileInput() {
    if (this.dropzone) {
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
        if (file && file.name.endsWith('.xlsx')) {
          this.excelParser.parseFile(file);
        } else {
          this.logger.addLog('Peringatan: Harap masukkan file berformat .xlsx saja.', 'warn');
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
    });
  }

  updateControlUI(running, badgeClass, badgeText) {
    if (running) {
      if (this.btnStart) this.btnStart.style.display = 'none';
      if (this.btnStop) {
        this.btnStop.style.display = 'flex';
        this.btnStop.removeAttribute('disabled');
      }
    } else {
      if (this.btnStart) this.btnStart.style.display = 'flex';
      if (this.btnStop) this.btnStop.style.display = 'none';
    }

    if (this.statusText) {
      this.statusText.className = `gauge-val status-badge ${badgeClass}`;
      this.statusText.innerText = badgeText;
    }
  }

  startStatusPolling() {
    setInterval(() => {
      chrome.storage.local.get(['autofillActive', 'excelData', 'currentIndex', 'autofillStage'], (res) => {
        if (res.excelData && res.excelData.length > 0) {
          const idx = res.currentIndex || 0;
          const total = res.excelData.length;
          if (this.rowProgress) this.rowProgress.innerText = `${idx} / ${total}`;
          if (this.progressBar) this.progressBar.style.width = `${Math.min(100, (idx / total) * 100)}%`;

          if (res.autofillActive) {
            this.updateControlUI(true, 'running', `Running (${res.autofillStage})`);
            if (this.btnStart) this.btnStart.removeAttribute('disabled');
          } else if (idx === total && total > 0) {
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