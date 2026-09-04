/**
 * Kirim indikator "typing..." ke chat — murni kosmetik, bukan bagian dari
 * eksekusi command.
 *
 * `msg.getChat()` / `chat.sendStateTyping()` bisa gagal, mis. untuk chat
 * dengan format alamat baru `@lid` yang belum tersedia di store WhatsApp Web,
 * atau saat koneksi sedang tidak stabil. Kalau sampai error, command TIDAK
 * boleh ikut gagal — jadi error di sini dicatat lalu diabaikan.
 */
async function safeTyping(msg) {
    try {
        const chat = await msg.getChat();
        if (chat && typeof chat.sendStateTyping === 'function') {
            await chat.sendStateTyping();
        }
    } catch (e) {
        console.error('[TYPING] diabaikan (tidak memengaruhi command):', e && e.message ? e.message : e);
    }
}

module.exports = {
    safeTyping
};