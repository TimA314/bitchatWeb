// BitChat Protocol Implementation
// Unified implementation using proper bitchat-qudag WASM protocol
// with Web Bluetooth transport for offline peer-to-peer messaging

export * from './bitchat-core';
export * from './bluetooth-transport';
export * from './nostr-transport';

import { BitChatProtocol } from './bitchat-core';
import { WebBluetoothTransport } from './bluetooth-transport';
import { NostrTransport } from './nostr-transport';

// Create and configure the main BitChat instance
export async function createBitChatInstance(): Promise<BitChatProtocol> {
  const bitchat = new BitChatProtocol();

  // Add Bluetooth transport as primary for offline peer-to-peer communication
  if (WebBluetoothTransport.isSupported()) {
    const bluetoothTransport = new WebBluetoothTransport();
    bitchat.addTransport(bluetoothTransport);
    console.log('� Added Bluetooth transport (primary for offline messaging)');
  } else {
    console.log('� Bluetooth not supported - offline messaging unavailable');
  }

  // Add Nostr transport for online connectivity (optional)
  const nostrTransport = new NostrTransport();
  bitchat.addTransport(nostrTransport);
  console.log('� Added Nostr transport (online connectivity)');

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

// Bluetooth permission and pairing functions
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (!WebBluetoothTransport.isSupported()) {
    console.warn('Bluetooth not supported in this browser');
    return false;
  }

  try {
    // Check current permission state
    const result = await navigator.permissions.query({ name: 'bluetooth' as PermissionName });
    if (result.state === 'granted') {
      console.log('Bluetooth permission already granted');
      return true;
    }

    // Request permission via device selection (user gesture required)
    console.log('Requesting Bluetooth permission...');
    const device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['bitchat-service'], // BitChat service UUID
    });

    if (device) {
      console.log('Bluetooth device selected:', device.name);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Bluetooth permission request failed:', error);
    return false;
  }
}

export async function startBluetoothDiscovery(): Promise<void> {
  const bitchat = await getBitChatInstance();
  console.log('Starting Bluetooth discovery...');
  await bitchat.startBluetoothDiscovery();
}
