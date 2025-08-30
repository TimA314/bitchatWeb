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
  
  // Add Bluetooth transport if supported
  if (WebBluetoothTransport.isSupported()) {
    const bluetoothTransport = new WebBluetoothTransport();
    bitchat.addTransport(bluetoothTransport);
    console.log('🔵 Added Bluetooth transport');
  } else {
    console.log('🔵 Bluetooth transport not supported');
  }

  // Add Nostr transport for online connectivity
  const nostrTransport = new NostrTransport();
  bitchat.addTransport(nostrTransport);
  console.log('🟣 Added Nostr transport');

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

export async function startBitChat(): Promise<void> {
  const bitchat = await getBitChatInstance();
  await bitchat.start();
}

export async function stopBitChat(): Promise<void> {
  if (bitchatInstance) {
    await bitchatInstance.stop();
  }
}

// Event subscription helpers
export async function onMessage(handler: (event: Event) => void): Promise<void> {
  const bitchat = await getBitChatInstance();
  bitchat.addEventListener('messageReceived', handler);
}

export async function onPeerDiscovered(handler: (event: Event) => void): Promise<void> {
  const bitchat = await getBitChatInstance();
  bitchat.addEventListener('peerDiscovered', handler);
}

export async function getIdentity() {
  const bitchat = await getBitChatInstance();
  return bitchat.getIdentity();
}

export async function getPeers() {
  const bitchat = await getBitChatInstance();
  return bitchat.getPeers();
}

export async function getOnlinePeers() {
  const bitchat = await getBitChatInstance();
  return bitchat.getOnlinePeers();
}
