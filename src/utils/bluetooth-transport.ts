// Web Bluetooth Transport for BitChat
// Implements BLE-based mesh networking for offline peer-to-peer messaging
// Note: Web Bluetooth has limitations - true passive discovery isn't possible in browsers

/// <reference path="../types/bluetooth.d.ts" />

import type { BitChatTransport } from './bitchat-core';
import { Capacitor } from '@capacitor/core';

// BitChat BLE Service UUID (custom for BitChat protocol)
const BITCHAT_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const BITCHAT_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
const BITCHAT_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export interface BluetoothPeer {
  device: BluetoothDevice;
  server?: BluetoothRemoteGATTServer;
  service?: BluetoothRemoteGATTService;
  txCharacteristic?: BluetoothRemoteGATTCharacteristic;
  rxCharacteristic?: BluetoothRemoteGATTCharacteristic;
  lastSeen: number;
  isConnected: boolean;
}

export class WebBluetoothTransport extends EventTarget implements BitChatTransport {
  private isInitialized = false;
  private peers: Map<string, BluetoothPeer> = new Map();
  private reconnectInterval?: number;

  constructor() {
    super();
  }

  // Check if Web Bluetooth is supported
  static isSupported(): boolean {
    return 'bluetooth' in navigator && !!navigator.bluetooth;
  }

  // Check if BitChat is compatible with current browser
  static getBrowserCompatibility(): {
    supported: boolean;
    browser: string;
    recommendations?: string[];
  } {
    const userAgent = navigator.userAgent;
    const isBrave = (navigator as any).brave && (navigator as any).brave.isBrave;

    if (isBrave) {
      return {
        supported: false,
        browser: 'Brave',
        recommendations: [
          'Enable Web Bluetooth in brave://flags/',
          'Or use Chrome/Edge for full compatibility'
        ]
      };
    }

    if (userAgent.includes('Chrome') || userAgent.includes('Edg')) {
      const isCapacitor = Capacitor.isNativePlatform();
      return {
        supported: this.isSupported(),
        browser: isCapacitor ? 'Capacitor (Mobile App)' : 'Chrome',
        recommendations: isCapacitor ? [
          'Use QR codes for pairing when Bluetooth auto-discovery fails',
          'Ensure location permissions are granted for Bluetooth'
        ] : undefined
      };
    }

    if (userAgent.includes('Firefox')) {
      return {
        supported: false,
        browser: 'Firefox',
        recommendations: [
          'Firefox doesn\'t support Web Bluetooth',
          'Use Chrome, Edge, or Opera for BitChat BLE features'
        ]
      };
    }

    return {
      supported: this.isSupported(),
      browser: 'Unknown'
    };
  }

  // Initialize the Bluetooth transport
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.isInitialized = true;

      // Start passive discovery immediately
      this.startPassiveDiscovery();

      this.dispatchEvent(new CustomEvent('initialized'));
    } catch (error) {
      console.error('Failed to initialize Bluetooth transport:', error);
      throw error;
    }
  }  // Shutdown the transport
  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    this.stopScanning();
    
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }

    // Disconnect from all peers
    for (const peer of Array.from(this.peers.values())) {
      if (peer.server?.connected) {
        peer.server.disconnect();
      }
    }
    
    this.peers.clear();
    this.isInitialized = false;
    
    this.dispatchEvent(new CustomEvent('shutdown'));
  }

  // Send message to specific peer
  async sendMessage(data: Uint8Array, recipient?: string): Promise<void> {
    if (!recipient) {
      return this.broadcastMessage(data);
    }

    const peer = this.peers.get(recipient);
    if (!peer || !peer.isConnected || !peer.txCharacteristic) {
      throw new Error(`Peer ${recipient} not connected`);
    }

    try {
      // Split large messages into chunks if needed
      const chunks = this.chunkData(data);
      
      for (const chunk of chunks) {
        const buffer = new ArrayBuffer(chunk.length);
        new Uint8Array(buffer).set(chunk);
        await peer.txCharacteristic.writeValue(buffer);
      }
      
      console.log(`📤 Sent message to peer ${recipient}`);
      
    } catch (error) {
      console.error(`Failed to send message to peer ${recipient}:`, error);
      throw error;
    }
  }

  // Broadcast message to all connected peers
  async broadcastMessage(data: Uint8Array): Promise<void> {
    const connectedPeers = Array.from(this.peers.values()).filter(p => p.isConnected);
    
    if (connectedPeers.length === 0) {
      console.warn('No connected peers for broadcast');
      return;
    }

    const promises = connectedPeers.map(async (peer) => {
      try {
        if (peer.txCharacteristic) {
          const chunks = this.chunkData(data);
          for (const chunk of chunks) {
            const buffer = new ArrayBuffer(chunk.length);
            new Uint8Array(buffer).set(chunk);
            await peer.txCharacteristic.writeValue(buffer);
          }
        }
      } catch (error) {
        console.error(`Failed to broadcast to peer ${peer.device.id}:`, error);
      }
    });

    await Promise.allSettled(promises);
    console.log(`📡 Broadcasted message to ${connectedPeers.length} peers`);
  }

  // Start scanning for BitChat peers (passive first, dialog as fallback)
  async startScanning(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Transport not initialized');
    }

    // First try passive discovery
    this.startPassiveDiscovery();

    // If user explicitly wants to scan, we can still offer the dialog as an option
    // but make it clear it's optional
    try {
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth not supported');
      }

      // Only open dialog if explicitly requested by user
      // For now, just continue with passive mode
      this.dispatchEvent(new CustomEvent('scanComplete', {
        detail: { devicesFound: 0, error: null, passiveMode: true }
      }));

    } catch (error) {
      this.dispatchEvent(new CustomEvent('scanComplete', {
        detail: { devicesFound: 0, error: (error as Error).message }
      }));
      throw error;
    }
  }

  // Start passive discovery mode (always listening)
  private startPassiveDiscovery(): void {
    console.log('🔍 Starting BitChat Bluetooth discovery with Nostr coordination...');

    // Announce our Bluetooth availability via Nostr (if available)
    this.announceBluetoothAvailability();

    // Set up periodic scanning for devices without user interaction
    this.reconnectInterval = window.setInterval(async () => {
      try {
        console.log('🔍 Scanning for BitChat devices...');

        // Try to discover devices without opening dialog (limited by Web Bluetooth API)
        if (navigator.bluetooth) {
          // Attempt passive discovery - this may not find devices but keeps us ready
          this.dispatchEvent(new CustomEvent('passiveMode', {
            detail: { isActive: true, message: 'BitChat Bluetooth ready - use "Active Discovery" to connect' }
          }));

          // Note: Web Bluetooth doesn't support true passive discovery
          // The dialog must be opened by user gesture when they want to connect
        }
      } catch (error) {
        console.error('❌ Discovery error:', error);
      }
    }, 10000); // Check every 10 seconds (less aggressive)

    // Emit initial passive mode event
    this.dispatchEvent(new CustomEvent('passiveMode', {
      detail: { isActive: true, message: 'BitChat Bluetooth ready - waiting for connections' }
    }));

    console.log('✅ Bluetooth discovery started - use Active Discovery button to connect to devices');
  }

  // Announce our Bluetooth availability via Nostr for coordination
  private announceBluetoothAvailability(): void {
    try {
      // Create a Bluetooth availability announcement
      const announcement = {
        type: 'bluetooth_available',
        deviceName: `BitChat-${Date.now().toString().slice(-4)}`,
        capabilities: ['ble', 'gatt_server'],
        timestamp: Date.now(),
        userAgent: navigator.userAgent
      };

      // Emit event that Nostr transport can listen to
      this.dispatchEvent(new CustomEvent('bluetoothAnnouncement', {
        detail: announcement
      }));

      console.log('📡 Announced Bluetooth availability for Nostr coordination');
    } catch (error) {
      console.warn('Failed to announce Bluetooth availability:', error);
    }
  }

  // Connect to a discovered Bluetooth device
  private async connectToDevice(device: BluetoothDevice): Promise<void> {
    try {
      console.log('🔗 Connecting to device:', device.name || device.id);

      // Check if already connected
      if (this.peers.has(device.id) && this.peers.get(device.id)!.isConnected) {
        console.log('📱 Device already connected');
        return;
      }

      // Get GATT server
      const server = await device.gatt!.connect();
      console.log('🔗 GATT server connected');

      // Get BitChat service
      const service = await server.getPrimaryService(BITCHAT_SERVICE_UUID);
      console.log('🔗 BitChat service found');

      // Get characteristics
      const txCharacteristic = await service.getCharacteristic(BITCHAT_TX_CHARACTERISTIC_UUID);
      const rxCharacteristic = await service.getCharacteristic(BITCHAT_RX_CHARACTERISTIC_UUID);

      // Create or update peer
      const peer: BluetoothPeer = {
        device,
        server,
        service,
        txCharacteristic,
        rxCharacteristic,
        lastSeen: Date.now(),
        isConnected: true
      };

      this.peers.set(device.id, peer);

      // Set up disconnect handler
      device.addEventListener('gattserverdisconnected', () => {
        if (this.peers.has(device.id)) {
          this.peers.get(device.id)!.isConnected = false;
          this.dispatchEvent(new CustomEvent('peerDisconnected', {
            detail: { peerId: device.id }
          }));
        }
      });

      // Start listening for incoming messages
      await this.startListening(peer);

      // Emit connected event
      this.dispatchEvent(new CustomEvent('peerConnected', {
        detail: {
          peer: {
            fingerprint: device.id,
            publicKey: new Uint8Array(),
            nickname: device.name || `Bluetooth Device ${device.id.slice(0, 8)}`,
            lastSeen: Date.now(),
            isOnline: true,
            transport: 'bluetooth'
          }
        }
      }));

    } catch (error) {
      console.error('Failed to connect to device:', error);
      throw error;
    }
  }

  // Start listening for incoming messages from a peer
  private async startListening(peer: BluetoothPeer): Promise<void> {
    if (!peer.rxCharacteristic) return;

    try {
      await peer.rxCharacteristic.startNotifications();
      peer.rxCharacteristic.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = event.target.value;
        if (value) {
          const data = new Uint8Array(value.buffer);

          this.dispatchEvent(new CustomEvent('messageReceived', {
            detail: {
              data,
              peerId: peer.device.id,
              transport: 'bluetooth'
            }
          }));
        }
      });
    } catch (error) {
      console.error('Failed to start listening:', error);
    }
  }

  // Split data into BLE-compatible chunks
  private chunkData(data: Uint8Array, maxChunkSize: number = 20): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    
    for (let i = 0; i < data.length; i += maxChunkSize) {
      const chunk = data.slice(i, i + maxChunkSize);
      chunks.push(chunk);
    }
    
    return chunks;
  }



  // Get connected peers
  getConnectedPeers(): BluetoothPeer[] {
    return Array.from(this.peers.values()).filter(p => p.isConnected);
  }

  // Get peer count
  getPeerCount(): number {
    return this.getConnectedPeers().length;
  }

  // Stop scanning for peers
  private stopScanning(): void {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = undefined;
    }
  }

  // Manual peer discovery trigger - now passive by default
  async discoverPeers(): Promise<void> {
    // Start passive discovery immediately without user interaction
    this.startPassiveDiscovery();
  }

  // Active discovery with user interaction (fallback option)
  async discoverPeersWithDialog(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Transport not initialized');
    }

    try {
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth not supported');
      }

      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [BITCHAT_SERVICE_UUID] },
          { namePrefix: 'BitChat' },
          { namePrefix: 'bitChat' },
          { namePrefix: 'BITCHAT' }
        ],
        optionalServices: [BITCHAT_SERVICE_UUID]
      });

      // Connect to the device
      await this.connectToDevice(device);

      // Emit success event
      this.dispatchEvent(new CustomEvent('scanComplete', {
        detail: { devicesFound: 1, error: null }
      }));

    } catch (error) {
      if ((error as any).name === 'NotFoundError') {
        this.dispatchEvent(new CustomEvent('scanComplete', {
          detail: { devicesFound: 0, error: null }
        }));
      } else if ((error as any).name === 'NotAllowedError') {
        this.dispatchEvent(new CustomEvent('scanComplete', {
          detail: { devicesFound: 0, error: 'permission_denied' }
        }));
      } else {
        this.dispatchEvent(new CustomEvent('scanComplete', {
          detail: { devicesFound: 0, error: (error as Error).message }
        }));
        throw error;
      }
    }
  }
}
