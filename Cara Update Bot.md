Cara Update Bot:

1\. Di PC kamu — edit kode, lalu push ke GitHub:	

git add .

git commit -m "tambah fitur baru"

git push origin main

2\. Di terminal Droplet — pull perubahan:

cd Bot\_WA

git pull origin main

pm2 restart bot-wa



biar Lebih Mudah — Buat Script Auto Update:

nano update.sh



Isi dengan:

cd /root/Bot\_WA

git pull origin main

npm install

pm2 restart bot-wa

echo "Bot berhasil diupdate!"



Simpan CTRL+X → Y → Enter



Jadikan executable:

chmod +x update.sh



Kalau mau update bot cukup jalankan:

./update.sh



Tinggal buka PowerShell lagi di PC kamu dan ketik:

ssh root@152.42.181.24





Berikut hal penting yang perlu kamu ketahui:



🔧 Perintah Penting PM2

pm2 logs bot-wa		:Lihat log bot

pm2 restart bot-wa	:Restart bot

pm2 stop bot-wa		:Stop bot

pm2 status		:Cek status bot



⚠️ Hal Penting

1\. Jangan sampai Credit Digital Ocean habis

Pantau credit di cloud.digitalocean.com/billing

$200 credit dari GitHub Education Pack



2\. Jika Bot Tidak Merespon

pm2 restart bot-wa

pm2 logs bot-wa



3\. Jika QR Code Expired / Logout

cd Bot\_WA

rm -rf .wwebjs\_auth

pm2 restart bot-wa

pm2 logs bot-wa



🔒 Keamanan

Ganti password root agar server aman:

passwd



Backup Session WhatsApp

Folder .wwebjs\_auth berisi sesi WhatsApp. Jika terhapus kamu harus scan QR ulang. Jangan dihapus sembarangan!



&nbsp;Monitor Server

Cek penggunaan RAM \& CPU:

htop

Tekan Q untuk keluar



Auto Restart Jika Bot Crash

PM2 sudah otomatis restart jika bot crash, tapi pastikan sudah menjalankan:

pm2 startup

pm2 save



Jika Server Direboot

\# Cek apakah bot jalan

pm2 status

\# Jika tidak jalan

pm2 resurrect



💡 Tips Hemat Credit

Droplet $6/bulan = ~$72/tahun

Credit $200 cukup untuk ±2.5 tahun ✅

Matikan Droplet jika tidak dipakai untuk hemat credit

📱 Nomor WhatsApp Bot

Gunakan nomor cadangan bukan nomor utama

Karena WhatsApp Web hanya bisa 1 device aktif

