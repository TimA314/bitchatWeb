// Web Bluetooth Transport for BitChat
// Implements BLE-based mesh networking for offline peer-to-peer messaging

import type { BitChatTransport } from './bitchat-core';

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
  private isScanning = false;
  private peers: Map<string, BluetoothPeer> = new Map();
  private scanTimeout?: number;
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
      return {
        supported: this.isSupported(),
        browser: userAgent.includes('Edg') ? 'Edge' : 'Chrome'
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
    
    if (!WebBluetoothTransport.isSupported()) {
      throw new Error('Web Bluetooth not supported in this browser');
    }

    try {
      // Check Bluetooth availability
      const available = await navigator.bluetooth!.getAvailability();
      if (!available) {
        throw new Error('Bluetooth not available on this device');
      }

      this.isInitialized = true;
      this.startPeerDiscovery();
      this.startReconnectService();
      
      console.log('🔵 Web Bluetooth transport initialized');
      this.dispatchEvent(new CustomEvent('initialized'));
      
    } catch (error) {
      console.error('Failed to initialize Bluetooth transport:', error);
      throw error;
    }
  }

  // Shutdown the transport
  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    this.stopScanning();
    
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }

    // Disconnect from all peers
    for (const peer of this.peers.values()) {
      if (peer.server?.connected) {
        peer.server.disconnect();
      }
    }
    
    this.peers.clear();
    this.isInitialized = false;
    
    console.log('🔵 Web Bluetooth transport shutdown');
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

  // Start scanning for BitChat peers
  private async startPeerDiscovery(): Promise<void> {
    if (this.isScanning) return;

    try {
      this.isScanning = true;
      
      // Scan for devices advertising BitChat service
      const device = await navigator.bluetooth!.requestDevice({
        filters: [
          { services: [BITCHAT_SERVICE_UUID] }
        ],
        optionalServices: [BITCHAT_SERVICE_UUID]
      });

      await this.connectToPeer(device);
      
    } catch (error: any) {
      if (error.name === 'NotFoundError') {
        console.log('🔍 No BitChat devices found in this scan');
      } else if (error.name === 'SecurityError') {
        console.warn('🔒 Bluetooth access requires user interaction');
        // Don't retry automatically on security errors
        this.isScanning = false;
        throw new Error('Bluetooth permission required - please try again after clicking a button');
      } else {
        console.error('Peer discovery failed:', error);
        throw error;
      }
    } finally {
      this.isScanning = false;
      
      // Only schedule next scan if no security error occurred
      if (this.isScanning !== false) {
        this.scanTimeout = window.setTimeout(() => {
          this.startPeerDiscovery();
        }, 10000); // Scan every 10 seconds
      }
    }
  }

  // Connect to a discovered peer
  private async connectToPeer(device: BluetoothDevice): Promise<void> {
    try {
      const peer: BluetoothPeer = {
        device,
        lastSeen: Date.now(),
        isConnected: false
      };

      this.peers.set(device.id, peer);

      // Connect to GATT server
      const server = await device.gatt!.connect();
      peer.server = server;

      // Get BitChat service
      const service = await server.getPrimaryService(BITCHAT_SERVICE_UUID);
      peer.service = service;

      // Get characteristics
      peer.txCharacteristic = await service.getCharacteristic(BITCHAT_TX_CHARACTERISTIC_UUID);
      peer.rxCharacteristic = await service.getCharacteristic(BITCHAT_RX_CHARACTERISTIC_UUID);

      // Set up notifications for incoming data
      await peer.rxCharacteristic.startNotifications();
      peer.rxCharacteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
        this.handleIncomingData(event.target as BluetoothRemoteGATTCharacteristic, device.id);
      });

      // Handle disconnection
      device.addEventListener('gattserverdisconnected', () => {
        this.handlePeerDisconnected(device.id);
      });

      peer.isConnected = true;
      
      console.log(`🔗 Connected to peer: ${device.name || device.id}`);
      this.dispatchEvent(new CustomEvent('peerConnected', { 
        detail: { peerId: device.id, device } 
      }));

      // Emit peer discovered event
      this.dispatchEvent(new CustomEvent('peerDiscovered', {
        detail: {
          peer: {
            fingerprint: device.id,
            publicKey: new Uint8Array(), // Will be exchanged during handshake
            nickname: device.name || 'Unknown',
            lastSeen: Date.now(),
            isOnline: true,
            transport: 'ble'
          }
        }
      }));

    } catch (error) {
      console.error(`Failed to connect to peer ${device.id}:`, error);
      this.peers.delete(device.id);
    }
  }

  // Handle incoming data from peer
  private handleIncomingData(characteristic: BluetoothRemoteGATTCharacteristic, peerId: string): void {
    const data = new Uint8Array(characteristic.value!.buffer);
    
    // Update peer last seen
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.lastSeen = Date.now();
    }

    console.log(`📥 Received data from peer ${peerId}:`, data.length, 'bytes');
    
    this.dispatchEvent(new CustomEvent('messageReceived', {
      detail: {
        data,
        peerId,
        transport: 'ble'
      }
    }));
  }

  // Handle peer disconnection
  private handlePeerDisconnected(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.isConnected = false;
    }

    console.log(`❌ Peer disconnected: ${peerId}`);
    this.dispatchEvent(new CustomEvent('peerDisconnected', { 
      detail: { peerId } 
    }));
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

  // Stop scanning for peers
  private stopScanning(): void {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = undefined;
    }
    this.isScanning = false;
  }

  // Start reconnection service for dropped connections
  private startReconnectService(): void {
    this.reconnectInterval = window.setInterval(() => {
      for (const [peerId, peer] of this.peers.entries()) {
        if (!peer.isConnected && peer.device.gatt) {
          // Try to reconnect
          this.connectToPeer(peer.device).catch(() => {
            // Remove peer if reconnection fails repeatedly
            const timeSinceLastSeen = Date.now() - peer.lastSeen;
            if (timeSinceLastSeen > 60000) { // 1 minute
              this.peers.delete(peerId);
            }
          });
        }
      }
    }, 30000); // Check every 30 seconds
  }

  // Get connected peers
  getConnectedPeers(): BluetoothPeer[] {
    return Array.from(this.peers.values()).filter(p => p.isConnected);
  }

  // Get peer count
  getPeerCount(): number {
    return this.getConnectedPeers().length;
  }

  // Manual peer discovery trigger
  async discoverPeers(): Promise<void> {
    if (!this.isScanning) {
      await this.startPeerDiscovery();
    }
  }
}
