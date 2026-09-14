/**
 * Pertamina S&D Autofill Assistant - Content Automation Engine (OOP Architecture)
 */

// Step Delay (in milliseconds)
const STEP_DELAY = 2000;

// 1. Logger Class
class Logger {
  static log(msg, type = 'info') {
    console.log(`[Autofill Bot] ${msg}`);
    chrome.runtime.sendMessage({ type: 'LOG', text: msg, logType: type }, () => {
      if (chrome.runtime.lastError) {
        // Popup might be closed, expected behavior
      }
    });
  }
}

// 1b. Worker Context Manager (Per-Tab Isolated Storage)
class WorkerContextManager {
  static context = null;

  static async init() {
    if (WorkerContextManager.context) return WorkerContextManager.context;

    const cached = sessionStorage.getItem('worker_context');
    if (cached) {
      try {
        WorkerContextManager.context = JSON.parse(cached);
        return WorkerContextManager.context;
      } catch (e) { }
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'GET_WORKER_CONTEXT' }, (res) => {
        if (chrome.runtime.lastError || !res || !res.isWorker || !res.workerData) {
          WorkerContextManager.context = { isWorker: false, tabId: null, rowData: null, rowIndex: null };
        } else {
          WorkerContextManager.context = {
            isWorker: true,
            tabId: res.tabId,
            rowData: res.workerData.rowData,
            rowIndex: res.workerData.rowIndex
          };
          sessionStorage.setItem('worker_context', JSON.stringify(WorkerContextManager.context));
        }
        resolve(WorkerContextManager.context);
      });
    });
  }

  static isWorker() {
    return !!(WorkerContextManager.context && WorkerContextManager.context.isWorker);
  }

  static getRowData() {
    return WorkerContextManager.context ? WorkerContextManager.context.rowData : null;
  }

  static getStage(defaultStage = 'CREATE_PENYALURAN') {
    return sessionStorage.getItem('worker_stage') || defaultStage;
  }

  static setStage(val) {
    sessionStorage.setItem('worker_stage', String(val));
  }

  static getSubIdx() {
    const val = sessionStorage.getItem('worker_subIdx');
    return val !== null ? parseInt(val, 10) : 0;
  }

  static setSubIdx(val) {
    sessionStorage.setItem('worker_subIdx', String(val));
  }

  static isSubmitted(key) {
    return sessionStorage.getItem(`worker_${key}`) === 'true';
  }

  static setSubmitted(key, val = true) {
    sessionStorage.setItem(`worker_${key}`, val ? 'true' : 'false');
  }
}

// 1c. Network & Blank Page Recovery Watchdog (Self-Healing System)
class NetworkWatchdog {
  static isReloading = false;

  static checkAndRecover() {
    if (NetworkWatchdog.isReloading) return true;

    const bodyText = (document.body?.innerText || '').toLowerCase().trim();
    const bodyChildrenCount = document.body?.children?.length || 0;
    const currentUrl = window.location.href;

    const isBlankPage = bodyChildrenCount === 0 || bodyText === '';
    const isServerError = [
      '504 gateway time-out',
      '504 gateway timeout',
      '500 internal server error',
      'service unavailable',
      'the page cannot be displayed',
      'bad gateway',
      'http error 50',
      'connection timed out'
    ].some(err => bodyText.includes(err));

    if (isBlankPage || isServerError) {
      NetworkWatchdog.isReloading = true;
      Logger.log(`[Network Watchdog] Halaman blank/server error terdeteksi (${isServerError ? 'Server Error' : 'Blank Body'}). Memulihkan navigasi dalam 3 detik...`, 'warn');

      setTimeout(() => {
        if (currentUrl.toLowerCase().includes('proseslist') && currentUrl.includes('cmd=search')) {
          const baseUrl = window.location.origin + '/ProsesList';
          Logger.log(`[Network Watchdog] Directing ke base URL bersih: ${baseUrl}`, 'info');
          window.location.href = baseUrl;
        } else {
          Logger.log('[Network Watchdog] Memuat ulang (reload) halaman...', 'info');
          window.location.reload();
        }
      }, 3000);

      return true;
    }

    return false;
  }

  static startStuckTimer(timeoutMs = 25000) {
    if (window._stuckTimerId) clearTimeout(window._stuckTimerId);

    window._stuckTimerId = setTimeout(() => {
      chrome.storage.local.get(['autofillActive'], (res) => {
        if (!res.autofillActive) return;

        Logger.log(`[Network Watchdog] Tab terdeteksi tidak merespons selama ${timeoutMs / 1000} detik. Memuat ulang halaman untuk pemulihan...`, 'warn');
        window.location.reload();
      });
    }, timeoutMs);
  }

  static resetStuckTimer() {
    if (window._stuckTimerId) {
      clearTimeout(window._stuckTimerId);
      window._stuckTimerId = null;
    }
  }
}

// 2. Select2 & Dropdown Interaction Helper Class
class Select2Helper {
  /**
   * Membuka dropdown Select2 untuk sebuah <select> dan memilih opsi
   * yang cocok dengan optionText (matching berbasis teks/angka tangki).
   *
   * @param {HTMLElement} select - elemen <select> asli (native, biasanya hidden)
   * @param {string} optionText  - teks/kode yang ingin dicocokkan (mis. "15", "TK-01")
   * @returns {Promise<void>}
   */
  static setSelectByValueOrText(select, optionText) {
    return new Promise((resolve, reject) => {
      if (!select) {
        return reject('Elemen select tidak valid');
      }

      if (!select.id) {
        select.id = 'autofill-sel-' + Math.floor(Math.random() * 100000);
      }

      const selectId = select.id;
      const targetClean = String(optionText).trim();
      const targetUpper = targetClean.toUpperCase();

      // 1. Coba pencocokan langsung pada elemen native <option> terlebih dahulu
      const nativeOpts = Array.from(select.options);
      let matchedOpt = nativeOpts.find(o => o.value === targetClean || o.text.trim().toUpperCase() === targetUpper);

      // Pencocokan presisi Biosolar B50 (A040900219)
      if (!matchedOpt && (targetUpper.includes('BIOSOLAR') || targetUpper.includes('219'))) {
        matchedOpt = nativeOpts.find(o => (o.value === 'A040900219' || o.text.toUpperCase().includes('A040900219') || o.text.toUpperCase().includes('BIOSOLAR B50')) && !o.text.toUpperCase().includes('BIOFAME'));
      }

      // Pencocokan berbasis angka tangki (TK-05, T005, TK-15, dst)
      if (!matchedOpt) {
        const numMatch = targetClean.match(/\d+/);
        if (numMatch) {
          const num = parseInt(numMatch[0], 10);
          const pad2 = num.toString().padStart(2, '0');
          const pad3 = num.toString().padStart(3, '0');
          matchedOpt = nativeOpts.find(o => {
            const txt = o.text.toUpperCase();
            return txt.includes(`TK-${pad2}`) || txt.includes(`TK-${num}`) || txt.includes(`T${pad3}`) || txt.includes(`T${pad2}`) || txt.includes(`TK ${pad2}`) || txt.includes(`TK ${num}`);
          });
        }
      }

      if (!matchedOpt) {
        matchedOpt = nativeOpts.find(o => o.text.toUpperCase().includes(targetUpper));
      }

      if (matchedOpt) {
        select.value = matchedOpt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));

        // Jika jQuery ($) tersedia
        if (typeof $ !== 'undefined' || typeof window.jQuery !== 'undefined') {
          try {
            const jq = window.$ || window.jQuery;
            jq(select).val(matchedOpt.value).trigger('change');
          } catch (e) { }
        }

        // Update teks visual container Select2
        let select2Container = select.nextElementSibling;
        if (!select2Container || !select2Container.className || !select2Container.className.includes('select2')) {
          select2Container = select.parentElement ? select.parentElement.querySelector('.select2-container, .select2') : null;
        }

        if (select2Container) {
          const renderedSpan = select2Container.querySelector('.select2-selection__rendered');
          if (renderedSpan) {
            renderedSpan.textContent = matchedOpt.text;
            renderedSpan.title = matchedOpt.text;
          }
        }
        return resolve(true);
      }

      // 2. Fallback Simulasi Klik DOM Select2 jika native matching belum resolve
      let select2Container = select.nextElementSibling;
      if (!select2Container || !select2Container.className || !select2Container.className.includes('select2')) {
        select2Container = select.parentElement
          ? select.parentElement.querySelector('.select2-container, .select2')
          : null;
      }
      if (!select2Container) {
        return reject('Container Select2 tidak ditemukan untuk #' + selectId);
      }

      const selectionBox =
        select2Container.querySelector('.select2-selection') ||
        select2Container.querySelector('.select2-selection__rendered') ||
        select2Container;

      // 2. Cek status buka HANYA pada container milik select ini (tidak query global)
      const isOpen = select2Container.classList.contains('select2-container--open');

      const openDropdown = () => {
        if (isOpen) return;
        ['mousedown', 'mouseup', 'click'].forEach(type => {
          selectionBox.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
        });
        if (typeof selectionBox.click === 'function') {
          selectionBox.click();
        }

        // Ketik ke input pencarian Select2 jika ada
        setTimeout(() => {
          const searchInput = document.querySelector('.select2-container--open .select2-search__field, input.select2-search__field');
          if (searchInput && optionText) {
            searchInput.value = optionText;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true }));
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
          }
        }, 100);
      };

      openDropdown();

      // 3. Cari ID hasil dropdown yang SPESIFIK untuk select ini.
      //    Pola dari DOM: <ul id="select2-<selectId>-results">
      //    Select2 kadang menambah suffix acak di beberapa versi/instance,
      //    jadi kita coba exact match dulu, baru fallback prefix match.
      const findResultsContainer = () => {
        const exact = document.getElementById(`select2-${selectId}-results`);
        if (exact) return exact;

        // fallback: cari ul yang id-nya mengandung selectId dan role=listbox
        const candidates = document.querySelectorAll(`ul[id*="${selectId}"][role="listbox"]`);
        return candidates.length ? candidates[0] : null;
      };

      const start = Date.now();
      const timeoutMs = 3000;
      const pollInterval = 150;

      const cleanUpAndResolve = () => resolve(true);
      const cleanUpAndReject = (msg) => reject(msg);

      const tryFind = () => {
        const resultsContainer = findResultsContainer();

        if (!resultsContainer) {
          if (Date.now() - start < timeoutMs) {
            return setTimeout(tryFind, pollInterval);
          }
          return cleanUpAndReject(`Dropdown results untuk #${selectId} tidak pernah muncul`);
        }

        // Scope pencarian opsi HANYA di dalam container milik select ini
        const options = resultsContainer.querySelectorAll('li[role="option"]');
        const targetClean = String(optionText).trim();

        const realOpts = Array.from(options).filter(o =>
          !o.className.includes('loading') &&
          !o.textContent.includes('Searching') &&
          o.textContent.trim() !== '' &&
          !o.textContent.includes('-- Tangki --') &&
          !o.textContent.includes('-- Produk --')
        );

        let target = null;

        // 1. Matching exact text dulu (kalau optionText memang full label)
        target = realOpts.find(o => o.textContent.trim().toUpperCase() === targetClean.toUpperCase()) || null;

        // 2. Matching spesifik produk (mis. A040900219 - BIOSOLAR B50 vs A040900014 - BIOFAME)
        if (!target) {
          const isBiosolarSearch = targetClean.toUpperCase().includes('BIOSOLAR') || targetClean.includes('219');
          if (isBiosolarSearch) {
            target = realOpts.find(opt => {
              const txtUpper = opt.textContent.toUpperCase();
              return (txtUpper.includes('BIOSOLAR') || txtUpper.includes('A040900219') || txtUpper.includes('B50')) && !txtUpper.includes('BIOFAME');
            }) || null;
          }
        }

        // 3. Matching berbasis angka tangki (TK-01, T001, dst)
        if (!target) {
          const numMatch = targetClean.match(/\d+/);
          if (numMatch) {
            const num = parseInt(numMatch[0], 10);
            const pad2 = num.toString().padStart(2, '0');
            const pad3 = num.toString().padStart(3, '0');

            target = realOpts.find(opt => {
              const txtUpper = opt.textContent.toUpperCase();
              return (
                txtUpper.includes(`TK-${pad2}`) || txtUpper.includes(`TK-${num}`) ||
                txtUpper.includes(`T${pad3}`) || txtUpper.includes(`T${pad2}`) ||
                txtUpper.includes(`TK ${pad2}`) || txtUpper.includes(`TK ${num}`)
              );
            }) || null;
          }
        }

        // 4. Fallback includes match (dengan memprioritaskan yang persis mengandung frasa kata)
        if (!target) {
          target = realOpts.find(opt => opt.textContent.toUpperCase().includes(targetClean.toUpperCase())) || null;
        }

        if (target) {
          ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
            target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
          });
          if (typeof target.click === 'function') {
            target.click();
          }

          // 4. Sync ke native <select> + trigger change,
          //    supaya listener lain di halaman (validasi, dsb) tetap jalan
          const matchedText = target.textContent.trim();
          const nativeOpt = Array.from(select.options).find(
            o => o.text.trim() === matchedText
          );
          if (nativeOpt) {
            select.value = nativeOpt.value;
          }
          select.dispatchEvent(new Event('change', { bubbles: true }));

          return cleanUpAndResolve();
        }

        if (Date.now() - start < timeoutMs) {
          return setTimeout(tryFind, pollInterval);
        }

        return cleanUpAndReject(`Opsi "${optionText}" tidak ditemukan di dropdown #${selectId}`);
      };

      // beri jeda kecil supaya dropdown sempat render setelah trigger klik
      setTimeout(tryFind, pollInterval);
    });
  }
}

// 3. DOM Utilities Class
class DOMUtils {
  static extractAmtId(rawSupir) {
    if (!rawSupir) return "";
    const str = String(rawSupir);
    const bracketIndex = str.indexOf('[');
    if (bracketIndex !== -1) {
      return str.substring(0, bracketIndex).trim();
    }
    return str.trim();
  }

  static resolveActualInputElement(param) {
    if (!param) return null;
    let element = typeof param === 'string' ? document.getElementById(param) : param;
    if (!element) return null;

    if (element.tagName === 'DIV' || element.id.startsWith('el_')) {
      const inner = element.querySelector('select, input, textarea');
      if (inner) return inner;
    }
    return element;
  }

  static isVisible(el) {
    if (!el) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && window.getComputedStyle(el).display !== 'none';
  }

  static clickElement(el) {
    if (!el) return;
    try { el.focus(); } catch (e) { }

    // Jika elemen adalah tombol (<button>), pastikan type="button" jika berada dalam form untuk mencegah submit form tidak disengaja
    if (el.tagName === 'BUTTON') {
      if (!el.hasAttribute('type') || el.getAttribute('type') === 'submit') {
        if (el.id.includes('modal') || el.id.includes('add') || el.classList.contains('ew-btn')) {
          el.setAttribute('type', 'button');
        }
      }
      if (typeof el.click === 'function') {
        el.click();
        return;
      }
    }

    const events = ['mousedown', 'mouseup', 'click'];
    events.forEach(evtName => {
      const evt = new MouseEvent(evtName, {
        bubbles: true,
        cancelable: true,
        view: window
      });
      el.dispatchEvent(evt);
    });
    if (typeof el.click === 'function') {
      el.click();
    }
  }

  static normalizeNopol(str) {
    if (!str) return "";
    return String(str).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  static getPageNopol() {
    // 1. Cek input atau elemen spesifik Nomor Polisi
    const nopolInput = document.getElementById('x_NomorPolisi') ||
      document.querySelector('input[id*="NomorPolisi"]') ||
      document.querySelector('select[id*="NomorPolisi"]') ||
      document.querySelector('.el_MobilTangki_NomorPolisi, .el_Penyaluran_NomorPolisi');

    if (nopolInput) {
      const val = nopolInput.value || nopolInput.textContent;
      const cleanVal = DOMUtils.normalizeNopol(val);
      if (cleanVal) return cleanVal;
    }

    // 2. Cek label / row yang memiliki teks "Nomor Polisi"
    const labels = Array.from(document.querySelectorAll('label, td, th, div, span'));
    for (let label of labels) {
      const txt = label.textContent.trim().toLowerCase();
      if (txt === 'nomor polisi' || txt === 'no. polisi' || txt === 'nopol') {
        const parent = label.closest('.row, tr, .form-group, div') || label.parentElement;
        if (parent) {
          const match = parent.textContent.match(/\b([A-Za-z]{1,2}\s*\d{1,4}\s*[A-Za-z]{1,3})\b/);
          if (match) {
            return DOMUtils.normalizeNopol(match[1]);
          }
        }
      }
    }

    // 3. Fallback scan regex pada seluruh body text untuk pola plat nomor
    const pageText = document.body?.innerText || '';
    const match = pageText.match(/\b([A-Z]{1,2}\s*\d{1,4}\s*[A-Z]{1,3})\b/);
    return match ? DOMUtils.normalizeNopol(match[1]) : null;
  }

  static isRowMatchNopol(rowEl, targetNopol) {
    const targetClean = DOMUtils.normalizeNopol(targetNopol);
    if (!targetClean) return false;

    const cells = rowEl.querySelectorAll('td');
    for (let cell of cells) {
      const cellClean = DOMUtils.normalizeNopol(cell.textContent);
      if (cellClean === targetClean) {
        return true;
      }
    }

    const rowClean = DOMUtils.normalizeNopol(rowEl.textContent);
    return rowClean.includes(targetClean);
  }

  static isActivityStatusCompleted() {
    const isExcluded = (el) => {
      return !!el.closest('.stepper, .step, .bs-stepper, .breadcrumb, .main-header, .main-sidebar, .navbar, header, nav, footer');
    };

    // 1. Prioritas Utama: Cari ID / elemen spesifik Status Aktivitas
    const statusEl = document.getElementById('x_StatusAktivitas') ||
      document.querySelector('[id*="StatusAktivitas"]') ||
      document.querySelector('.el_StatusAktivitas, .el_Aktivitas_StatusAktivitas');

    if (statusEl && DOMUtils.isVisible(statusEl) && !isExcluded(statusEl)) {
      const text = (statusEl.value || statusEl.textContent || '').trim().toLowerCase();
      if (text === 'completed' || text === 'selesai' || text.includes('✓ completed')) {
        return true;
      }
      if (text === 'waiting' || text === 'in progress' || text.includes('draft') || text.includes('proses')) {
        return false;
      }
    }

    // 2. Cari berdasarkan label "Status Aktivitas" secara presisi
    const labels = Array.from(document.querySelectorAll('label, td, th, div, span'));
    for (let label of labels) {
      if (isExcluded(label)) continue;
      const labelText = label.textContent.trim().toLowerCase();
      if (labelText === 'status aktivitas' || labelText === 'status aktivitas:') {
        const parent = label.closest('.row, tr, .form-group, div') || label.parentElement;
        if (parent) {
          const valueEls = Array.from(parent.querySelectorAll('.badge, .text-success, .bg-success, span, td, div'))
            .filter(e => e !== label && !e.contains(label) && DOMUtils.isVisible(e) && !isExcluded(e));

          for (let vEl of valueEls) {
            const vText = vEl.textContent.trim().toLowerCase();
            if (vText === 'completed' || vText === 'selesai' || vText.includes('✓ completed')) {
              return true;
            }
            if (vText === 'waiting' || vText === 'in progress' || vText.includes('draft') || vText.includes('proses')) {
              return false;
            }
          }
        }
      }
    }

    // Jika tidak ada elemen status yang terkonfirmasi "Completed", jangan berasumsi True
    return false;
  }

  static goToProsesPage() {
    Logger.log('Mengalihkan halaman kembali ke menu Proses...', 'info');
    const link = document.querySelector('.stepper a[href*="ProsesList"]') ||
      document.querySelector('a[href*="ProsesList"]') ||
      document.querySelector('a[href*="proses_list"]') ||
      Array.from(document.querySelectorAll('a')).find(a => a.getAttribute('href') && a.getAttribute('href').toLowerCase().includes('proseslist'));

    if (link) {
      Logger.log(`Mengklik tautan Proses: ${link.getAttribute('href') || link.href}`, 'info');
      link.click();
    } else {
      Logger.log('Link ProsesList tidak ditemukan di DOM, melakukan redirect URL langsung ke ProsesList...', 'warn');
      const fallbackUrl = document.querySelector('a[href*="ProsesList"]')?.href || '/ProsesList';
      window.location.href = fallbackUrl;
    }
  }
}

// 4. Base Page Handler Abstract Class
class BasePageHandler {
  constructor(stepDelay = STEP_DELAY) {
    this.stepDelay = stepDelay;
  }

  handle(rowData, stage, tankConfigs, compPos) {
    throw new Error('Method handle() harus diimplementasikan oleh subclass');
  }
}

// Handler Halaman 1: List Penyaluran Utama
class ListPageHandler extends BasePageHandler {
  handle(rowData, stage) {
    chrome.storage.local.get(['justCreated', 'gateOutSubmitted'], (res) => {
      if (res.justCreated) {
        Logger.log('Deteksi berhasil mendaftarkan Penyaluran baru. Pindah ke tahap pencarian...', 'success');
        chrome.storage.local.set({ autofillStage: 'CLICK_PROCESS_LINK', justCreated: false }, () => {
          this.handle(rowData, 'CLICK_PROCESS_LINK');
        });
        return;
      }

      if (res.gateOutSubmitted) {
        Logger.log('Deteksi transaksi sebelumnya telah selesai final (Gate Out diserahkan). Bergerak ke item berikutnya.', 'success');
        chrome.storage.local.get(['currentIndex'], (resIdx) => {
          const nextIdx = (resIdx.currentIndex || 0) + 1;
          chrome.storage.local.set({
            currentIndex: nextIdx,
            autofillStage: 'CREATE_PENYALURAN',
            gateOutSubmitted: false
          }, () => {
            window.location.reload();
          });
        });
        return;
      }

      Logger.log(`Memeriksa status transaksi di list untuk No Polisi target: ${rowData.nopol}...`, 'info');
      const rows = document.querySelectorAll('table tbody tr');
      let hasIncompleteRow = false;
      let hasCompleteRow = false;
      let incompleteLink = null;

      for (const r of rows) {
        if (DOMUtils.isRowMatchNopol(r, rowData.nopol)) {
          const rowTextLower = r.innerText.toLowerCase();
          const isComplete = rowTextLower.includes('complete') || rowTextLower.includes('selesai') || rowTextLower.includes('100%');
          if (isComplete) {
            hasCompleteRow = true;
          } else {
            const link = r.querySelector('[id*="LinkProses"] a, td.el_Penyaluran_LinkProses a, [id*="LinkAktivitas"] a, td[data-name="LinkAktivitas"] a, a[href*="proses"], a[href*="aktivitas"]');
            if (link) {
              hasIncompleteRow = true;
              incompleteLink = link;
            }
          }
        }
      }

      if (hasIncompleteRow && incompleteLink) {
        if (incompleteLink.dataset.autofillNavigating === 'true') {
          Logger.log(`Navigasi ke Halaman Proses sedang berlangsung untuk plat ${rowData.nopol}. Menunggu respon browser...`, 'info');
          return;
        }

        // Cek dulu apakah nopol ini sedang aktif dikerjakan oleh Tab Pekerja lain
        chrome.runtime.sendMessage({ action: 'GET_ACTIVE_WORKER_COUNT' }, (resCount) => {
          if (resCount && resCount.activePlates) {
            const normTarget = DOMUtils.normalizeNopol(rowData.nopol);
            const isAlreadyActive = resCount.activePlates.some(p => DOMUtils.normalizeNopol(p) === normTarget);
            if (isAlreadyActive) {
              Logger.log(`[Master Dispatcher] Plat ${rowData.nopol} saat ini sedang dikerjakan oleh Tab Pekerja lain. Melompati pembukaan tab duplikat...`, 'warn');
              chrome.storage.local.get(['currentIndex'], (resIdx) => {
                const nextIdx = (resIdx.currentIndex || 0) + 1;
                chrome.storage.local.set({
                  currentIndex: nextIdx,
                  autofillStage: 'CREATE_PENYALURAN'
                }, () => {
                  setTimeout(() => window.location.reload(), 1500);
                });
              });
              return;
            }
          }

          Logger.log(`Menemukan transaksi In Progress untuk plat ${rowData.nopol}. Mengirim ke Master Dispatcher...`, 'success');
          incompleteLink.dataset.autofillNavigating = 'true';
          incompleteLink.style.opacity = '0.5';

          // Master Dispatcher: Membuka tab pekerja baru di background (Maksimal 3 tab paralel)
          chrome.runtime.sendMessage({
            action: 'OPEN_WORKER_TAB',
            url: incompleteLink.href,
            rowIndex: rowData._index || 0,
            rowData: rowData
          }, (res) => {
            if (res && res.success) {
              Logger.log(`[Master Dispatcher] Berhasil membuka Tab Pekerja #${res.tabId} untuk plat ${rowData.nopol}. (Aktif: ${res.activeCount}/${res.max || 3})`, 'success');
              chrome.storage.local.get(['currentIndex'], (resIdx) => {
                const nextIdx = (resIdx.currentIndex || 0) + 1;
                chrome.storage.local.set({
                  currentIndex: nextIdx,
                  autofillStage: 'CREATE_PENYALURAN'
                }, () => {
                  setTimeout(() => window.location.reload(), 2500);
                });
              });
            } else {
              const now = Date.now();
              if (!window._lastQueueFullLog || (now - window._lastQueueFullLog > 10000)) {
                window._lastQueueFullLog = now;
                const reasonText = res?.reason === 'PLATE_ALREADY_PROCESSING' ? `Plat ${rowData.nopol} sudah aktif di tab pekerja` : `Antrean tab penuh (${res?.activeCount || 3}/${res?.max || 3})`;
                Logger.log(`[Master Dispatcher] Tab pekerja ditunda: ${reasonText}. Menunggu slot selesai...`, 'warn');
              }
              incompleteLink.dataset.autofillNavigating = 'false';
              incompleteLink.style.opacity = '1';
            }
          });
        });
      } else if (hasCompleteRow && !hasIncompleteRow) {
        Logger.log(`Transaksi untuk plat ${rowData.nopol} sudah berstatus Complete. Melompati baris Excel ini...`, 'success');
        window._autofillLockUntil = Date.now() + this.stepDelay + 5000;
        chrome.storage.local.get(['currentIndex'], (resIdx) => {
          const nextIdx = (resIdx.currentIndex || 0) + 1;
          chrome.storage.local.set({
            currentIndex: nextIdx,
            autofillStage: 'CREATE_PENYALURAN'
          }, () => {
            setTimeout(() => {
              window.location.reload();
            }, this.stepDelay);
          });
        });
      } else {
        // Plat nomor tidak ditemukan di list (baik Complete maupun In Progress) -> Wajib buat pendaftaran baru (+ Add New)
        const addBtn = document.getElementById('btn-add-penyaluran');
        if (addBtn) {
          Logger.log(`Plat ${rowData.nopol} tidak ditemukan di list. Menambahkan transaksi baru (+ Add New)...`, 'info');
          window._autofillLockUntil = Date.now() + this.stepDelay + 5000;
          chrome.storage.local.set({
            autofillStage: 'CREATE_PENYALURAN',
            pengisianSubmitted: false,
            gateInSubmitted: false,
            gateOutSubmitted: false,
            subIdx: 0
          }, () => {
            setTimeout(() => addBtn.click(), this.stepDelay);
          });
        } else {
          Logger.log('Tombol Add New (#btn-add-penyaluran) tidak ditemukan di list.', 'error');
        }
      }
    });
  }
}

// Handler Halaman 2: Tambah Penyaluran Baru
class PenyaluranAddPageHandler extends BasePageHandler {
  handle(rowData, stage) {
    Logger.log('Mengisi Formulir Pendaftaran Penyaluran...', 'info');

    let fillAttempts = 0;
    const fillInterval = setInterval(() => {
      fillAttempts++;

      const modaSelect = document.getElementById('x_IdModa');
      const modaVal = modaSelect?.value;
      const isModaReady = modaVal && modaVal !== "";

      if (modaSelect && !isModaReady) {
        Logger.log('Mencoba membuka dropdown Moda dan memilih Truck...', 'info');
        Select2Helper.setSelectByValueOrText(modaSelect, 'TRUCK')
          .then((res) => {
            if (res === true) Logger.log('Moda berhasil dipilih: TRUCK', 'success');
          })
          .catch(err => Logger.log('Gagal memilih Moda: ' + err, 'error'));
      }

      const tujuanLabel = document.getElementById('elh_Penyaluran_Tujuan');
      let tujuanInput = document.getElementById('x_Tujuan') || document.querySelector('[name*="Tujuan"]');
      if (tujuanLabel && !tujuanInput) {
        tujuanInput = tujuanLabel.closest('div')?.nextElementSibling?.querySelector('input, select');
      }
      const tujuanVal = tujuanInput?.value;
      const isTujuanReady = tujuanVal && tujuanVal !== "";

      if (tujuanInput && !isTujuanReady) {
        Logger.log('Mencoba mengisi pilihan Tujuan: SPBU...', 'info');
        if (tujuanInput.tagName === 'SELECT') {
          Select2Helper.setSelectByValueOrText(tujuanInput, "SPBU")
            .then((res) => {
              if (res === true) Logger.log('Tujuan berhasil dipilih: SPBU', 'success');
            })
            .catch(err => Logger.log('Gagal memilih Tujuan: ' + err, 'error'));
        } else {
          tujuanInput.value = "SPBU";
          tujuanInput.dispatchEvent(new Event('change'));
          Logger.log('Tujuan berhasil diisi: SPBU', 'success');
        }
      }

      const npInput = document.getElementById('x_NomorPolisi');
      const nopolVal = npInput?.value;
      const isNopolReady = nopolVal && nopolVal !== "";

      if (npInput && !isNopolReady && isModaReady) {
        npInput.value = rowData.nopol;
        npInput.dispatchEvent(new Event('change'));
        Logger.log(`Mengisi Nomor Polisi: ${rowData.nopol}`, 'success');
      }

      if ((isModaReady && isNopolReady && isTujuanReady) || fillAttempts > 15) {
        clearInterval(fillInterval);

        const submitBtn = document.getElementById('btn-action') || document.querySelector('button[type="submit"]');
        if (submitBtn) {
          Logger.log(`Isian Formulir Pendaftaran selesai. Menunggu jeda ${this.stepDelay / 1000} detik sebelum submit...`, 'info');
          setTimeout(() => {
            Logger.log('Mengklik Submit Pendaftaran Penyaluran...', 'success');
            chrome.storage.local.set({ justCreated: true }, () => {
              submitBtn.click();
            });
          }, this.stepDelay);
        } else {
          Logger.log('Tombol Submit (#btn-action) tidak ditemukan.', 'error');
        }
      }
    }, 500);
  }
}
// Handler Halaman 3: Halaman Jembatan / Stepper Proses
class ProcessBridgePageHandler extends BasePageHandler {
  handle(rowData, stage) {
    const isWorker = WorkerContextManager.isWorker();
    const isGateInSubmitted = isWorker ? WorkerContextManager.isSubmitted('gateInSubmitted') : false;
    const isPengisianSubmitted = isWorker ? WorkerContextManager.isSubmitted('pengisianSubmitted') : false;

    if (isGateInSubmitted) {
      Logger.log('Deteksi berhasil melakukan submit Gate In (Tab Context). Pindah ke tahap Pengisian...', 'success');
      WorkerContextManager.setSubmitted('gateInSubmitted', false);
      WorkerContextManager.setStage('GATE_IN_SUBMITTED');
      DOMUtils.goToProsesPage();
      return;
    }

    if (isPengisianSubmitted) {
      Logger.log('Deteksi berhasil melakukan submit Pengisian (Tab Context). Pindah ke tahap Gate Out...', 'success');
      WorkerContextManager.setSubmitted('pengisianSubmitted', false);
      WorkerContextManager.setStage('PENGISIAN_SUBMITTED');
      DOMUtils.goToProsesPage();
      return;
    }

    const tableRows = Array.from(document.querySelectorAll('table tbody tr'));

    // Helper membaca status aktivitas dari baris tabel
    const getStepStatus = (kw) => {
      const row = tableRows.find(r => {
        const text = r.textContent.toLowerCase();
        return text.includes(kw);
      });
      if (!row) return { found: false, isCompleted: false, isDraft: false, link: null };

      const rowText = row.textContent.toLowerCase();
      const isCompleted = rowText.includes('completed') || rowText.includes('selesai') || rowText.includes('100%');
      const isDraft = rowText.includes('in progress') || rowText.includes('draft') || rowText.includes('proses');

      // Mengambil semua link <a> yang memiliki href di dalam baris
      const links = Array.from(row.querySelectorAll('a[href]'));
      const isIgnoredLink = (href) => {
        return href.includes('aktivitasedit') ||
          href.includes('aktivitasview') ||
          href.includes('aktivitasdokumenlist') ||
          href.includes('dokumenlist') ||
          href.includes('dokumen') ||
          href.includes('showdetail') ||
          href.includes('showmaster');
      };

      // Prioritas 1: Link subaktivitas spesifik (seperti SubAktivitasDataMobilTangkiMTGateInEdit / subaktivitas / gatein)
      let link = links.find(a => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        return (href.includes('subaktivitas') || href.includes('gateinedit') || href.includes('mtgatein')) && !isIgnoredLink(href);
      });

      // Prioritas 2: Link tabel/proses (seperti aktivitastabel, aktivitaspenyaluran) yang BUKAN dokumen
      if (!link) {
        link = links.find(a => {
          const href = (a.getAttribute('href') || '').toLowerCase();
          return (href.includes('aktivitastabel') || href.includes('aktivitaspenyaluran')) && !isIgnoredLink(href);
        });
      }

      // Prioritas 3: Link edit/add/proses umum yang BUKAN dokumen
      if (!link) {
        link = links.find(a => {
          const href = (a.getAttribute('href') || '').toLowerCase();
          return !isIgnoredLink(href) && (href.includes('edit') || href.includes('add') || href.includes('detail') || href.includes('proses') || href.includes('tabel') || href.includes('aktivitas'));
        });
      }

      // Prioritas 4: Link pertama di baris yang bukan link kosong/anchor dummy (# / javascript) dan bukan link di-ignore
      if (!link) {
        link = links.find(a => {
          const href = (a.getAttribute('href') || '').toLowerCase();
          return href && href !== '#' && !href.startsWith('javascript:') && !isIgnoredLink(href);
        });
      }

      return { found: true, isCompleted, isDraft, link, rowText };
    };

    const gateInStatus = getStepStatus('gate in');
    const pengisianStatus = getStepStatus('pengisian');
    const gateOutStatus = getStepStatus('gate out');

    // Evaluasi stage yang paling tepat secara dinamis berdasarkan kondisi nyata di portal
    let targetStage = stage;
    let targetKw = 'gate in';

    chrome.storage.local.get(['skipPengisian'], (resConfig) => {
      const skipPengisian = resConfig.skipPengisian || false;

      if (gateInStatus.isCompleted) {
        if (!pengisianStatus.isCompleted) {
          if (skipPengisian) {
            Logger.log(`[Mode Semi-Otomatis] Gate In Nopol ${rowData.nopol} SELESAI. Standby menunggu pengisian Pengisian secara manual di portal...`, 'warn');
            return;
          }
          targetStage = 'GATE_IN_SUBMITTED';
          targetKw = 'pengisian';
        } else if (!gateOutStatus.isCompleted) {
          const hasGateOutTime = rowData && rowData.gateOutTime && String(rowData.gateOutTime).trim() !== "";
          if (!hasGateOutTime) {
            Logger.log(`[Gate Out Filter] Data Gate Out di Excel untuk plat ${rowData.nopol} kosong/belum ada. Melewati tahap Gate Out & menutup Tab Pekerja...`, 'warn');
            if (isWorker) {
              chrome.runtime.sendMessage({ action: 'WORKER_TASK_COMPLETED' });
            }
            return;
          }
          targetStage = 'PENGISIAN_SUBMITTED';
          targetKw = 'gate out';
        } else {
        Logger.log(`Seluruh aktivitas Penyaluran Nopol ${rowData.nopol} sudah berstatus COMPLETED.`, 'success');
        if (isWorker) {
          Logger.log(`[Worker Tab] Mengirim sinyal WORKER_TASK_COMPLETED untuk plat ${rowData.nopol}...`, 'success');
          chrome.runtime.sendMessage({ action: 'WORKER_TASK_COMPLETED' });
        } else {
          chrome.storage.local.get(['currentIndex'], (resIdx) => {
            const nextIdx = (resIdx.currentIndex || 0) + 1;
            chrome.storage.local.set({
              currentIndex: nextIdx,
              autofillStage: 'CREATE_PENYALURAN'
            }, () => {
              const penyaluranLink = document.querySelector('a[href*="PenyaluranList"]') || document.querySelector('a[href*="penyaluran_list"]');
              if (penyaluranLink) penyaluranLink.click();
              else window.location.href = '/PenyaluranList';
            });
          });
        }
        return;
      }
    } else {
      targetStage = 'CREATE_PENYALURAN';
      targetKw = 'gate in';
    }

    // Update autofillStage di storage jika terdeteksi maju
    if (targetStage !== stage) {
      Logger.log(`Deteksi status tabel: Meng-update stage otomatis "${stage}" -> "${targetStage}"`, 'info');
      if (isWorker) WorkerContextManager.setStage(targetStage);
      else chrome.storage.local.set({ autofillStage: targetStage });
    }

    // Cari link spesifik untuk targetKw
    const activeStatus = getStepStatus(targetKw);
    let linkToClick = activeStatus.link;

    if (!linkToClick) {
      const bodyLinks = Array.from(document.querySelectorAll('table tbody tr td a[href]'));
      // Prioritaskan link subaktivitas / gatein / aktivitastabel / aktivitaspenyaluran di seluruh tabel yang belum completed
      linkToClick = bodyLinks.find(l => {
        const href = (l.getAttribute('href') || '').toLowerCase();
        if (href.includes('dokumen') || href.includes('showmaster') || href.includes('showdetail')) return false;
        if (!href.includes('subaktivitas') && !href.includes('gatein') && !href.includes('aktivitastabel') && !href.includes('aktivitaspenyaluran')) return false;
        const row = l.closest('tr');
        if (!row) return false;
        const rowText = row.textContent.toLowerCase();
        return !rowText.includes('completed') && !rowText.includes('selesai') && !rowText.includes('100%');
      }) || bodyLinks.find(l => {
        const href = (l.getAttribute('href') || '').toLowerCase();
        if (href.includes('dokumen') || href.includes('showmaster') || href.includes('aktivitasedit') || href.includes('aktivitasview') || href.includes('showdetail')) return false;
        const row = l.closest('tr');
        if (!row) return false;
        const rowText = row.textContent.toLowerCase();
        return !rowText.includes('completed') && !rowText.includes('selesai') && !rowText.includes('100%');
      });
    }

    if (linkToClick) {
      if (linkToClick.dataset.autofillNavigating === 'true') {
        Logger.log(`Navigasi ke subaktivitas "${targetKw}" sedang berlangsung. Menunggu respon browser...`, 'info');
        return;
      }
      const linkText = linkToClick.textContent.trim();
      Logger.log(`Menemukan tautan aktivitas target "${targetKw}": "${linkText}". Mengklik dalam ${this.stepDelay / 1000} detik...`, 'info');

      linkToClick.dataset.autofillNavigating = 'true';
      linkToClick.style.opacity = '0.5';
      // Kunci polling 15 detik agar browser bebas memuat halaman pada jaringan lambat
      window._autofillLockUntil = Date.now() + 15000;

      setTimeout(() => {
        if (targetKw === 'pengisian') {
          if (isWorker) {
            sessionStorage.setItem('currentCompPos', '1');
            linkToClick.click();
          } else {
            chrome.storage.local.set({ currentCompPos: 1 }, () => {
              linkToClick.click();
            });
          }
        } else {
          linkToClick.click();
        }
      }, this.stepDelay);
    } else {
      Logger.log(`Tidak ada tautan aktif untuk step "${targetKw}". Menunggu siklus berikutnya...`, 'warn');
    }
    });
  }
}

// Handler Halaman 4: Formulir MT Gate In (FIXED)
class GateInPageHandler extends BasePageHandler {
  handle(rowData, stage) {
    chrome.storage.local.get(['gateInSubmitted', 'gateInSaved'], (resStorage) => {
      // ---------- helpers lokal ----------
      const findSubmitBtn = () => {
        return Array.from(document.querySelectorAll(
          '#btn-completed, #btn-completedEdit, button.btn-success'
        )).find(btn => {
          if (!DOMUtils.isVisible(btn)) return false;
          const id = (btn.id || '').toLowerCase();
          const text = (btn.textContent || '').trim().toLowerCase();
          return id.includes('completed') || text.includes('submit');
        });
      };

      const findSaveBtn = () => {
        return Array.from(document.querySelectorAll(
          '#btn-draft, #btn-save, button.btn-primary'
        )).find(btn => {
          if (!DOMUtils.isVisible(btn)) return false;
          const id = (btn.id || '').toLowerCase();
          const text = (btn.textContent || '').trim().toLowerCase();
          // Hindari tombol Edit / Cancel / Submit
          if (id.includes('editing') || id.includes('cancel') || id.includes('completed')) return false;
          if (text.includes('edit') || text.includes('cancel') || text.includes('submit')) return false;
          return id.includes('draft') || id.includes('save') || text.includes('save') || text.includes('simpan');
        });
      };

      const findEditBtn = () => {
        const btn = document.getElementById('btn-editing');
        if (btn && DOMUtils.isVisible(btn)) return btn;
        return Array.from(document.querySelectorAll('button.btn-primary, button.ew-btn'))
          .find(b => DOMUtils.isVisible(b) &&
            ((b.id || '').toLowerCase().includes('editing') ||
              (b.textContent || '').trim().toLowerCase().includes('edit')));
      };

      const getAmtInput = () => {
        return document.getElementById('x_AMT') ||
          document.getElementById('x_SubAktivitasDataMobilTangkiMTGateIn_AMT') ||
          document.getElementById('el_SubAktivitasDataMobilTangkiMTGateIn_AMT')?.querySelector('input, select') ||
          document.querySelector('input[id*="AMT"], select[id*="AMT"], input[name*="AMT"]');
      };

      const getWaktuInput = () => {
        return document.getElementById('x_WaktuGateIn') ||
          document.getElementById('x_SubAktivitasDataMobilTangkiMTGateIn_WaktuGateIn') ||
          document.getElementById('el_SubAktivitasDataMobilTangkiMTGateIn_WaktuGateIn')?.querySelector('input') ||
          document.querySelector('input[id*="WaktuGateIn"], input[name*="WaktuGateIn"], .tempus-dominus-input');
      };

      const clickSubmitAndFinish = (submitBtn) => {
        Logger.log(`Tombol Submit (#${submitBtn.id || 'unknown'}) terdeteksi. Mengklik dalam ${this.stepDelay / 1000}s...`, 'success');
        setTimeout(() => {
          if (WorkerContextManager.isWorker()) {
            WorkerContextManager.setSubmitted('gateInSubmitted', true);
            DOMUtils.clickElement(submitBtn);
            setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay + 1000);
          } else {
            chrome.storage.local.set({ gateInSubmitted: true, gateInSaved: false }, () => {
              DOMUtils.clickElement(submitBtn);
              setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay + 1000);
            });
          }
        }, this.stepDelay);
      };

      // ---------- 1. Status sudah Completed / sudah pernah submit ----------
      const isWorker = WorkerContextManager.isWorker();
      const isGateInDone = isWorker ? WorkerContextManager.isSubmitted('gateInSubmitted') : resStorage.gateInSubmitted;

      if (isGateInDone || DOMUtils.isActivityStatusCompleted()) {
        Logger.log('Aktivitas Gate In terdeteksi COMPLETED / sudah disubmit. Kembali ke menu Proses...', 'success');
        if (isWorker) {
          WorkerContextManager.setSubmitted('gateInSubmitted', true);
          WorkerContextManager.setStage('GATE_IN_SUBMITTED');
        } else {
          chrome.storage.local.set({
            autofillStage: 'GATE_IN_SUBMITTED',
            gateInSubmitted: false,
            gateInSaved: false
          });
        }
        setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay);
        return;
      }

      // ---------- 2. Submit sudah visible → langsung klik ----------
      const immediateSubmit = findSubmitBtn();
      if (immediateSubmit) {
        // Pastikan data sudah terisi sebelum submit (kalau masih kosong, isi dulu)
        const amtInput = getAmtInput();
        const waktuInput = getWaktuInput();
        const cleanSupir = DOMUtils.extractAmtId(rowData.supir);

        let needFill = false;
        if (amtInput && (!amtInput.value || amtInput.value.trim() === '')) {
          needFill = true;
          if (amtInput.tagName === 'SELECT') {
            Select2Helper.setSelectByValueOrText(amtInput, cleanSupir)
              .then(() => Logger.log(`AMT dipilih: ${cleanSupir}`, 'success'))
              .catch(err => Logger.log('Gagal pilih AMT: ' + err, 'error'));
          } else {
            amtInput.value = cleanSupir;
            amtInput.dispatchEvent(new Event('change', { bubbles: true }));
            Logger.log(`Mengisi AMT: ${cleanSupir}`, 'info');
          }
        }
        if (waktuInput && (!waktuInput.value || waktuInput.value.trim() === '')) {
          needFill = true;
          waktuInput.value = rowData.gateInTime;
          waktuInput.dispatchEvent(new Event('change', { bubbles: true }));
          Logger.log(`Mengisi Waktu Gate In: ${rowData.gateInTime}`, 'info');
        }

        if (needFill) {
          // Tunggu sebentar agar value settle, lalu submit
          setTimeout(() => {
            const btn = findSubmitBtn();
            if (btn) clickSubmitAndFinish(btn);
            else Logger.log('Submit hilang setelah isi form. Akan dicoba ulang di cycle berikutnya.', 'warn');
          }, 800);
        } else {
          clickSubmitAndFinish(immediateSubmit);
        }
        return;
      }

      // ---------- 3. Ada tombol Edit → klik dulu untuk masuk mode editing ----------
      const editBtn = findEditBtn();
      if (editBtn && !findSaveBtn()) {
        Logger.log('Mode view terdeteksi. Mengklik tombol Edit untuk membuka mode pengisian...', 'info');
        setTimeout(() => {
          DOMUtils.clickElement(editBtn);
          // Setelah Edit, page biasanya re-render. Content script akan jalan lagi.
          // Tandai supaya cycle berikutnya fokus ke Save/Submit.
          chrome.storage.local.set({ gateInSaved: false });
        }, this.stepDelay);
        return;
      }

      // ---------- 4. Isi form + Save, lalu tunggu Submit ----------
      // Kunci siklus polling 1.5 detik selama proses ini berjalan (bisa 15-20 detik),
      // supaya initAutofill() tidak masuk lagi ke handler ini saat masih di tengah proses.
      window._autofillLockUntil = Date.now() + 40000;

      Logger.log('Mengisi data MT Gate In...', 'info');

      const amtInput = getAmtInput();
      const waktuInput = getWaktuInput();
      const cleanSupir = DOMUtils.extractAmtId(rowData.supir);

      if (amtInput) {
        if (amtInput.tagName === 'SELECT') {
          Select2Helper.setSelectByValueOrText(amtInput, cleanSupir)
            .then((res) => {
              if (res === true) Logger.log(`AMT berhasil dipilih: ${cleanSupir}`, 'success');
            })
            .catch(err => Logger.log('Gagal memilih AMT: ' + err, 'error'));
        } else {
          if (!amtInput.value || amtInput.value.trim() === '' || !amtInput.value.includes(cleanSupir.split(' ')[0])) {
            amtInput.value = cleanSupir;
            amtInput.dispatchEvent(new Event('change', { bubbles: true }));
            Logger.log(`Mengisi AMT: ${cleanSupir}`, 'info');
          }
        }
      } else {
        Logger.log('Input AMT tidak ditemukan!', 'error');
      }

      if (waktuInput) {
        if (!waktuInput.value || waktuInput.value.trim() === '') {
          waktuInput.value = rowData.gateInTime;
          waktuInput.dispatchEvent(new Event('change', { bubbles: true }));
          Logger.log(`Mengisi Waktu Gate In: ${rowData.gateInTime}`, 'info');
        }
      } else {
        Logger.log('Input Waktu Gate In tidak ditemukan!', 'error');
      }

      // Polling: tunggu field terisi + tombol Save muncul (max ~15 detik)
      let attempts = 0;
      const maxAttempts = 30; // 30 x 500ms = 15s

      const fillAndSaveInterval = setInterval(() => {
        attempts++;

        const amtVal = getAmtInput()?.value;
        const waktuVal = getWaktuInput()?.value;
        const fieldsReady = amtVal && waktuVal && amtVal.trim() !== '' && waktuVal.trim() !== '';

        // Submit bisa muncul kapan saja (misalnya setelah Edit)
        const submitNow = findSubmitBtn();
        if (submitNow) {
          clearInterval(fillAndSaveInterval);
          clickSubmitAndFinish(submitNow);
          return;
        }

        if (!fieldsReady) {
          if (attempts >= maxAttempts) {
            clearInterval(fillAndSaveInterval);
            Logger.log(`Timeout: field belum siap. AMT="${amtVal || 'KOSONG'}", Waktu="${waktuVal || 'KOSONG'}"`, 'error');
          }
          return;
        }

        const saveBtn = findSaveBtn();
        if (!saveBtn) {
          // Mungkin masih loading tombol, atau masih di mode view
          if (attempts >= maxAttempts) {
            clearInterval(fillAndSaveInterval);
            // Coba Edit sekali lagi sebagai fallback
            const editFallback = findEditBtn();
            if (editFallback) {
              Logger.log('Save tidak muncul. Mencoba klik Edit sebagai fallback...', 'warn');
              DOMUtils.clickElement(editFallback);
            } else {
              Logger.log('Tombol Save (#btn-draft) dan Edit tidak ditemukan setelah 15 detik.', 'error');
            }
          }
          return;
        }

        // Field siap + Save terlihat → klik Save
        clearInterval(fillAndSaveInterval);
        Logger.log(`Isian siap. Mengklik Save (#${saveBtn.id}) dalam ${this.stepDelay / 1000}s...`, 'info');

        setTimeout(() => {
          chrome.storage.local.set({ gateInSaved: true }, () => {
            DOMUtils.clickElement(saveBtn);
            Logger.log('Save diklik. Menunggu tombol Submit muncul...', 'info');

            // Polling Submit setelah Save (max ~20 detik)
            let waitAttempts = 0;
            const waitSubmit = setInterval(() => {
              waitAttempts++;

              // Cek status Completed (kadang langsung selesai setelah Save di beberapa flow)
              if (DOMUtils.isActivityStatusCompleted()) {
                clearInterval(waitSubmit);
                Logger.log('Status berubah Completed setelah Save. Lanjut ke Proses...', 'success');
                chrome.storage.local.set({
                  autofillStage: 'GATE_IN_SUBMITTED',
                  gateInSubmitted: true,
                  gateInSaved: false
                }, () => {
                  setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay);
                });
                return;
              }

              const submitBtn = findSubmitBtn();
              if (submitBtn) {
                clearInterval(waitSubmit);
                clickSubmitAndFinish(submitBtn);
                return;
              }

              if (waitAttempts > 40) { // ~20 detik
                clearInterval(waitSubmit);
                Logger.log('Timeout menunggu Submit setelah Save. Akan dicoba di cycle berikutnya (gateInSaved=true).', 'warn');
                // Jangan clear gateInSaved — cycle berikutnya akan prioritaskan Submit
              }
            }, 500);
          });
        }, this.stepDelay);
      }, 500);
    });
  }
}

// Handler Halaman 5: Formulir Pengisian (Multi-baris detail dengan Modal Tambah)
class PengisianPageHandler extends BasePageHandler {
  handle(rowData, stage, tankConfigs, compPos) {
    const isWorker = WorkerContextManager.isWorker();
    const isPengisianDone = isWorker ? WorkerContextManager.isSubmitted('pengisianSubmitted') : false;

    chrome.storage.local.get(['pengisianSubmitted'], (resStorage) => {
      // Isolisasi state: Tab Pekerja HANYA membaca `isPengisianDone` dari sessionStorage pekerja, bukan global chrome.storage
      const isSubmittedForThisContext = isWorker ? isPengisianDone : (resStorage.pengisianSubmitted || false);

      if (isSubmittedForThisContext) {
        Logger.log('Aktivitas Pengisian terdeteksi telah disubmit/COMPLETED. Mengarahkan kembali ke menu Proses...', 'success');
        if (isWorker) {
          WorkerContextManager.setSubmitted('pengisianSubmitted', true);
          WorkerContextManager.setStage('PENGISIAN_SUBMITTED');
        } else {
          chrome.storage.local.set({ autofillStage: 'PENGISIAN_SUBMITTED', pengisianSubmitted: false });
        }
        setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay);
        return;
      }

      // Cek 0: Jika modal konfirmasi submit (#confirmBtn) terdeteksi terbuka
      const confirmBtn = document.getElementById('confirmBtn') ||
        document.querySelector('.modal.show #confirmBtn') ||
        document.querySelector('button[id*="confirmBtn"]');

      if (confirmBtn && DOMUtils.isVisible(confirmBtn)) {
        Logger.log('Tombol Konfirmasi Submit (#confirmBtn) terdeteksi! Mengklik konfirmasi...', 'success');
        if (isWorker) {
          WorkerContextManager.setSubmitted('pengisianSubmitted', true);
          WorkerContextManager.setSubIdx(0);
          confirmBtn.click();
          setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay + 1000);
        } else {
          chrome.storage.local.set({ pengisianSubmitted: true, subIdx: 0 }, () => {
            confirmBtn.click();
            setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay + 1000);
          });
        }
        return;
      }

      Logger.log('Memeriksa status penginputan Pengisian...', 'info');

      chrome.storage.local.get(['subIdx'], (result) => {
        let subIdx = isWorker ? WorkerContextManager.getSubIdx() : (result.subIdx || 0);

        // Membaca item pengisian hasil alokasi LO-Produk
        const itemsList = (rowData.itemsList && rowData.itemsList.length > 0)
          ? rowData.itemsList
          : [{
              produk: rowData.produk || '',
              loList: rowData.loList || [],
              combinedLO: (rowData.loList || []).join(', ')
            }];

        const totalItems = itemsList.length;

        // Inspeksi tabel draf Pengisian: Khusus tabel detail pengisian, abaikan tabel log & info header
        const detailContainer = document.querySelector('#tbl_detail_pengisian, #r_Pengisian, #g_Pengisian') ||
          Array.from(document.querySelectorAll('.ew-grid-middle-panel table')).find(t => !t.closest('#log-Table-row'));

        const rawRows = detailContainer
          ? Array.from(detailContainer.querySelectorAll('tbody tr'))
          : Array.from(document.querySelectorAll('table.ew-table tbody tr')).filter(r => !r.closest('#log-Table-row, .main-header, .stepper, nav, header'));

        const detailTableRows = rawRows.filter(r => {
          const cells = r.querySelectorAll('td');
          if (cells.length < 2) return false;
          const text = r.textContent.trim().toLowerCase();
          return !text.includes('no data') && !text.includes('tidak ada data') && !text.includes('record 0') && !text.includes('total');
        });
        const existingCount = detailTableRows.length;

        if (existingCount > subIdx && existingCount <= totalItems) {
          Logger.log(`Deteksi Draf: ${existingCount} item produk sudah ada di tabel Pengisian. Menyesuaikan subIdx ke-${existingCount}...`, 'info');
          subIdx = existingCount;
          chrome.storage.local.set({ subIdx: existingCount });
        }

        // Deteksi modal terbuka secara presisi
        const modalEl = document.querySelector('.modal.show, .modal-dialog, #form_input_modal, #row_NomorTangki, select#NomorTangki');
        const isModalOpen = modalEl && DOMUtils.isVisible(modalEl);

        if (subIdx < totalItems) {
          if (!isModalOpen) {
            const addBtn = document.getElementById('btn-add-modal') ||
              document.querySelector('button#btn-add-modal') ||
              document.querySelector('button[id*="btn-add-modal"]') ||
              document.querySelector('button[id*="add-modal"]') ||
              document.querySelector('.btn-success[id*="add"]') ||
              Array.from(document.querySelectorAll('button, a')).find(b => DOMUtils.isVisible(b) &&
                !b.closest('.stepper, nav, header') &&
                (b.id.includes('add-modal') || b.textContent.trim().startsWith('+ Add') || b.textContent.trim() === 'Add New' || b.textContent.trim() === '+ Tambah'));

            if (addBtn) {
              Logger.log(`Membuka modal untuk item pengisian produk ke-${subIdx + 1}/${totalItems} dalam ${this.stepDelay / 1000} detik...`, 'info');

              // Enforce type="button" agar tidak memicu form submit pada parent form
              if (addBtn.tagName === 'BUTTON') {
                addBtn.setAttribute('type', 'button');
              }

              setTimeout(() => DOMUtils.clickElement(addBtn), this.stepDelay);
            } else {
              Logger.log('Tombol Add Modal (#btn-add-modal / + Add) tidak terdeteksi di halaman.', 'error');
            }
          } else {
            Logger.log(`Mengisi detail Modal Pengisian item ke-${subIdx + 1}/${totalItems}...`, 'info');

            // Kunci siklus polling 1.5 detik selama proses async ini berjalan
            window._autofillLockUntil = Date.now() + 20000;

            const activeItem = itemsList[subIdx];
            const activeLO = activeItem.combinedLO || (activeItem.loList || []).join(', ');
            const activeProduct = activeItem.produk;

            // Jalankan pengisian berurutan
            this.executePengisianModalFlow(activeLO, activeProduct, tankConfigs, rowData, totalItems, subIdx, compPos, activeItem);
          }
        } else {
          Logger.log(`Seluruh baris detail produk (${totalItems} item) selesai dimasukkan/tersedia di draf. Menyiapkan Save Draft & Submit final...`, 'success');
          const saveBtn = document.getElementById('btn-save') || document.querySelector('button[data-nextstatus="Draft"]');
          const finalSubmitBtn = document.getElementById('btn-submit') || document.querySelector('button[data-nextstatus="Completed"]') || document.querySelector('button.btn-success');

          if (saveBtn && DOMUtils.isVisible(saveBtn)) {
            Logger.log('Mengklik tombol Save Draft (#btn-save)...', 'info');
            saveBtn.click();
          }

          if (finalSubmitBtn) {
            setTimeout(() => {
              Logger.log('Mengklik tombol Submit Pengisian final (#btn-submit)...', 'success');
              finalSubmitBtn.click();

              // Tunggu munculnya modal konfirmasi dialog (#confirmBtn)
              setTimeout(() => {
                const modalConfirmBtn = document.getElementById('confirmBtn') ||
                  document.querySelector('.modal.show #confirmBtn') ||
                  document.querySelector('button[id*="confirmBtn"]');

                if (modalConfirmBtn && DOMUtils.isVisible(modalConfirmBtn)) {
                  Logger.log('Mengklik konfirmasi submit final (#confirmBtn)...', 'success');
                  chrome.storage.local.set({ pengisianSubmitted: true, subIdx: 0 }, () => {
                    modalConfirmBtn.click();
                    setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay + 1000);
                  });
                } else {
                  chrome.storage.local.set({ pengisianSubmitted: true, subIdx: 0 }, () => {
                    setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay + 1000);
                  });
                }
              }, 1000);
            }, this.stepDelay + 1000);
          } else {
            Logger.log('Tombol Submit final Pengisian (#btn-submit) tidak ditemukan.', 'error');
          }
        }
      });
    });
  }

  async executePengisianModalFlow(activeLO, activeProduct, tankConfigs, rowData, totalLO, subIdx, compPos, activeItem) {
    // a. Nomor LO
    const loInputEl = document.getElementById('LO') || document.getElementById('x_LO') || document.querySelector('input[id*="LO"], input[name*="LO"]');
    if (loInputEl) {
      loInputEl.value = activeLO;
      loInputEl.dispatchEvent(new Event('input', { bubbles: true }));
      loInputEl.dispatchEvent(new Event('change', { bubbles: true }));
      Logger.log(`Mengisi Nomor LO: ${activeLO}`, 'info');
    }

    // b. In-Line Blending Checkbox (diaktifkan duluan)
    const isBlending = activeProduct.includes('SOLAR') || activeProduct.includes('BIOSOLAR') || activeProduct.includes('DEXLITE');
    const blendingCheckbox = document.getElementById('InLineBlending') || document.querySelector('input[type="checkbox"][id*="Blending"]');

    if (isBlending) {
      if (blendingCheckbox && !blendingCheckbox.checked) {
        blendingCheckbox.checked = true;
        blendingCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        blendingCheckbox.dispatchEvent(new Event('click', { bubbles: true }));
        Logger.log('Mengaktifkan In-Line Blending...', 'info');
      }
    } else {
      if (blendingCheckbox && blendingCheckbox.checked) {
        blendingCheckbox.checked = false;
        blendingCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    await new Promise(r => setTimeout(r, 300));

    // c. Tangki 1 & Tangki 2 (DISET LEBIH DULUAN, beri jeda AJAX 700ms agar auto-populate portal selesai)
    let tank1Val = "5";
    let tank2Val = "15";
    const pUpper = activeProduct.trim().toUpperCase();

    if (pUpper.includes('SOLAR') || pUpper.includes('BIOSOLAR') || pUpper.includes('DEXLITE')) {
      tank1Val = tankConfigs['BIOSOLAR B50_1'] || tankConfigs['BIOSOLAR'] || '5';
      tank2Val = tankConfigs['BIOSOLAR B50_2'] || '15';
    } else if (pUpper.includes('PERTALITE')) {
      tank1Val = tankConfigs['PERTALITE'] || '1';
    } else if (pUpper.includes('PERTAMAX') && !pUpper.includes('TURBO')) {
      tank1Val = tankConfigs['PERTAMAX'] || '2';
    } else if (pUpper.includes('TURBO')) {
      tank1Val = tankConfigs['PERTAMAX TURBO'] || '3';
    } else if (pUpper.includes('PERTADEX')) {
      tank1Val = tankConfigs['PERTADEX'] || '4';
    } else if (pUpper.includes('AVTUR')) {
      tank1Val = tankConfigs['AVTUR'] || '5';
    } else {
      tank1Val = tankConfigs[pUpper] || '1';
    }

    const tank1Select = document.getElementById('NomorTangki') || document.getElementById('x_NomorTangki') || document.querySelector('select[id*="NomorTangki"]');
    if (tank1Select) {
      await Select2Helper.setSelectByValueOrText(tank1Select, tank1Val).catch(e => Logger.log(`Gagal set Tangki 1: ${e}`, 'warn'));
    }
    await new Promise(r => setTimeout(r, 700));

    const tank2Select = document.getElementById('NomorTangki2') || document.getElementById('x_NomorTangki2') || document.querySelector('select[id*="NomorTangki2"]');
    if (tank2Select && (pUpper.includes('SOLAR') || pUpper.includes('BIOSOLAR') || pUpper.includes('DEXLITE'))) {
      await Select2Helper.setSelectByValueOrText(tank2Select, tank2Val).catch(e => Logger.log(`Gagal set Tangki 2: ${e}`, 'warn'));
    }
    await new Promise(r => setTimeout(r, 700));

    // d. Produk Utama — Hanya dilakukan pencarian otomatis via dropdown Select2 untuk SOLAR & DEXLITE
    const needsProductSelect = pUpper.includes('SOLAR') || pUpper.includes('BIOSOLAR') || pUpper.includes('DEXLITE');
    const productSelect = document.getElementById('Produk') || document.getElementById('x_IdProduk') || document.querySelector('select[id*="Produk"]');

    if (needsProductSelect && productSelect) {
      await this.setProdukAndVerify(productSelect, activeProduct, 2000, 200);
    } else {
      Logger.log(`[Skip Produk Dropdown] Produk "${activeProduct}" otomatis menyesuaikan berdasarkan pilihan Tangki.`, 'info');
    }

    // e. Quantity, Meter, Bay Number & Kompartemen
    this.fillMetersAndQuantity(activeProduct, rowData, totalLO, subIdx, compPos, activeItem);

    // f. Verifikasi akhir Produk (hanya jika butuh pencarian otomatis)
    if (needsProductSelect && productSelect) {
      const finalText = productSelect.options[productSelect.selectedIndex]?.text || "";
      if (finalText.includes(activeProduct) || (activeProduct.includes('BIOSOLAR') && finalText.includes('A040900219'))) {
        Logger.log(`🎯 VERIFIKASI PRODUK OK: "${finalText}"`, 'success');
      } else {
        Logger.log(`↩️ Verifikasi Produk memicu penyesuaian ulang ke: "${activeProduct}"`, 'warn');
        await this.setProdukAndVerify(productSelect, activeProduct, 1000, 200);
      }
    }

    // g. Deteksi dinamis Meter Awal & Meter Akhir dari AJAX portal
    await this.waitForMeterAutoFill(15000);

    // h. Simpan Modal (+ Add / Simpan)
    this.saveModal(subIdx);
  }

  async waitForMeterAutoFill(maxWaitMs = 15000) {
    Logger.log('⏳ Menunggu auto-fill Meter Awal & Meter Akhir dari portal AJAX...', 'info');
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const meterAwalEl = document.getElementById('MeterAwal') || document.querySelector('input[name="MeterAwal"]');
      const meterAkhirEl = document.getElementById('MeterAkhir') || document.querySelector('input[name="MeterAkhir"]');

      const valAwal = meterAwalEl ? (meterAwalEl.value || '').trim() : '';
      const valAkhir = meterAkhirEl ? (meterAkhirEl.value || '').trim() : '';

      if (valAwal !== '' && valAkhir !== '') {
        Logger.log(`✅ Meter Awal & Akhir terkonfirmasi terisi! [Awal: "${valAwal}", Akhir: "${valAkhir}"]`, 'success');
        return { success: true, meterAwal: valAwal, meterAkhir: valAkhir };
      }

      await new Promise(r => setTimeout(r, 300));
    }

    Logger.log('⚠️ Timeout (15s): Meter Awal/Akhir belum terisi otomatis. Melanjutkan ke simpan modal.', 'warn');
    return { success: false };
  }

  async setProdukAndVerify(selectEl, activeProduct, maxWaitMs = 2000, intervalMs = 200) {
    const start = Date.now();
    let productTarget = activeProduct;
    if (activeProduct.toUpperCase().includes('BIOSOLAR')) {
      productTarget = 'A040900219';
    }

    await Select2Helper.setSelectByValueOrText(selectEl, productTarget).catch(e => Logger.log(`Set Produk warn: ${e}`, 'warn'));

    while (Date.now() - start < maxWaitMs) {
      await new Promise(r => setTimeout(r, intervalMs));
      const currentText = selectEl.options[selectEl.selectedIndex]?.text || '';
      if (currentText.includes(productTarget) || currentText.toUpperCase().includes(activeProduct.toUpperCase())) {
        Logger.log(`🔒 Produk terkonfirmasi stabil: "${currentText}"`, 'success');
        return true;
      } else {
        Logger.log(`↩️ Listener portal mengubah produk ke "${currentText}". Memaksa set ulang...`, 'warn');
        await Select2Helper.setSelectByValueOrText(selectEl, productTarget).catch(e => { });
      }
    }
    return true;
  }

  saveModal(subIdx) {
    const modalSaveBtn = document.querySelector('.modal-footer button.btn-success, #form_input_modal button[type="submit"], #btn_simpan_modal, .modal button.btn-success, .modal button.btn-primary') ||
      Array.from(document.querySelectorAll('.modal button, button')).find(b => DOMUtils.isVisible(b) && (b.textContent.includes('Add') || b.textContent.includes('Simpan') || b.textContent.includes('Tambah')));

    if (modalSaveBtn) {
      Logger.log(`Menyimpan detail modal LO ke-${subIdx + 1}...`, 'success');
      if (WorkerContextManager.isWorker()) {
        WorkerContextManager.setSubIdx(subIdx + 1);
        setTimeout(() => modalSaveBtn.click(), 500);
      } else {
        chrome.storage.local.set({ subIdx: subIdx + 1 }, () => {
          setTimeout(() => modalSaveBtn.click(), 500);
        });
      }
    } else {
      Logger.log('Tombol Simpan/Add Modal tidak ditemukan.', 'warn');
    }
  }

  fillMetersAndQuantity(product, rowData, totalItems, subIdx, compPos, activeItem) {
    const findField = (idList) => {
      for (const id of idList) {
        const el = document.getElementById(id) || document.querySelector(`input[id="${id}"], input[name="${id}"], select[id="${id}"], select[name="${id}"]`);
        if (el) return DOMUtils.resolveActualInputElement(el);
      }
      for (const id of idList) {
        const clean = id.replace(/^x_/, '');
        const el = document.querySelector(`input[id*="${clean}" i], input[name*="${clean}" i]`);
        if (el) return DOMUtils.resolveActualInputElement(el);
      }
      return null;
    };

    let bayVal = "1";
    let meterVal = "1";

    const pUpper = (product || '').toUpperCase();
    if (pUpper.includes('DEXLITE') || pUpper.includes('SOLAR') || pUpper.includes('BIOSOLAR')) {
      bayVal = "6";
      meterVal = "1";
    } else if (pUpper.includes('PERTALITE')) {
      bayVal = "1";
      meterVal = "1";
    } else if (pUpper.includes('PERTAMAX')) {
      bayVal = "5";
      meterVal = "4";
    }

    const bayInput = findField(['x_BayNumber', 'BayNumber', 'x_Bay_Number', 'x_BayNo', 'BayNo', 'Bay']);
    if (bayInput) {
      bayInput.value = bayVal;
      ['input', 'change', 'blur'].forEach(evt => bayInput.dispatchEvent(new Event(evt, { bubbles: true })));
      Logger.log(`Mengisi Bay Number: ${bayVal}`, 'info');
    } else {
      Logger.log('Input Bay Number tidak ditemukan di modal.', 'warn');
    }

    const meterInput = findField(['x_NoMeter', 'NoMeter', 'x_No_Meter', 'x_MeterNo', 'MeterNo']);
    if (meterInput) {
      meterInput.value = meterVal;
      ['input', 'change', 'blur'].forEach(evt => meterInput.dispatchEvent(new Event(evt, { bubbles: true })));
      Logger.log(`Mengisi No Meter: ${meterVal}`, 'info');
    } else {
      Logger.log('Input No Meter tidak ditemukan di modal.', 'warn');
    }

    // Normalisasi volume ke KL
    const normalizeKL = (vol) => {
      if (!vol || isNaN(vol)) return 0;
      return vol > 500 ? vol / 1000 : vol;
    };

    const itemsList = (rowData && rowData.itemsList && rowData.itemsList.length > 0) ? rowData.itemsList : [];

    // Hitung volume item saat ini (dalam KL)
    let currentKL = 0;
    if (activeItem && activeItem.loList && activeItem.loList.length > 0) {
      currentKL = activeItem.loList.length * 8;
    } else if (activeItem && activeItem.volume) {
      currentKL = normalizeKL(activeItem.volume);
    } else if (rowData && rowData.volume) {
      const truckKL = normalizeKL(rowData.volume);
      currentKL = truckKL / (totalItems || 1);
    } else {
      currentKL = 8;
    }

    const volInput = findField(['x_Quantity', 'Quantity', 'x_Volume', 'Volume', 'x_Qty', 'Qty']);
    const pieceVolume = Math.round(currentKL * 1000);
    if (volInput) {
      volInput.value = pieceVolume;
      ['input', 'change', 'blur'].forEach(evt => volInput.dispatchEvent(new Event(evt, { bubbles: true })));
      Logger.log(`Set Volume/Quantity: ${pieceVolume} Liter (${currentKL} KL)`, 'info');
    } else {
      Logger.log('Input Volume/Quantity tidak ditemukan di modal.', 'warn');
    }

    // Hitung kompartemen awal secara akumulatif berurutan (Sequential Compartment Allocation)
    let compStart = 1;
    for (let i = 0; i < subIdx; i++) {
      const prevItem = itemsList[i];
      let prevKL = 0;
      if (prevItem && prevItem.loList && prevItem.loList.length > 0) {
        prevKL = prevItem.loList.length * 8;
      } else if (prevItem && prevItem.volume) {
        prevKL = normalizeKL(prevItem.volume);
      } else if (rowData && rowData.volume) {
        prevKL = normalizeKL(rowData.volume) / (totalItems || 1);
      } else {
        prevKL = 8;
      }
      const prevCompsNeeded = Math.max(1, Math.ceil(prevKL / 8));
      compStart += prevCompsNeeded;
    }

    const numCompNeeded = Math.max(1, Math.ceil(currentKL / 8));
    const comps = [];
    for (let i = 0; i < numCompNeeded; i++) {
      comps.push(compStart + i);
    }
    const compStr = comps.join('.');

    const compInput = findField(['x_NomorKompartment', 'NomorKompartment', 'x_NomorKompartemen', 'NomorKompartemen', 'x_Kompartment', 'Kompartment']);
    if (compInput) {
      compInput.value = compStr;
      ['input', 'change', 'blur'].forEach(evt => compInput.dispatchEvent(new Event(evt, { bubbles: true })));
      Logger.log(`Mengisi Nomor Kompartemen: ${compStr} (Produk ke-${subIdx + 1}, ${currentKL} KL)`, 'success');
    } else {
      Logger.log('Input Nomor Kompartemen tidak ditemukan di modal.', 'warn');
    }
  }
}

/// Handler Halaman 6: Formulir MT Gate Out
class GateOutPageHandler extends BasePageHandler {
  handle(rowData, stage) {
    const isWorker = WorkerContextManager.isWorker();
    const isGateOutDone = isWorker ? WorkerContextManager.isSubmitted('gateOutSubmitted') : false;

    const hasGateOutTime = rowData && rowData.gateOutTime && String(rowData.gateOutTime).trim() !== "";
    if (!hasGateOutTime) {
      Logger.log(`[Gate Out Filter] Data Gate Out di Excel untuk plat ${rowData?.nopol || ''} kosong/belum ada. Batal mengisi Gate Out & menutup Tab Pekerja...`, 'warn');
      if (isWorker) {
        chrome.runtime.sendMessage({ action: 'WORKER_TASK_COMPLETED' });
      }
      return;
    }

    chrome.storage.local.get(['gateOutSubmitted'], (resStorage) => {
      // 1. Prioritas Utama: Cek dulu apakah tombol Submit (#btn-completed / #btn-completedEdit) visible ada
      const completedBtn = Array.from(document.querySelectorAll('#btn-completed, #btn-completedEdit, button.btn-success'))
        .find(btn => DOMUtils.isVisible(btn) && (btn.id.includes('completed') || btn.textContent.trim().toLowerCase().includes('submit')));

      if (completedBtn) {
        Logger.log(`Tombol Submit final Gate Out (#${completedBtn.id || 'btn-completed'}) terdeteksi! Mengirimkan data Gate Out final...`, 'success');
        setTimeout(() => {
          if (isWorker) {
            WorkerContextManager.setSubmitted('gateOutSubmitted', true);
            DOMUtils.clickElement(completedBtn);
            setTimeout(() => {
              chrome.runtime.sendMessage({ action: 'WORKER_TASK_COMPLETED' });
            }, this.stepDelay + 1000);
          } else {
            chrome.storage.local.set({ gateOutSubmitted: true }, () => {
              DOMUtils.clickElement(completedBtn);
              setTimeout(() => {
                chrome.runtime.sendMessage({ action: 'WORKER_TASK_COMPLETED' });
              }, this.stepDelay + 1000);
            });
          }
        }, this.stepDelay);
        return;
      }

      // 2. Baru kalau tombol Submit TIDAK ADA / belum visible, cek apakah transaksi sudah COMPLETED atau pernah disubmit
      if (isGateOutDone || resStorage.gateOutSubmitted || DOMUtils.isActivityStatusCompleted()) {
        Logger.log('Aktivitas Gate Out terdeteksi telah disubmit/COMPLETED. Menutup Tab Pekerja otomatis...', 'success');
        chrome.runtime.sendMessage({ action: 'WORKER_TASK_COMPLETED' });
        return;
      }

      // 3. Lakukan pengisian data draf Gate Out
      Logger.log('Mengisi data MT Gate Out...', 'info');

      const segelInput = document.getElementById('x_NomorSegel');
      if (segelInput) {
        const segelStr = rowData.segelList.join(', ');
        segelInput.value = segelStr;
        segelInput.dispatchEvent(new Event('change'));
        Logger.log(`Mengisi No Segel: ${segelStr}`, 'info');
      }

      const gateOutInput = document.getElementById('x_WaktuGateOut') || document.querySelector('.tempus-dominus-input');
      if (gateOutInput) {
        gateOutInput.value = rowData.gateOutTime;
        gateOutInput.dispatchEvent(new Event('change'));
        Logger.log(`Mengisi Waktu Gate Out: ${rowData.gateOutTime}`, 'info');
      }

      let submitAttempts = 0;
      const submitInterval = setInterval(() => {
        submitAttempts++;
        const segelVal = document.getElementById('x_NomorSegel')?.value;
        const waktuVal = document.getElementById('x_WaktuGateOut')?.value;

        if ((segelVal && waktuVal) || submitAttempts > 10) {
          clearInterval(submitInterval);
          const saveBtn = document.getElementById('btn-draft') || document.getElementById('btn-save') || document.getElementById('btn-action') || document.querySelector('button.btn-primary');
          if (saveBtn) {
            Logger.log(`Mengklik Save draf Gate Out (#${saveBtn.id}), menunggu tombol submit muncul...`, 'info');
            setTimeout(() => {
              saveBtn.click();
            }, this.stepDelay);
          } else {
            Logger.log('Tombol Save draf Gate Out tidak ditemukan.', 'error');
          }
        }
      }, 500);
    });
  }
}

// 5. Master Automation Engine Class (Orchestrator)
class AutofillEngine {
  constructor() {
    this.listHandler = new ListPageHandler();
    this.penyaluranAddHandler = new PenyaluranAddPageHandler();
    this.processBridgeHandler = new ProcessBridgePageHandler();
    this.gateInHandler = new GateInPageHandler();
    this.pengisianHandler = new PengisianPageHandler();
    this.gateOutHandler = new GateOutPageHandler();

    this.initMessageListener();
  }

  initMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'start-autofill') {
        this.initAutofill();
        sendResponse({ started: true });
      }
      return true;
    });
  }

  async initAutofill() {
    // 0. Deteksi Halaman Blank / Server Error (504 Timeout, 500 Error, dsb)
    if (NetworkWatchdog.checkAndRecover()) {
      return;
    }

    // GUARD: jika ada handler yang sedang di tengah proses panjang (mis. mengisi
    // modal Pengisian atau menunggu Submit Gate In), JANGAN mulai siklus baru dulu.
    if (window._autofillLockUntil && Date.now() < window._autofillLockUntil) {
      return;
    }

    await WorkerContextManager.init();

    chrome.storage.local.get(['autofillActive', 'excelData', 'currentIndex', 'autofillStage', 'tankConfigs', 'currentCompPos'], (res) => {
      if (!res.autofillActive || !res.excelData || res.excelData.length === 0) {
        return;
      }

      // 1. Jalur Tab Pekerja (Isolasi Per-Tab)
      if (WorkerContextManager.isWorker()) {
        const rowData = WorkerContextManager.getRowData();
        if (!rowData) return;
        const stage = WorkerContextManager.getStage('CREATE_PENYALURAN');
        const tankConfigs = res.tankConfigs || {};
        const compPos = parseInt(sessionStorage.getItem('currentCompPos') || '1', 10);
        this.processStage(rowData, stage, tankConfigs, WorkerContextManager.context.rowIndex || 0, res.excelData.length, compPos);
        return;
      }

      // 2. Jalur Master Tab (Dispatching & Monitoring)
      const idx = res.currentIndex || 0;
      if (idx >= res.excelData.length) {
        chrome.runtime.sendMessage({ action: 'GET_ACTIVE_WORKER_COUNT' }, (resCount) => {
          if (resCount && resCount.count > 0) {
            Logger.log(`[Master Dispatcher] Semua data Excel (${res.excelData.length} baris) telah didistribusikan. Menunggu ${resCount.count} tab pekerja menyelesaikan tugas...`, 'info');
            chrome.storage.local.set({ waitingForWorkers: true });
          } else {
            // Cek apakah seluruh baris di portal sudah ada dan Complete
            const rows = document.querySelectorAll('table tbody tr');
            let totalFoundInPortal = 0;
            let totalCompletedInPortal = 0;

            res.excelData.forEach(item => {
              let found = false;
              const hasGateOut = item.gateOutTime && String(item.gateOutTime).trim() !== "";
              for (const r of rows) {
                if (DOMUtils.isRowMatchNopol(r, item.nopol)) {
                  found = true;
                  const txt = r.innerText.toLowerCase();
                  const is100 = txt.includes('complete') || txt.includes('selesai') || txt.includes('100%');
                  const isInProgress = txt.includes('in progress') || txt.includes('33%') || txt.includes('66%');
                  if (is100 || (!hasGateOut && isInProgress)) {
                    totalCompletedInPortal++;
                  }
                  break;
                }
              }
              if (found) totalFoundInPortal++;
            });

            // Sinkronkan jumlah truk Complete real-time ke Popup UI
            chrome.storage.local.set({ completedCount: totalCompletedInPortal });

            if (totalFoundInPortal < res.excelData.length || totalCompletedInPortal < res.excelData.length) {
              Logger.log(`[Master Dispatcher] Re-scan Portal: Terdeteksi ${totalFoundInPortal}/${res.excelData.length} truk di portal (${totalCompletedInPortal} Selesai). Mengulang pemindaian dari baris ke-1 untuk mendaftarkan truk yang terlewati...`, 'warn');
              chrome.storage.local.set({ currentIndex: 0, autofillStage: 'CREATE_PENYALURAN' }, () => {
                setTimeout(() => window.location.reload(), 2000);
              });
            } else {
              Logger.log(`[Master Dispatcher] Seluruh transaksi (${res.excelData.length}/${res.excelData.length} truk) dan seluruh Tab Pekerja telah selesai terdaftar & berstatus Complete!`, 'success');
              chrome.storage.local.set({ autofillActive: false, waitingForWorkers: false, completedCount: res.excelData.length });
            }
          }
        });
        return;
      }

      const rowData = res.excelData[idx];
      const stage = res.autofillStage || 'CREATE_PENYALURAN';
      const tankConfigs = res.tankConfigs || {};
      const compPos = res.currentCompPos || 1;

      this.processStage(rowData, stage, tankConfigs, idx, res.excelData.length, compPos);
    });
  }

  processStage(rowData, stage, tankConfigs, index, total, compPos) {
    const path = window.location.pathname.toLowerCase();

    Logger.log(`Memproses Baris ${index + 1}/${total} - No Polisi: ${rowData.nopol} | Stage saat ini: ${stage} | Path: ${path}`, 'system');

    // Nopol Guard untuk Tab Pekerja / Form Handlers (Kecuali ListPageHandler)
    const isList = path.includes('penyaluranlist') || path.includes('penyaluran_list') || document.getElementById('btn-add-penyaluran');
    if (!isList) {
      const pageNopol = DOMUtils.getPageNopol();
      if (pageNopol && rowData && rowData.nopol) {
        const normPage = DOMUtils.normalizeNopol(pageNopol);
        const normRow = DOMUtils.normalizeNopol(rowData.nopol);

        if (normPage && normPage !== normRow) {
          Logger.log(`[Nopol Guard] Perhatian: Plat nomor di layar web (${pageNopol}) berbeda dari konteks (${rowData.nopol}). Mencari kecocokan di data Excel...`, 'warn');
          chrome.storage.local.get(['excelData'], (resEx) => {
            const excelData = resEx.excelData || [];
            const matchedItem = excelData.find(item => DOMUtils.normalizeNopol(item.nopol) === normPage);
            if (matchedItem) {
              Logger.log(`[Nopol Guard] Koreksi Otomatis: Sinkronisasi data ke plat ${matchedItem.nopol} dari Excel!`, 'success');
              rowData = matchedItem;
              if (WorkerContextManager.isWorker()) {
                WorkerContextManager.context.rowData = matchedItem;
                sessionStorage.setItem('worker_context', JSON.stringify(WorkerContextManager.context));
              }
              this.dispatchStageHandler(rowData, stage, tankConfigs, compPos, path);
            } else {
              Logger.log(`[Nopol Guard Error] Plat ${pageNopol} di layar web tidak ditemukan pada data Excel! Batal mengisikan data untuk mencegah salah data.`, 'error');
              if (WorkerContextManager.isWorker()) {
                chrome.runtime.sendMessage({ action: 'WORKER_TASK_COMPLETED' });
              }
            }
          });
          return;
        }
      }
    }

    this.dispatchStageHandler(rowData, stage, tankConfigs, compPos, path);
  }

  dispatchStageHandler(rowData, stage, tankConfigs, compPos, path) {
    if (path.includes('prosespenyaluranlist') || path.includes('aktivitaspenyaluranlist') ||
      path.includes('aktivitaslist') || path.includes('aktivitas_list') ||
      path.includes('proseslist') || path.includes('proses_list') ||
      document.getElementById('el1_ProsesPenyaluran_LinkAktivitas') ||
      document.getElementById('el1_Aktivitas_Aktivitas2') || document.getElementById('el1_Proses_Aktivitas2')) {
      this.processBridgeHandler.handle(rowData, stage);
    }
    else if (path.includes('penyaluranlist') || path.includes('penyaluran_list') || document.getElementById('btn-add-penyaluran')) {
      this.listHandler.handle(rowData, stage);
    }
    else if (path.includes('penyaluranadd') || path.includes('penyaluran_add')) {
      this.penyaluranAddHandler.handle(rowData, stage);
    }
    else if (document.getElementById('el_SubAktivitasDataMobilTangkiMTGateIn_AMT') ||
      document.getElementById('x_AMT') || document.getElementById('x_SubAktivitasDataMobilTangkiMTGateIn_AMT') ||
      document.getElementById('x_WaktuGateIn') || document.getElementById('x_SubAktivitasDataMobilTangkiMTGateIn_WaktuGateIn') ||
      path.includes('gatein') || path.includes('gate_in')) {
      this.gateInHandler.handle(rowData, stage);
    }
    else if (path.includes('pengisian') || path.includes('aktivitastabel') || document.getElementById('btn-add-modal') || document.querySelector('#form_input_modal, select#NomorTangki, .modal.show')) {
      this.pengisianHandler.handle(rowData, stage, tankConfigs, compPos);
    }
    else if (document.getElementById('x_NomorSegel') || path.includes('gateout')) {
      this.gateOutHandler.handle(rowData, stage);
    }
    else {
      Logger.log('Berada di halaman tidak dikenal. Program standby.', 'warn');
    }
  }

  start() {
    this.initAutofill();

    // Loop polling otomatis agar saat modal/halaman AJAX berubah tanpa reload, bot tetap merespons
    if (!window._autofillInterval) {
      window._autofillInterval = setInterval(() => {
        chrome.storage.local.get(['autofillActive'], (res) => {
          if (res.autofillActive) {
            this.initAutofill();
          }
        });
      }, 1500);
    }
  }
}

// Instantiate and start engine automatically
const engine = new AutofillEngine();
engine.start();