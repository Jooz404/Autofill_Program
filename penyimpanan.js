//penyimpanan.js
(
    function () {
        console.log("Script penyimpanan.js berhasil dimuat!");

        //1. Cek URL Halaman
        const currentUrl =
            window.location.pathname.toLowerCase()
            ;

        // Memastikan bot hanya berjalan pada URL halaman 'penyimpanan' atau 'closingstock'
        if
            (!currentUrl.includes('penimbunanpenyaluranlist') && !currentUrl.includes('closingstocklist')) {
            return; //Menghentikan script jika tidak berada di halaman target
        }

        console.log("[Penyimpanan] Berada di halaman target (Penyimpanan / Closing Stock). Siap memproses otomasi.");
    })();