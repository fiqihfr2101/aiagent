#!/usr/bin/env python3
"""
Wake-on-LAN Script untuk H.E.R.M.E.S. Dashboard
Computer: 192.168.0.111
MAC: 9C:69:D3:70:D7:03
"""

import socket
import struct
import sys
import time
import subprocess
import platform

# Configuration
MAC_ADDRESS = "9C:69:D3:70:D7:03"
BROADCAST = "255.255.255.255"
COMPUTER_IP = "192.168.0.111"
DASHBOARD_URL = "http://192.168.0.111:3000"
API_URL = "http://192.168.0.111:8000"

def send_wol(mac_address: str, broadcast: str = '255.255.255.255') -> bool:
    """Send Wake-on-LAN magic packet."""
    try:
        # Parse MAC address
        mac_bytes = bytes.fromhex(mac_address.replace(':', '').replace('-', ''))
        
        # Magic packet: 6x 0xFF + 16x MAC address
        magic_packet = b'\xff' * 6 + mac_bytes * 16
        
        # Kirim via UDP broadcast
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(magic_packet, (broadcast, 9))
        sock.close()
        
        return True
    except Exception as e:
        print(f"❌ Error sending WoL: {e}")
        return False

def ping_host(ip: str, timeout: int = 1) -> bool:
    """Ping a host to check if it's online."""
    try:
        # Determine ping command based on OS
        param = '-n' if platform.system().lower() == 'windows' else '-c'
        timeout_param = '-w' if platform.system().lower() == 'windows' else '-W'
        
        result = subprocess.run(
            ['ping', param, '1', timeout_param, str(timeout), ip],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        return result.returncode == 0
    except:
        return False

def main():
    """Main function."""
    print("=" * 50)
    print("  H.E.R.M.E.S. Wake-on-LAN Script")
    print("=" * 50)
    print()
    
    # Check current status
    print("[1/3] Checking current status...")
    if ping_host(COMPUTER_IP):
        print("✅ Computer is already ON")
        print()
        print(f"Dashboard: {DASHBOARD_URL}")
        print(f"API: {API_URL}")
        return 0
    else:
        print("❌ Computer is OFF")
    
    # Send WoL packet
    print()
    print("[2/3] Sending Wake-on-LAN packet...")
    print(f"MAC Address: {MAC_ADDRESS}")
    print(f"Broadcast: {BROADCAST}")
    
    if send_wol(MAC_ADDRESS, BROADCAST):
        print("✅ WoL packet sent successfully!")
    else:
        print("❌ Failed to send WoL packet")
        return 1
    
    # Wait for computer to boot
    print()
    print("[3/3] Waiting for computer to boot...")
    print("(This may take 30-60 seconds)")
    print()
    
    max_attempts = 30
    for attempt in range(1, max_attempts + 1):
        sys.stdout.write(f"\rChecking... ({attempt}/{max_attempts})")
        sys.stdout.flush()
        
        if ping_host(COMPUTER_IP):
            print()
            print()
            print("=" * 50)
            print("  Computer is now ON!")
            print("=" * 50)
            print()
            print(f"Dashboard: {DASHBOARD_URL}")
            print(f"API: {API_URL}")
            print()
            print("Tip: It may take 1-2 minutes for Docker containers to start")
            return 0
        
        time.sleep(2)
    
    print()
    print()
    print("=" * 50)
    print("  Timeout: Computer did not respond")
    print("=" * 50)
    print()
    print("Possible issues:")
    print("1. Computer is not connected to power")
    print("2. Ethernet cable is disconnected")
    print("3. Wake-on-LAN is not enabled in BIOS")
    print("4. Wake-on-LAN is not enabled in Windows")
    print("5. Firewall is blocking WoL packets")
    print()
    return 1

if __name__ == '__main__':
    sys.exit(main())
