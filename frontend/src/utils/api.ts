// Utility to get the API base URL dynamically
// When accessed from Cloudflare domain, it uses HTTPS api-orc.routex.web.id
// When accessed locally, it uses localhost:8000
// When accessed via IP, it uses IP:8000

export function getApiBaseUrl(): string {
  // Check if we're in the browser
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  }
  
  // If NEXT_PUBLIC_API_URL is set, use it
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  const hostname = window.location.hostname;
  
  // Production
  if (hostname === 'orc.routex.web.id') {
    return 'https://api-orc.routex.web.id';
  }
  
  // Staging
  if (hostname === 'staging-orc.routex.web.id') {
    return 'https://staging-api-orc.routex.web.id';
  }
  
  // If accessed via localhost, use localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  
  // Otherwise, use the current hostname with port 8000
  return `http://${hostname}:8000`;
}

export function getWsBaseUrl(): string {
  // Check if we're in the browser
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
  }
  
  // If NEXT_PUBLIC_WS_URL is set, use it
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  
  const hostname = window.location.hostname;
  
  // Production
  if (hostname === 'orc.routex.web.id') {
    return 'wss://api-orc.routex.web.id/ws';
  }
  
  // Staging
  if (hostname === 'staging-orc.routex.web.id') {
    return 'wss://staging-api-orc.routex.web.id/ws';
  }
  
  // If accessed via localhost, use localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ws://localhost:8000/ws';
  }
  
  // Otherwise, use the current hostname with port 8000
  return `ws://${hostname}:8000/ws`;
}

// Export the base URLs
export const API_BASE = getApiBaseUrl();
export const WS_BASE = getWsBaseUrl();
