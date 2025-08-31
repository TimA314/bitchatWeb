// BitChat Protocol Implementation
// Unified implementation using proper bitchat-qudag WASM protocol
// with Web Bluetooth and Nostr transports

export * from './bitchat-core';
export * from './bluetooth-transport';
export * from './nostr-transport';

import { BitChatProtocol } from './bitchat-core';
import { WebBluetoothTransport } from './bluetooth-transport';
import { NostrTransport } from './nostr-transport';

// Create and configure the main BitChat instance
export async function createBitChatInstance(): Promise<BitChatProtocol> {
  const bitchat = new BitChatProtocol();

  // Add Nostr transport for online connectivity (primary transport)
  const nostrTransport = new NostrTransport();
  bitchat.addTransport(nostrTransport);
  console.log('🟣 Added Nostr transport (primary)');

  // Add Bluetooth transport only if explicitly requested (optional)
  // Bluetooth requires browser permissions and pairing dialogs
  if (WebBluetoothTransport.isSupported() && import.meta.env.DEV) {
    const bluetoothTransport = new WebBluetoothTransport();
    bitchat.addTransport(bluetoothTransport);
    console.log('🔵 Added Bluetooth transport (development only)');
  } else {
    console.log('🔵 Bluetooth transport disabled (production mode)');
  }

  // Initialize the protocol
  await bitchat.initialize();

  return bitchat;
}

// Singleton instance for the app
let bitchatInstance: BitChatProtocol | null = null;

export async function getBitChatInstance(): Promise<BitChatProtocol> {
  if (!bitchatInstance) {
    bitchatInstance = await createBitChatInstance();
  }
  return bitchatInstance;
}

// Quick access functions
export async function sendMessage(content: string, recipient?: string): Promise<string> {
  const bitchat = await getBitChatInstance();
  return bitchat.sendMessage(content, recipient);
}

export async function getIdentity(): Promise<any> {
  const bitchat = await getBitChatInstance();
  return bitchat.getIdentity();
}

export async function getPeers(): Promise<any[]> {
  const bitchat = await getBitChatInstance();
  return bitchat.getPeers();
}
