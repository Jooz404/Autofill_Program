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

// 2. Select2 & Dropdown Interaction Helper Class
class Select2Helper {
  static activeSelections = new Set();

  static openSelect2AndChoose(selectId, optionText) {
    return new Promise((resolve, reject) => {
      const select = document.getElementById(selectId);
      if (!select) return reject('Select tidak ditemukan: ' + selectId);

      const select2Container = select.nextElementSibling || select.parentElement.querySelector('.select2-container');
      if (!select2Container || !select2Container.classList.contains('select2')) {
        return reject('Container Select2 tidak ditemukan');
      }

      if (Select2Helper.activeSelections.has(selectId)) {
        return resolve(false);
      }
      Select2Helper.activeSelections.add(selectId);

      const cleanUpAndResolve = (val) => {
        Select2Helper.activeSelections.delete(selectId);
        resolve(val);
      };

      const cleanUpAndReject = (err) => {
        Select2Helper.activeSelections.delete(selectId);
        reject(err);
      };

      const selectionBox = select2Container.querySelector('.select2-selection');
      if (!selectionBox) return cleanUpAndReject('.select2-selection tidak ditemukan');

      // PENTING: Hanya klik untuk membuka jika dropdown BELUM terbuka
      const isOpen = select2Container.classList.contains('select2-container--open');
      if (!isOpen) {
        ['mousedown', 'mouseup', 'click'].forEach(type => {
          selectionBox.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
        });
      }

      const start = Date.now();
      const tryFind = () => {
        const options = document.querySelectorAll('.select2-results__option');
        let target = null;
        const targetClean = optionText.trim();
        const targetUpper = targetClean.toUpperCase();

        const realOpts = Array.from(options).filter(o =>
          !o.className.includes('loading') &&
          !o.textContent.includes('Searching') &&
          o.textContent.trim() !== "" &&
          !o.textContent.includes('-- Tangki --') &&
          !o.textContent.includes('-- Produk --')
        );

        // 1. Exact match
        for (let opt of realOpts) {
          if (opt.textContent.trim().toUpperCase() === targetUpper) {
            target = opt;
            break;
          }
        }

        // 2. Includes match
        if (!target) {
          for (let opt of realOpts) {
            if (opt.textContent.trim().toUpperCase().includes(targetUpper)) {
              target = opt;
              break;
            }
          }
        }

        // 3. Digit/Tank match (misal search '1' atau '15' pencocokan ke TK-01, T001, TK-15, T015)
        if (!target && /^\d+$/.test(targetClean)) {
          const paddedNum = targetClean.padStart(2, '0');
          for (let opt of realOpts) {
            const txtUpper = opt.textContent.toUpperCase();
            if (txtUpper.includes(`TK-${paddedNum}`) || txtUpper.includes(`TK-${targetClean}`) ||
                txtUpper.includes(`T${paddedNum}`) || txtUpper.includes(`T${targetClean}`) ||
                txtUpper.includes(`-${paddedNum}-`) || txtUpper.includes(`-${targetClean}-`)) {
              target = opt;
              break;
            }
          }
        }

        // 4. Keyword match
        if (!target) {
          for (let opt of realOpts) {
            const optTextUpper = opt.textContent.trim().toUpperCase();
            let isMatch = false;
            if (targetUpper === 'TRUCK' && (optTextUpper.includes('JALAN') || optTextUpper.includes('MOBIL') || optTextUpper.includes('TANK'))) {
              isMatch = true;
            } else if (targetUpper === 'SPBU' && (optTextUpper.includes('SPBU') || optTextUpper.includes('STASIUN') || optTextUpper.includes('RETAIL'))) {
              isMatch = true;
            }
            if (isMatch) {
              target = opt;
              break;
            }
          }
        }

        // 5. Fallback ke opsi pertama yang valid
        if (!target && realOpts.length > 0) {
          target = realOpts[0];
          Logger.log(`Tidak ada kecocokan persis untuk "${optionText}". Memilih opsi Select2 pertama: "${target.textContent.trim()}"`, 'warn');
        }

        if (target) {
          ['mouseenter', 'mousedown', 'mouseup', 'click'].forEach(type => {
            target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
          });
          select.dispatchEvent(new Event('change', { bubbles: true }));
          cleanUpAndResolve(true);
        } else if (Date.now() - start < 3000) {
          setTimeout(tryFind, 150);
        } else {
          // Fallback langsung ke HTML <select>
          if (select.options && select.options.length > 1) {
            const validOpt = Array.from(select.options).find(o => o.value && o.value.trim() !== "");
            if (validOpt) {
              select.value = validOpt.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              cleanUpAndResolve(true);
              return;
            }
          }
          cleanUpAndReject(`Opsi "${optionText}" tidak ditemukan di dropdown`);
        }
      };

      setTimeout(tryFind, 150);
    });
  }

  static setSelectByValueOrText(selectEl, searchVal) {
    if (!selectEl || !searchVal) return Promise.reject('Invalid arguments');
    if (!selectEl.id) {
      selectEl.id = 'autofill-sel-' + Math.floor(Math.random() * 100000);
    }

    const select2Container = selectEl.nextElementSibling;
    const isSelect2 = select2Container && select2Container.classList.contains('select2');

    if (isSelect2) {
      return Select2Helper.openSelect2AndChoose(selectEl.id, searchVal);
    } else {
      return new Promise((resolve, reject) => {
        let attempts = 0;
        const checkOptions = () => {
          attempts++;
          if (selectEl.options && selectEl.options.length > 0) {
            let optValue = "";
            const targetUpper = searchVal.trim().toUpperCase();

            for (let opt of selectEl.options) {
              const optTextUpper = opt.text.toUpperCase();
              let isMatch = optTextUpper.includes(targetUpper) || opt.value.trim() === searchVal.trim();
              if (!isMatch) {
                if (targetUpper === 'TRUCK' && (optTextUpper.includes('JALAN') || optTextUpper.includes('MOBIL') || optTextUpper.includes('TANK'))) {
                  isMatch = true;
                } else if (targetUpper === 'SPBU' && (optTextUpper.includes('SPBU') || optTextUpper.includes('STASIUN') || optTextUpper.includes('RETAIL'))) {
                  isMatch = true;
                }
              }
              if (isMatch) {
                optValue = opt.value;
                break;
              }
            }

            if (!optValue) {
              const validOpts = Array.from(selectEl.options).filter(o => o.value && o.value.trim() !== "");
              if (validOpts.length > 0) {
                optValue = validOpts[0].value;
              }
            }

            if (optValue) {
              selectEl.value = optValue;
              selectEl.dispatchEvent(new Event('change', { bubbles: true }));
              Logger.log(`Berhasil memilih raw select #${selectEl.id}: ${optValue}`, 'success');
              resolve(true);
            } else {
              reject(`Tidak dapat menemukan nilai yang cocok untuk "${searchVal}" pada raw select #${selectEl.id}`);
            }
          } else if (attempts < 20) {
            setTimeout(checkOptions, 150);
          } else {
            reject(`Timeout menunggu opsi raw select #${selectEl.id} dimuat`);
          }
        };

        checkOptions();
      });
    }
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
    // 1. Cari elemen yang mengandung teks "Completed" / "Selesai" di area status
    const candidates = document.querySelectorAll(
      '[id*="StatusAktivitas"], [id*="status"], .alert, .badge, .text-success, .bg-success, span, div'
    );

    for (let el of candidates) {
      if (!DOMUtils.isVisible(el)) continue;
      const text = el.textContent.trim().toLowerCase();
      if (text === 'completed' || text === 'selesai' ||
        text.includes('✓ completed') || text.includes('completed') && text.length < 30) {
        return true;
      }
    }

    // 2. Cek baris yang punya label "Status Aktivitas"
    const labels = Array.from(document.querySelectorAll('label, td, th, div, span'));
    for (let label of labels) {
      if (label.textContent.trim().toLowerCase() === 'status aktivitas') {
        const parent = label.closest('.row, tr, .form-group, div') || label.parentElement;
        if (parent) {
          const rowText = parent.textContent.toLowerCase();
          if (rowText.includes('completed') || rowText.includes('selesai')) {
            return true;
          }
        }
      }
    }

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
            const link = r.querySelector('[id*="LinkProses"] a, td.el_Penyaluran_LinkProses a, a[href*="proses"]');
            if (link) {
              hasIncompleteRow = true;
              incompleteLink = link;
            }
          }
        }
      }

      if (hasIncompleteRow && incompleteLink) {
        Logger.log(`Menemukan transaksi In Progress untuk plat ${rowData.nopol}. Membuka Halaman Proses...`, 'success');
        chrome.storage.local.set({ autofillStage: 'CLICK_PROCESS_LINK' }, () => {
          setTimeout(() => incompleteLink.click(), this.stepDelay);
        });
      } else if (hasCompleteRow && !hasIncompleteRow) {
        Logger.log(`Transaksi untuk plat ${rowData.nopol} sudah berstatus Complete. Melompati baris Excel ini...`, 'success');
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
          chrome.storage.local.set({ autofillStage: 'CREATE_PENYALURAN' }, () => {
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
    chrome.storage.local.get(['gateInSubmitted', 'pengisianSubmitted'], (res) => {
      if (res.gateInSubmitted) {
        Logger.log('Deteksi berhasil melakukan submit Gate In. Pindah ke tahap Pengisian...', 'success');
        chrome.storage.local.set({ autofillStage: 'GATE_IN_SUBMITTED', gateInSubmitted: false }, () => {
          this.handle(rowData, 'GATE_IN_SUBMITTED');
        });
        return;
      }

      if (res.pengisianSubmitted) {
        Logger.log('Deteksi berhasil melakukan submit Pengisian. Pindah ke tahap Gate Out...', 'success');
        chrome.storage.local.set({ autofillStage: 'PENGISIAN_SUBMITTED', pengisianSubmitted: false }, () => {
          this.handle(rowData, 'PENGISIAN_SUBMITTED');
        });
        return;
      }

      let keyword = 'gatein';
      if (stage === 'GATE_IN_SUBMITTED' || stage === 'PENGISIAN') {
        keyword = 'pengisian';
      } else if (stage === 'PENGISIAN_SUBMITTED' || stage === 'GATE_OUT') {
        keyword = 'gateout';
      }

      Logger.log(`Halaman Bridge. Memproses baris aktivitas untuk langkah: "${keyword}" | Stage: ${stage}`, 'info');

      const bodyLinks = Array.from(document.querySelectorAll('table tbody tr td a'));

      let link = bodyLinks.find(l => {
        const href = (l.getAttribute('href') || '').toLowerCase();
        const text = l.textContent.toLowerCase();
        const isSubAktivitas = href.includes('subaktivitas') || href.includes('edit') || href.includes('add') || href.includes('aktivitas');
        const matchesKeyword = href.includes(keyword) || text.includes(keyword.replace('gatein', 'gate in').replace('gateout', 'gate out'));
        return isSubAktivitas && matchesKeyword;
      });

      if (!link) {
        Logger.log(`Tautan spesifik untuk "${keyword}" tidak ditemukan. Menggunakan fallback tautan subaktivitas pertama...`, 'warn');
        link = bodyLinks.find(l => {
          const href = l.getAttribute('href') || '';
          return href.toLowerCase().includes('subaktivitas');
        }) || document.querySelector('#el1_Aktivitas_Aktivitas2 a, #el1_Proses_Aktivitas2 a, table tbody tr td a');
      }

      if (link) {
        const linkText = link.textContent.trim();
        const href = link.getAttribute('href') || '';
        Logger.log(`Menemukan tautan aktivitas: "${linkText}". Mengklik dalam jeda ${this.stepDelay / 1000} detik...`, 'info');

        setTimeout(() => {
          Logger.log(`Mengklik tautan aktivitas: "${linkText}" (href: ${href})`, 'success');
          if (linkText.toLowerCase().includes('pengisian') || href.toLowerCase().includes('pengisian')) {
            chrome.storage.local.set({ currentCompPos: 1, subIdx: 0 }, () => {
              link.click();
            });
          } else {
            link.click();
          }
        }, this.stepDelay);
      } else {
        Logger.log(`Tidak menemukan tautan aktivitas di baris tabel untuk keyword "${keyword}".`, 'error');
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
          chrome.storage.local.set({ gateInSubmitted: true, gateInSaved: false }, () => {
            DOMUtils.clickElement(submitBtn);
            setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay + 1000);
          });
        }, this.stepDelay);
      };

      // ---------- 1. Status sudah Completed / sudah pernah submit ----------
      if (resStorage.gateInSubmitted || DOMUtils.isActivityStatusCompleted()) {
        Logger.log('Aktivitas Gate In terdeteksi COMPLETED / sudah disubmit. Kembali ke menu Proses...', 'success');
        chrome.storage.local.set({
          autofillStage: 'GATE_IN_SUBMITTED',
          gateInSubmitted: false,
          gateInSaved: false
        }, () => {
          setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay);
        });
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
    chrome.storage.local.get(['pengisianSubmitted'], (resStorage) => {
      if (resStorage.pengisianSubmitted || DOMUtils.isActivityStatusCompleted()) {
        Logger.log('Aktivitas Pengisian terdeteksi telah disubmit/COMPLETED. Mengarahkan kembali ke menu Proses...', 'success');
        chrome.storage.local.set({ autofillStage: 'PENGISIAN_SUBMITTED', pengisianSubmitted: false }, () => {
          setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay);
        });
        return;
      }

      Logger.log('Memeriksa status penginputan Pengisian...', 'info');

    chrome.storage.local.get(['subIdx'], (result) => {
      const subIdx = result.subIdx || 0;
      const totalLO = rowData.loList.length;

      const loInput = document.getElementById('LO');
      const isModalOpen = loInput && loInput.getBoundingClientRect().width > 0;

      if (subIdx < totalLO) {
        if (!isModalOpen) {
          const addBtn = document.getElementById('btn-add-modal') || document.querySelector('button[id*="add"]') || document.querySelector('.btn-primary');
          if (addBtn) {
            Logger.log(`Membuka modal untuk item pengisian LO ke-${subIdx + 1}/${totalLO} dalam ${this.stepDelay / 1000} detik...`, 'info');
            setTimeout(() => addBtn.click(), this.stepDelay);
          } else {
            Logger.log('Tombol Add Modal (#btn-add-modal) tidak terdeteksi.', 'error');
          }
        }
        else {
          Logger.log(`Mengisi detail Modal Pengisian item ke-${subIdx + 1}...`, 'info');

          const activeLO = rowData.loList[subIdx];
          const activeProduct = rowData.produk;

          const loInputEl = document.getElementById('LO') || document.getElementById('x_LO') || document.querySelector('input[id*="LO"]');
          if (loInputEl) {
            loInputEl.value = activeLO;
            loInputEl.dispatchEvent(new Event('change', { bubbles: true }));
            Logger.log(`Mengisi Nomor LO: ${activeLO}`, 'info');
          } else {
            Logger.log('Input LO (#LO) tidak ditemukan di modal.', 'warn');
          }

          const productSelect = document.getElementById('x_IdProduk') || document.getElementById('Produk') || document.querySelector('select[id*="Produk"]');
          if (productSelect) {
            Select2Helper.setSelectByValueOrText(productSelect, activeProduct)
              .then(() => Logger.log(`Memilih Produk: ${activeProduct}`, 'success'))
              .catch(err => Logger.log(`Gagal memilih Produk: ${err}`, 'warn'));
          }

          const isBlending = activeProduct.includes('SOLAR') || activeProduct.includes('BIOSOLAR') || activeProduct.includes('DEXLITE');
          const blendingCheckbox = document.getElementById('InLineBlending');

          if (isBlending) {
            if (blendingCheckbox && !blendingCheckbox.checked) {
              blendingCheckbox.checked = true;
              blendingCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
              Logger.log('Mengaktifkan In-Line Blending...', 'info');
            }

            setTimeout(() => this.fillTanksAndMeters(activeProduct, tankConfigs, rowData, totalLO, subIdx, compPos), 800);
          } else {
            if (blendingCheckbox && blendingCheckbox.checked) {
              blendingCheckbox.checked = false;
              blendingCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
            this.fillTanksAndMeters(activeProduct, tankConfigs, rowData, totalLO, subIdx, compPos);
          }
        }
      }
      else {
        Logger.log(`Seluruh baris detail LO selesai dimasukkan. Mengklik Submit Pengisian dalam jeda ${this.stepDelay / 1000} detik...`, 'success');
        const finalSubmitBtn = document.getElementById('btn-submit') || document.querySelector('button.btn-success');
        if (finalSubmitBtn) {
          setTimeout(() => {
            chrome.storage.local.set({ pengisianSubmitted: true }, () => {
              finalSubmitBtn.click();
            });
          }, this.stepDelay);
        } else {
          Logger.log('Tombol Submit final Pengisian (#btn-submit) tidak ditemukan.', 'error');
        }
      }
    });
  });
}

  fillTanksAndMeters(product, tankConfigs, rowData, totalLO, subIdx, compPos) {
    // Target spesifik #NomorTangki sesuai inspeksi DOM modal
    const tank1Select = document.getElementById('NomorTangki') ||
      document.getElementById('x_NomorTangki') ||
      document.getElementById('el_SubAktivitasDataMobilTangkiPengisian_NomorTangki1') ||
      document.querySelector('select[id*="Tangki"]');

    const tank2Select = document.getElementById('NomorTangki2') ||
      document.getElementById('x_NomorTangki2') ||
      document.getElementById('el_SubAktivitasDataMobilTangkiPengisian_NomorTangki2') ||
      document.querySelector('select[id*="Tangki2"]');

    let tank1Val = "";
    let tank2Val = "";
    const pUpper = product.trim().toUpperCase();

    if (pUpper.includes('SOLAR') || pUpper.includes('BIOSOLAR')) {
      tank1Val = tankConfigs['BIOSOLAR B50_1'] || tankConfigs['BIOSOLAR'] || '15';
      tank2Val = tankConfigs['BIOSOLAR B50_2'] || '8';
    } else if (pUpper.includes('DEXLITE')) {
      tank1Val = tankConfigs['DEXLITE_1'] || tankConfigs['DEXLITE'] || '15';
      tank2Val = tankConfigs['DEXLITE_2'] || '8';
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

    if (tank1Select) {
      Logger.log(`Memilih Tangki 1 (#${tank1Select.id}): "${tank1Val}"`, 'info');
      Select2Helper.setSelectByValueOrText(tank1Select, tank1Val)
        .then(() => Logger.log(`Berhasil memilih Tangki 1: ${tank1Val}`, 'success'))
        .catch(err => Logger.log(`Gagal memilih Tangki 1: ${err}`, 'error'));
    } else {
      Logger.log('Element Select Tangki 1 (#NomorTangki) tidak ditemukan!', 'error');
    }

    if (tank2Select && (pUpper.includes('SOLAR') || pUpper.includes('BIOSOLAR') || pUpper.includes('DEXLITE'))) {
      Logger.log(`Memilih Tangki 2 (#${tank2Select.id}): "${tank2Val}"`, 'info');
      Select2Helper.setSelectByValueOrText(tank2Select, tank2Val)
        .then(() => Logger.log(`Berhasil memilih Tangki 2: ${tank2Val}`, 'success'))
        .catch(err => Logger.log(`Gagal memilih Tangki 2: ${err}`, 'error'));
    }

    let bayVal = "";
    let meterVal = "";

    if (product.includes('DEXLITE') || product.includes('SOLAR') || product.includes('BIOSOLAR')) {
      bayVal = "6";
      meterVal = "1";
    } else if (product.includes('PERTALITE')) {
      bayVal = "1";
      meterVal = "1";
    } else if (product.includes('PERTAMAX')) {
      bayVal = "5";
      meterVal = "4";
    }

    const bayInput = document.getElementById('BayNumber');
    if (bayInput) {
      bayInput.value = bayVal;
      bayInput.dispatchEvent(new Event('change'));
    }
    const meterInput = document.getElementById('NoMeter');
    if (meterInput) {
      meterInput.value = meterVal;
      meterInput.dispatchEvent(new Event('change'));
    }
    Logger.log(`Set Bay: ${bayVal}, No Meter: ${meterVal}`, 'info');

    const volInput = document.getElementById('Volume');
    const pieceVolume = (rowData.volume / totalLO) * 1000;
    if (volInput) {
      volInput.value = pieceVolume;
      volInput.dispatchEvent(new Event('change'));
      Logger.log(`Set Volume: ${pieceVolume} Liter`, 'info');
    }

    Logger.log('Menunggu sistem mengisi otomatis Meter Awal dan Meter Akhir...', 'info');

    let attempts = 0;
    const pollInterval = setInterval(() => {
      attempts++;
      const mAwal = document.getElementById('MeterAwal') || document.querySelector('[id*="MeterAwal"]');
      const mAkhir = document.getElementById('MeterAkhir') || document.querySelector('[id*="MeterAkhir"]');

      const isReady = mAwal && mAkhir && mAwal.value.trim() !== "" && mAkhir.value.trim() !== "";

      if (isReady || attempts > 20) {
        clearInterval(pollInterval);
        if (!isReady) {
          Logger.log('Peringatan: Meter Awal/Akhir belum terisi otomatis setelah 10 detik, memaksakan pengisian kompartemen...', 'warn');
        } else {
          Logger.log(`Meter terverifikasi. Awal: ${mAwal.value}, Akhir: ${mAkhir.value}`, 'success');
        }

        const numCompNeeded = Math.ceil((rowData.volume / totalLO) / 8);
        const comps = [];
        for (let i = 0; i < numCompNeeded; i++) {
          comps.push(compPos + i);
        }
        const compStr = comps.join('.');

        const compInput = document.getElementById('NomorKompartment');
        if (compInput) {
          compInput.value = compStr;
          compInput.dispatchEvent(new Event('change'));
          Logger.log(`Mengisi Nomor Kompartemen: ${compStr}`, 'success');
        }

        setTimeout(() => {
          const modalAddBtn = document.getElementById('btn-save-detail') || document.querySelector('.modal-footer button.btn-success') || document.querySelector('.modal-footer button.btn-primary');
          if (modalAddBtn) {
            Logger.log(`Mengklik Simpan Detail modal... Menunggu jeda ${this.stepDelay / 1000} detik untuk submit...`, 'info');

            chrome.storage.local.set({
              subIdx: subIdx + 1,
              currentCompPos: compPos + numCompNeeded
            }, () => {
              setTimeout(() => {
                modalAddBtn.click();

                setTimeout(() => {
                  window.location.reload();
                }, this.stepDelay);
              }, this.stepDelay);
            });
          } else {
            Logger.log('Tombol Simpan Modal/Detail tidak terdeteksi.', 'error');
          }
        }, 1000);
      }
    }, 500);
  }
}

/// Handler Halaman 6: Formulir MT Gate Out
class GateOutPageHandler extends BasePageHandler {
  handle(rowData, stage) {
    chrome.storage.local.get(['gateOutSubmitted'], (resStorage) => {
      // 1. Prioritas Utama: Cek dulu apakah tombol Submit (#btn-completed / #btn-completedEdit) visible ada
      const completedBtn = Array.from(document.querySelectorAll('#btn-completed, #btn-completedEdit, button.btn-success'))
        .find(btn => DOMUtils.isVisible(btn) && (btn.id.includes('completed') || btn.textContent.trim().toLowerCase().includes('submit')));

      if (completedBtn) {
        Logger.log(`Tombol Submit final Gate Out (#${completedBtn.id || 'btn-completed'}) terdeteksi! Mengirimkan data Gate Out final...`, 'success');
        setTimeout(() => {
          chrome.storage.local.set({ gateOutSubmitted: true }, () => {
            DOMUtils.clickElement(completedBtn);
            setTimeout(() => DOMUtils.goToProsesPage(), this.stepDelay + 1000);
          });
        }, this.stepDelay);
        return;
      }

      // 2. Baru kalau tombol Submit TIDAK ADA / belum visible, cek apakah transaksi sudah COMPLETED atau pernah disubmit
      if (resStorage.gateOutSubmitted || DOMUtils.isActivityStatusCompleted()) {
        Logger.log('Aktivitas Gate Out terdeteksi telah disubmit/COMPLETED. Bergerak ke transaksi berikutnya...', 'success');
        chrome.storage.local.get(['currentIndex'], (resIdx) => {
          const nextIdx = (resIdx.currentIndex || 0) + 1;
          chrome.storage.local.set({
            currentIndex: nextIdx,
            autofillStage: 'CREATE_PENYALURAN',
            gateOutSubmitted: false
          }, () => {
            const penyaluranLink = document.querySelector('a[href*="PenyaluranList"]') ||
              document.querySelector('a[href*="penyaluran_list"]') ||
              document.querySelector('a[href*="penyaluranlist"]');
            if (penyaluranLink) {
              setTimeout(() => penyaluranLink.click(), this.stepDelay);
            } else {
              setTimeout(() => { window.location.href = '/PenyaluranList'; }, this.stepDelay);
            }
          });
        });
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

  initAutofill() {
    chrome.storage.local.get(['autofillActive', 'excelData', 'currentIndex', 'autofillStage', 'tankConfigs', 'currentCompPos'], (res) => {
      if (!res.autofillActive || !res.excelData || res.excelData.length === 0) {
        return;
      }

      const idx = res.currentIndex || 0;
      if (idx >= res.excelData.length) {
        Logger.log('Semua data di Excel telah selesai diproses!', 'success');
        chrome.storage.local.set({ autofillActive: false });
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

    if (path.includes('penyaluranlist') || path.includes('penyaluran_list') || document.getElementById('btn-add-penyaluran')) {
      this.listHandler.handle(rowData, stage);
    }
    else if (path.includes('penyaluranadd') || path.includes('penyaluran_add')) {
      this.penyaluranAddHandler.handle(rowData, stage);
    }
    else if (path.includes('aktivitaslist') || path.includes('aktivitas_list') ||
      path.includes('proseslist') || path.includes('proses_list') ||
      document.getElementById('el1_Aktivitas_Aktivitas2') || document.getElementById('el1_Proses_Aktivitas2')) {
      this.processBridgeHandler.handle(rowData, stage);
    }
    else if (document.getElementById('el_SubAktivitasDataMobilTangkiMTGateIn_AMT') || path.includes('gatein')) {
      this.gateInHandler.handle(rowData, stage);
    }
    else if (document.getElementById('btn-add-modal') || path.includes('pengisian')) {
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
  }
}

// Instantiate and start engine automatically
const engine = new AutofillEngine();
engine.start();

