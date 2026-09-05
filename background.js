// Background Service Worker untuk Pengelolaan Multi-Tab Master-Worker
console.log('[Autofill Background] Service worker initialized.');

// Pool pencatat Tab Pekerja yang sedang aktif
const activeWorkerTabs = new Set();
const MAX_CONCURRENT_WORKERS = 3;

// Listener pesan dari Content Scripts (Master Tab / Worker Tabs)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'OPEN_WORKER_TAB') {
    if (activeWorkerTabs.size >= MAX_CONCURRENT_WORKERS) {
      console.warn(`[Autofill Background] Batas kuota tab pekerja (${MAX_CONCURRENT_WORKERS}) tercapai. Menolak pembukaan tab baru.`);
      sendResponse({ success: false, reason: 'MAX_WORKERS_REACHED', activeCount: activeWorkerTabs.size });
      return true;
    }

    console.log(`[Autofill Background] Membuka Tab Pekerja Baru untuk URL: ${request.url}`);
    chrome.tabs.create({ url: request.url, active: false }, (newTab) => {
      if (newTab && newTab.id) {
        activeWorkerTabs.add(newTab.id);
        console.log(`[Autofill Background] Tab Pekerja #${newTab.id} berhasil dibuka. Total aktif: ${activeWorkerTabs.size}`);
        
        // Simpan info konteks row ke storage lokal per-tab
        chrome.storage.local.set({
          [`worker_data_${newTab.id}`]: {
            rowIndex: request.rowIndex,
            rowData: request.rowData,
            loNumber: request.loNumber
          }
        }, () => {
          sendResponse({ success: true, tabId: newTab.id, activeCount: activeWorkerTabs.size });
        });
      } else {
        sendResponse({ success: false, reason: 'TAB_CREATION_FAILED' });
      }
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === 'WORKER_TASK_COMPLETED') {
    const tabId = sender.tab ? sender.tab.id : request.tabId;
    console.log(`[Autofill Background] Menerima sinyal penyelesaian dari Tab Pekerja #${tabId}. Menutup tab...`);

    if (tabId && activeWorkerTabs.has(tabId)) {
      activeWorkerTabs.delete(tabId);
      chrome.storage.local.remove([`worker_data_${tabId}`]);
      chrome.tabs.remove(tabId, () => {
        console.log(`[Autofill Background] Tab Pekerja #${tabId} telah ditutup. Sisa tab aktif: ${activeWorkerTabs.size}`);
        sendResponse({ success: true, activeCount: activeWorkerTabs.size });
      });
    } else {
      sendResponse({ success: true });
    }
    return true;
  }

  if (request.action === 'GET_ACTIVE_WORKER_COUNT') {
    sendResponse({ count: activeWorkerTabs.size, max: MAX_CONCURRENT_WORKERS });
    return true;
  }
});

// Listener saat tab ditutup secara manual oleh pengguna
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeWorkerTabs.has(tabId)) {
    activeWorkerTabs.delete(tabId);
    chrome.storage.local.remove([`worker_data_${tabId}`]);
    console.log(`[Autofill Background] Tab Pekerja #${tabId} ditutup manual oleh user. Sisa tab aktif: ${activeWorkerTabs.size}`);
  }
});
