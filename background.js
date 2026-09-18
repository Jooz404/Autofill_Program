// Background Service Worker untuk Pengelolaan Multi-Tab Master-Worker
console.log('[Autofill Background] Service worker initialized.');

// Side Panel Behavior: Buka Side Panel secara otomatis saat ikon diklik
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(err => console.log('Side panel config note:', err));
}

// Pool pencatat Tab Pekerja yang sedang aktif
const activeWorkerTabs = new Set();
const activeWorkerPlates = new Map(); // tabId -> nopol
const DEFAULT_MAX_WORKERS = 3;

// Listener pesan dari Content Scripts (Master Tab / Worker Tabs)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'OPEN_WORKER_TAB') {
    chrome.storage.local.get(['maxWorkerTabs'], (resConfig) => {
      const maxWorkers = resConfig.maxWorkerTabs || DEFAULT_MAX_WORKERS;

      if (activeWorkerTabs.size >= maxWorkers) {
        console.warn(`[Autofill Background] Batas kuota tab pekerja (${maxWorkers}) tercapai. Menolak pembukaan tab baru.`);
        sendResponse({ success: false, reason: 'MAX_WORKERS_REACHED', activeCount: activeWorkerTabs.size, max: maxWorkers });
        return;
      }

      const reqNopol = request.rowData && request.rowData.nopol ? String(request.rowData.nopol).trim().toUpperCase() : null;
      if (reqNopol) {
        const isAlreadyProcessing = Array.from(activeWorkerPlates.values()).includes(reqNopol);
        if (isAlreadyProcessing) {
          console.warn(`[Autofill Background] Plat ${reqNopol} sedang dikerjakan oleh Tab Pekerja lain. Menolak pembukaan tab duplikat.`);
          sendResponse({ success: false, reason: 'PLATE_ALREADY_PROCESSING', activeCount: activeWorkerTabs.size, max: maxWorkers });
          return;
        }
      }

      console.log(`[Autofill Background] Membuka Tab Pekerja Baru untuk URL: ${request.url} (Nopol: ${reqNopol || 'N/A'})`);
      chrome.tabs.create({ url: request.url, active: false }, (newTab) => {
        if (newTab && newTab.id) {
          activeWorkerTabs.add(newTab.id);
          if (reqNopol) activeWorkerPlates.set(newTab.id, reqNopol);
          console.log(`[Autofill Background] Tab Pekerja #${newTab.id} berhasil dibuka untuk ${reqNopol || 'N/A'}. Total aktif: ${activeWorkerTabs.size}/${maxWorkers}`);

          // Simpan info konteks row ke storage lokal per-tab
          chrome.storage.local.set({
            [`worker_data_${newTab.id}`]: {
              rowIndex: request.rowIndex,
              rowData: request.rowData,
              loNumber: request.loNumber
            }
          }, () => {
            sendResponse({ success: true, tabId: newTab.id, activeCount: activeWorkerTabs.size, max: maxWorkers });
          });
        } else {
          sendResponse({ success: false, reason: 'TAB_CREATION_FAILED' });
        }
      });
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === 'GET_WORKER_CONTEXT') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      chrome.storage.local.get([`worker_data_${tabId}`], (res) => {
        const data = res[`worker_data_${tabId}`] || null;
        if (data) {
          activeWorkerTabs.add(tabId);
          if (data.rowData && data.rowData.nopol) {
            activeWorkerPlates.set(tabId, String(data.rowData.nopol).trim().toUpperCase());
          }
          sendResponse({ isWorker: true, tabId: tabId, workerData: data });
        } else {
          sendResponse({ isWorker: false, tabId: tabId, workerData: null });
        }
      });
    } else {
      sendResponse({ isWorker: false, tabId: tabId, workerData: null });
    }
    return true;
  }

  if (request.action === 'WORKER_TASK_COMPLETED') {
    const tabId = sender.tab ? sender.tab.id : request.tabId;
    console.log(`[Autofill Background] Menerima sinyal penyelesaian dari Tab Pekerja #${tabId}. Menutup tab...`);

    if (tabId) {
      activeWorkerTabs.delete(tabId);
      activeWorkerPlates.delete(tabId);
      chrome.storage.local.remove([`worker_data_${tabId}`]);
      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError) {
          // Tab may already be closed by user
        }
        console.log(`[Autofill Background] Tab Pekerja #${tabId} telah ditutup. Sisa tab aktif: ${activeWorkerTabs.size}`);

        // Cek jika master sedang menunggu dan seluruh pekerja sudah selesai
        chrome.storage.local.get(['waitingForWorkers', 'excelData', 'currentIndex'], (resStorage) => {
          if (resStorage.waitingForWorkers && activeWorkerTabs.size === 0) {
            console.log('[Autofill Background] Master selesai dispatch dan seluruh Tab Pekerja telah menyelesaikan tugas. Menghentikan otomasi.');
            chrome.storage.local.set({ autofillActive: false, waitingForWorkers: false });
          }
        });

        sendResponse({ success: true, activeCount: activeWorkerTabs.size });
      });
    } else {
      sendResponse({ success: true });
    }
    return true;
  }

  if (request.action === 'GET_ACTIVE_WORKER_COUNT') {
    chrome.storage.local.get(['maxWorkerTabs'], (resConfig) => {
      const maxWorkers = resConfig.maxWorkerTabs || DEFAULT_MAX_WORKERS;
      sendResponse({ count: activeWorkerTabs.size, max: maxWorkers, activePlates: Array.from(activeWorkerPlates.values()) });
    });
    return true;
  }
});

// Listener saat tab ditutup secara manual oleh pengguna
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeWorkerTabs.has(tabId)) {
    activeWorkerTabs.delete(tabId);
    activeWorkerPlates.delete(tabId);
    chrome.storage.local.remove([`worker_data_${tabId}`]);
    console.log(`[Autofill Background] Tab Pekerja #${tabId} ditutup manual oleh user. Sisa tab aktif: ${activeWorkerTabs.size}`);
    
    chrome.storage.local.get(['waitingForWorkers'], (resStorage) => {
      if (resStorage.waitingForWorkers && activeWorkerTabs.size === 0) {
        console.log('[Autofill Background] Seluruh tab pekerja ditutup. Menghentikan otomasi.');
        chrome.storage.local.set({ autofillActive: false, waitingForWorkers: false });
      }
    });
  }
});

