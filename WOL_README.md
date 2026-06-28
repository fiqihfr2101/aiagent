# 🌐 Wake-on-LAN Setup untuk H.E.R.M.E.S. Dashboard

## 📋 Overview

Computer lu bisa dinyalakan dari jarak jauh menggunakan Wake-on-LAN (WoL) via Hermes Agent di VPS.

**Computer:** 192.168.0.111
**MAC Address:** 9C:69:D3:70:D7:03
**Dashboard:** http://192.168.0.111:3000

---

## 🚀 Cara Pakai

### **Nyalain Computer dari VPS:**
```bash
# Di VPS, jalankan salah satu:

# Option 1: Bash script
./scripts/wake-computer.sh

# Option 2: Python script
python3 scripts/wake-computer.py

# Option 3: Manual
wakeonlan -i 255.255.255.255 9C:69:D3:70:D7:03
```

### **Cek Status Computer:**
```bash
# Ping check
ping 192.168.0.111

# Dashboard check
curl http://192.168.0.111:3000
```

---

## 📁 Files

| File | Fungsi |
|------|--------|
| `scripts/wake-computer.sh` | Bash WoL script |
| `scripts/wake-computer.py` | Python WoL script |

---

## 🔧 Setup di VPS

### **1. Install wakeonlan:**
```bash
# Ubuntu/Debian
sudo apt install wakeonlan

# CentOS/RHEL
sudo yum install wakeonlan

# macOS
brew install wakeonlan
```

### **2. Copy scripts ke VPS:**
```bash
# Dari computer lu
scp -r scripts/ user@vps-ip:~/hermes-agent/

# Atau di VPS
git clone https://github.com/fiqihfr2101/aiagent.git
```

### **3. Test WoL:**
```bash
# Di VPS
cd ~/hermes-agent
python3 scripts/wake-computer.py
```

---

## 🎯 Integrasi dengan Hermes Agent di VPS

### **Option 1: Pakai Skill**
Buat skill `wake-computer` di VPS:
```bash
mkdir -p ~/.hermes/skills/wake-computer
```

Buat file `~/.hermes/skills/wake-computer/SKILL.md`:
```markdown
---
name: wake-computer
description: Wake up local computer using Wake-on-LAN
---

# Wake Computer Skill

## When to Use
- User wants to turn on their local computer remotely
- Dashboard is not accessible because computer is off

## How to Run
1. Check if computer is online: `ping 192.168.0.111`
2. If offline, send WoL: `wakeonlan -i 255.255.255.255 9C:69:D3:70:D7:03`
3. Wait 30-60 seconds for computer to boot
4. Verify dashboard: `curl http://192.168.0.111:3000`

## Quick Reference
```bash
wakeonlan -i 255.255.255.255 9C:69:D3:70:D7:03
```

## Verification
- Check if computer is online: `ping 192.168.0.111`
- Check if dashboard is accessible: `curl http://192.168.0.111:3000`
```

### **Option 2: Pakai Plugin**
Buat plugin `~/.hermes/plugins/wol/plugin.py`:
```python
"""Wake-on-LAN plugin for Hermes Agent."""

import socket
import struct

def wake_computer(mac_address: str, broadcast: str = '255.255.255.255') -> str:
    """Send Wake-on-LAN magic packet to wake up a computer."""
    try:
        mac_bytes = bytes.fromhex(mac_address.replace(':', '').replace('-', ''))
        magic_packet = b'\xff' * 6 + mac_bytes * 16
        
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(magic_packet, (broadcast, 9))
        sock.close()
        
        return f"✅ WoL packet sent to {mac_address}"
    except Exception as e:
        return f"❌ Failed to send WoL: {str(e)}"

def register(ctx):
    """Register WoL tools with Hermes."""
    ctx.register_tool(
        name="wake_computer",
        description="Wake up a computer using Wake-on-LAN",
        handler=lambda args: wake_computer(
            mac_address=args.get("mac_address"),
            broadcast=args.get("broadcast", "255.255.255.255")
        ),
        schema={
            "name": "wake_computer",
            "description": "Wake up a computer using Wake-on-LAN magic packet",
            "parameters": {
                "type": "object",
                "properties": {
                    "mac_address": {
                        "type": "string",
                        "description": "MAC address of the computer to wake (format: XX:XX:XX:XX:XX:XX)"
                    },
                    "broadcast": {
                        "type": "string",
                        "description": "Broadcast IP address (default: 255.255.255.255)",
                        "default": "255.255.255.255"
                    }
                },
                "required": ["mac_address"]
            }
        }
    )
```

---

## 🔄 Alur Kerja

```
User: "Hermes, nyalain computer gw"
    ↓
Hermes Agent (VPS)
    ↓
Cek status: ping 192.168.0.111
    ↓
Jika OFF → Kirim WoL packet
    ↓
Tunggu 30-60 detik
    ↓
Cek lagi: ping 192.168.0.111
    ↓
Jika ON → "Computer nyala! Dashboard: http://192.168.0.111:3000"
```

---

## ⚠️ Troubleshooting

### **Computer tidak mau nyala:**
1. Cek kabel Ethernet terhubung
2. Cek power supply terhubung
3. Cek WoL enabled di BIOS
4. Cek WoL enabled di Windows
5. Cek firewall tidak block WoL packets

### **WoL packet tidak terkirim:**
1. Cek `wakeonlan` installed
2. Cek MAC address benar
3. Cek broadcast address benar
4. Cek network connectivity

### **Computer nyala tapi dashboard tidak accessible:**
1. Tunggu 1-2 menit buat Docker containers start
2. Cek Docker containers running: `docker ps`
3. Cek backend: `curl http://192.168.0.111:8000/health`
4. Cek frontend: `curl http://192.168.0.111:3000`

---

## 📊 Ringkasan

| Item | Value |
|------|-------|
| **MAC Address** | 9C:69:D3:70:D7:03 |
| **IP Address** | 192.168.0.111 |
| **Broadcast** | 255.255.255.255 |
| **Dashboard** | http://192.168.0.111:3000 |
| **API** | http://192.168.0.111:8000 |

---

## 🎯 Contoh Penggunaan

### **Nyalain Computer:**
```bash
# Di VPS
wakeonlan -i 255.255.255.255 9C:69:D3:70:D7:03

# Tunggu 30-60 detik

# Cek status
ping 192.168.0.111

# Akses dashboard
curl http://192.168.0.111:3000
```

### **Cek Status:**
```bash
# Ping check
ping 192.168.0.111

# Dashboard check
curl http://192.168.0.111:3000

# API check
curl http://192.168.0.111:8000/health
```

---

**Computer:** 192.168.0.111
**MAC:** 9C:69:D3:70:D7:03
**Dashboard:** http://192.168.0.111:3000
