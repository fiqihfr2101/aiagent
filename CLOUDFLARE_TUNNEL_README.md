# 🌐 Cloudflare Tunnel Setup untuk H.E.R.M.E.S. Dashboard

## 📋 Overview

Dashboard H.E.R.M.E.S. bisa diakses dari internet menggunakan Cloudflare Tunnel.

**Domain:** `orc.frackment.id`
**Dashboard:** `https://orc.frackment.id`
**API:** `https://api.orc.frackment.id`

---

## 🚀 Quick Start

### **Step 1: Setup Tunnel (Sekali saja)**
```bash
# Jalankan setup script
setup-cloudflare-tunnel.bat
```

**Yang perlu dilakukan:**
1. Login ke Cloudflare (browser terbuka)
2. Pilih domain: `frackment.id`
3. Authorize
4. Copy Tunnel ID
5. Tambah DNS records di Cloudflare

### **Step 2: Start Tunnel**
```bash
# Jalankan tunnel
start-tunnel.bat
```

### **Step 3: Akses Dashboard**
```
https://orc.frackment.id
```

---

## 📁 Files

| File | Fungsi |
|------|--------|
| `cloudflared.exe` | Cloudflare Tunnel binary |
| `setup-cloudflare-tunnel.bat` | Setup script (jalankan sekali) |
| `start-tunnel.bat` | Start tunnel |
| `stop-tunnel.bat` | Stop tunnel |
| `~/.cloudflared/config.yml` | Konfigurasi tunnel |

---

## 🔧 Manual Setup

### **1. Login ke Cloudflare**
```bash
cloudflared tunnel login
```

### **2. Buat Tunnel**
```bash
cloudflared tunnel create hermes-dashboard
```

### **3. Buat Config File**
```yaml
# ~/.cloudflared/config.yml
tunnel: <TUNNEL_ID>
credentials-file: ~/.hermes/<TUNNEL_ID>.json

ingress:
  - hostname: orc.frackment.id
    service: http://localhost:3000
    originRequest:
      noTLSVerify: true
  
  - hostname: api.orc.frackment.id
    service: http://localhost:8000
    originRequest:
      noTLSVerify: true
  
  - service: http_status:404
```

### **4. Setup DNS di Cloudflare**

1. Buka: https://dash.cloudflare.com
2. Pilih domain: `frackment.id`
3. Klik **DNS** → **Records**
4. Tambah 2 CNAME records:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | orc | `<TUNNEL_ID>.cfargotunnel.com` | ✅ Proxied |
| CNAME | api.orc | `<TUNNEL_ID>.cfargotunnel.com` | ✅ Proxied |

### **5. Jalankan Tunnel**
```bash
cloudflared tunnel run hermes-dashboard
```

---

## 🔄 Auto-Start (Task Scheduler)

### **Buat Task Scheduler:**
1. Buka **Task Scheduler**
2. Klik **Create Basic Task**
3. **Name:** `Hermes Cloudflare Tunnel`
4. **Trigger:** At startup
5. **Action:** Start a program
6. **Program/script:** `C:\Users\qoinj\cloudflared.exe`
7. **Add arguments:** `tunnel run hermes-dashboard`
8. **Finish**

---

## 🧪 Testing

### **Cek Tunnel Status:**
```bash
cloudflared tunnel info hermes-dashboard
```

### **Cek DNS:**
```bash
nslookup orc.frackment.id
```

### **Test API:**
```bash
curl https://api.orc.frackment.id/health
```

**Expected:**
```json
{"status":"ok","temporal":true}
```

### **Test Dashboard:**
Buka browser: `https://orc.frackment.id`

---

## 🔒 Security

### **Kelebihan Cloudflare Tunnel:**
- ✅ **Tidak buka port** - Aman dari serangan
- ✅ **HTTPS otomatis** - SSL di-manage Cloudflare
- ✅ **DDoS protection** - Cloudflare protect
- ✅ **WAF** - Web Application Firewall

### **Authentication:**
- Dashboard punya JWT auth
- Cloudflare bisa tambah Zero Trust auth
- Bisa setup IP whitelist

---

## 🐛 Troubleshooting

### **Tunnel tidak bisa connect:**
```bash
# Cek cloudflared version
cloudflared --version

# Cek config file
cat ~/.cloudflared/config.yml

# Cek tunnel info
cloudflared tunnel info hermes-dashboard
```

### **DNS tidak resolve:**
```bash
# Cek DNS
nslookup orc.frackment.id

# Flush DNS
ipconfig /flushdns
```

### **Dashboard tidak bisa diakses:**
```bash
# Cek backend running
curl http://localhost:8000/health

# Cek frontend running
curl http://localhost:3000

# Cek Docker containers
docker ps | grep aiagent
```

### **Tunnel disconnect:**
```bash
# Restart tunnel
stop-tunnel.bat
start-tunnel.bat
```

---

## 📊 Monitoring

### **Cek Tunnel Logs:**
```bash
# Di Windows
cloudflared tunnel run hermes-dashboard --loglevel debug

# Atau cek file log
notepad %USERPROFILE%\.cloudflared\*.log
```

### **Cek Cloudflare Analytics:**
1. Buka: https://dash.cloudflare.com
2. Pilih domain: `frackment.id`
3. Klik **Analytics**

---

## 💡 Tips

1. **Auto-start:** Setup Task Scheduler untuk auto-start saat boot
2. **Monitoring:** Cek Cloudflare Analytics untuk traffic
3. **Logs:** Simpan logs untuk troubleshooting
4. **Backup:** Backup `~/.cloudflared/` folder

---

## 📞 Support

**Masalah?**
1. Cek logs: `cloudflared tunnel run --loglevel debug`
2. Cek docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
3. Cek status: https://www.cloudflarestatus.com/

---

**Domain:** `orc.frackment.id`
**Dashboard:** `https://orc.frackment.id`
**API:** `https://api.orc.frackment.id`
