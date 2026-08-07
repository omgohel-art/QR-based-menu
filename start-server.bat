@echo off
cd /d "C:\Users\omgoh\OneDrive\Desktop\QR based menu\cafe-qr-ordering"
del server.log 2>nul
del server-error.log 2>nul
node --import tsx server/_core/index.ts > server.log 2> server-error.log