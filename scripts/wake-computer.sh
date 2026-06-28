#!/bin/bash
# ============================================================
# Wake-on-LAN Script dengan Tailscale
# Computer: 100.108.172.112 (Tailscale)
# MAC: 9C:69:D3:70:D7:03
# ============================================================

# Configuration
MAC_ADDRESS="9C:69:D3:70:D7:03"
TAILSCALE_IP="100.108.172.112"
BROADCAST="255.255.255.255"
DASHBOARD_URL="http://100.108.172.112:3000"
API_URL="http://100.108.172.112:8000"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  H.E.R.M.E.S. Wake-on-LAN Script${NC}"
echo -e "${YELLOW}  (via Tailscale)${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Check if wakeonlan is installed
if ! command -v wakeonlan &> /dev/null; then
    echo -e "${RED}ERROR: wakeonlan not installed!${NC}"
    echo "Install with: sudo apt install wakeonlan"
    exit 1
fi

# Check current status via Tailscale
echo -e "${YELLOW}[1/3] Checking current status (via Tailscale)...${NC}"
if ping -c 1 -W 1 $TAILSCALE_IP &> /dev/null; then
    echo -e "${GREEN}✅ Computer is already ON${NC}"
    echo ""
    echo -e "Dashboard: ${GREEN}$DASHBOARD_URL${NC}"
    echo -e "API: ${GREEN}$API_URL${NC}"
    exit 0
else
    echo -e "${RED}❌ Computer is OFF${NC}"
fi

# Send WoL packet
echo ""
echo -e "${YELLOW}[2/3] Sending Wake-on-LAN packet...${NC}"
echo -e "MAC Address: ${GREEN}$MAC_ADDRESS${NC}"
echo -e "Broadcast: ${GREEN}$BROADCAST${NC}"

wakeonlan -i $BROADCAST $MAC_ADDRESS

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ WoL packet sent successfully!${NC}"
else
    echo -e "${RED}❌ Failed to send WoL packet${NC}"
    exit 1
fi

# Wait for computer to boot
echo ""
echo -e "${YELLOW}[3/3] Waiting for computer to boot...${NC}"
echo -e "(This may take 30-60 seconds)"
echo ""

MAX_ATTEMPTS=30
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))
    echo -ne "\r${YELLOW}Checking... ($ATTEMPT/$MAX_ATTEMPTS)${NC}"
    
    if ping -c 1 -W 1 $TAILSCALE_IP &> /dev/null; then
        echo ""
        echo ""
        echo -e "${GREEN}========================================${NC}"
        echo -e "${GREEN}  Computer is now ON! (via Tailscale)${NC}"
        echo -e "${GREEN}========================================${NC}"
        echo ""
        echo -e "Dashboard: ${GREEN}$DASHBOARD_URL${NC}"
        echo -e "API: ${GREEN}$API_URL${NC}"
        echo ""
        echo -e "${YELLOW}Tip: It may take 1-2 minutes for Docker containers to start${NC}"
        exit 0
    fi
    
    sleep 2
done

echo ""
echo ""
echo -e "${RED}========================================${NC}"
echo -e "${RED}  Timeout: Computer did not respond${NC}"
echo -e "${RED}========================================${NC}"
echo ""
echo -e "${YELLOW}Possible issues:${NC}"
echo -e "1. Computer is not connected to power"
echo -e "2. Ethernet cable is disconnected"
echo -e "3. Wake-on-LAN is not enabled in BIOS"
echo -e "4. Wake-on-LAN is not enabled in Windows"
echo -e "5. Firewall is blocking WoL packets"
echo ""
exit 1
