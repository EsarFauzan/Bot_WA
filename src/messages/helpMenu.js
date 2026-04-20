function buildHelpMenu(currentMode = 'normal') {
    return `🤖 *ASISTEN PRIBADI ESARFAUZAN*
Mode aktif: *${String(currentMode).toUpperCase()}*
─────────────────────

📥 *Download*
!ig [link] → Download reels/post IG
!tiktok [link] → Download video TikTok
!yt [link] → Download video YouTube
!yt audio [link] → Download MP3 YouTube

🎬 *Video HD for Story*
Kirim video as *Dokumen* → bot optimize & kirim balik
!storyin → Reply video dokumen → convert HD

🖼️ *Stiker & Edit Foto*
Kirim foto/GIF + caption *stiker* → auto jadi stiker
!stiker → Reply foto/GIF → jadikan stiker
!rmbg → Hapus background foto → dikirim sebagai stiker transparan
!upscale → Perbesar kualitas foto hingga 2048px 🔍
!kompres → Kompres ukuran foto 📦
!qr [teks/link] → Buat QR Code dari teks/link
Kirim/reply foto + *!qr* → Buat QR dari gambar 🖼️

🎭 *Ganti Mode*
!mode normal → Mode biasa
!mode gombal → Mode gombal 💕
!mode serious → Mode serius
!mode story → Mode cerita

🌤️ *Cuaca & Sholat*
!cuaca [kota] → Cek cuaca kota
!sholat [kota] → Jadwal sholat hari ini

📖 *Al-Quran*
!quran → Penjelasan menu Quran
!quran [surah] → Info surah
!quran [surah] [ayat] → Baca ayat spesifik

🔔 *Reminder Otomatis (Grup)*
!reminder on [kota] → Aktifkan reminder sholat
!reminder off → Nonaktifkan reminder
!reminder → Cek status reminder

📚 *Jadwal Kuliah*
!jadwal → Lihat jadwal kuliah
!jadwal on → Aktifkan reminder kuliah (grup)
!jadwal off → Nonaktifkan reminder kuliah
!jadwal tambah [hari] | [mulai] | [selesai] | [matkul]
!jadwal ubah [no] | [hari] | [mulai] | [selesai] | [matkul]
!jadwal hapus [no]

📝 *Catatan Grup*
!catat [isi] → Simpan catatan
!notes → Lihat semua catatan
!hapus note [no] → Hapus catatan

📋 *To-Do List Pribadi*
!todo → Lihat daftar tugas
!todo tambah [tugas] → Tambah tugas
!todo coret [no,no] → Tandai selesai banyak sekaligus
!todo hapus [no,no] → Hapus tugas banyak sekaligus

⏰ *Pengingat / Alarm*
!ingatkan [waktu] | [pesan]

🎓 *Info Akademik*
!akademik → Lihat semua link
!akademik [nama] → Cari link
!akademik tambah [nama] | [desk] | [url] → Tambah link
!akademik hapus [no/nama] → Hapus link

📝 *Countdown Ujian*
!ujian → Lihat countdown ujian
!ujian tambah [nama] | [DD-MM-YYYY] → Tambah jadwal
!ujian hapus [no] → Hapus jadwal ujian

🎌 *Anime*
!anime [judul] → Cari anime di Kusonime

📿 *Zikir & Doa*
!zikir → Menu zikir & doa
!zikir pagi → Zikir pagi
!zikir sore → Zikir sore
!zikir harian → Zikir harian
!zikir tidur → Doa sebelum tidur
!zikir makan → Doa makan & minum
!zikir random → Zikir acak
!zikir auto on → Aktifkan auto zikir di chat ini
!zikir auto off → Matikan auto zikir
!zikir auto → Cek status & jadwal auto zikir

👨‍💻 *GitHub Tracker*
!github [username] → Cek profil GitHub

⚙️ *Lainnya*
!stats → Statistik chat
!health → Status kesehatan bot
!reset → Reset riwayat
!menu → Tampilkan menu ini
─────────────────────
`;
}

module.exports = {
    buildHelpMenu
};
