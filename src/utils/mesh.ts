// BitChat Protocol Mesh Networking
// Compatibility layer for existing UI components

/// <reference path="../types/bluetooth.d.ts" />

import { getBitChatInstance } from './bitchat';
import { type BitChatPeer, BitChatProtocol } from './bitchat-core';
import { WebBluetoothTransport } from './bluetooth-transport';

// Legacy compatibility interfaces for existing UI
export interface MeshNetwork {
  id: string;
  name: string;
  nodes: MeshNode[];
  topology: 'star' | 'mesh' | 'ring';
}

export interface MeshNode {
  id: string;
  name: string;
  device?: BluetoothDevice;
  isConnected: boolean;
  signal: number;
  lastSeen: Date;
  hops: number;
  capabilities: string[];
  metadata: {
    version?: string;
    nodeType?: 'relay' | 'endpoint' | 'bridge';
  };
}

// Mesh Network Manager - compatibility wrapper
export class MeshNetworkManager extends EventTarget {
  private bitchat: BitChatProtocol | null = null;
  private networks = new Map<string, MeshNetwork>();
  private isInitialized = false;
  private bluetoothTransport: WebBluetoothTransport | null = null;

  constructor() {
    super();
  }

  private async initializeBitChat() {
    if (!this.isInitialized) {
      this.bitchat = await getBitChatInstance();
      
      // Create our own Bluetooth transport instance for direct access
      if (WebBluetoothTransport.isSupported()) {
        this.bluetoothTransport = new WebBluetoothTransport();
        await this.bluetoothTransport.initialize();
      }
      
      this.initializeEventHandlers();
      this.isInitialized = true;
      
      // Start networking automatically for passive discovery
      if (this.bitchat) {
        await this.bitchat.start();
      }
    }
  }

  private initializeEventHandlers() {
    if (!this.bitchat) return;

    // Listen to BitChat events and translate them to legacy mesh events
    this.bitchat.addEventListener('peerConnected', (event: any) => {
      this.handlePeerConnected(event.detail);
    });

    this.bitchat.addEventListener('peerDisconnected', (event: any) => {
      this.handlePeerDisconnected(event.detail);
    });

    this.bitchat.addEventListener('messageReceived', (event: any) => {
      this.handleMessageReceived(event.detail);
    });

    // Listen to Bluetooth transport events if available
    if (this.bluetoothTransport) {
      this.bluetoothTransport.addEventListener('peerDiscovered', (event: any) => {
        this.handlePeerConnected(event.detail.peer);
      });

      this.bluetoothTransport.addEventListener('peerConnected', (event: any) => {
        this.handlePeerConnected(event.detail.peer);
      });

      this.bluetoothTransport.addEventListener('peerDisconnected', (event: any) => {
        // Create a minimal BitChatPeer object for disconnection
        const disconnectedPeer: BitChatPeer = {
          fingerprint: event.detail.peerId,
          publicKey: new Uint8Array(),
          lastSeen: Date.now(),
          isOnline: false,
          transport: 'ble'
        };
        this.handlePeerDisconnected(disconnectedPeer);
      });

      this.bluetoothTransport.addEventListener('messageReceived', (event: any) => {
        this.handleMessageReceived(event.detail);
      });

      this.bluetoothTransport.addEventListener('scanComplete', (event: any) => {
        // Forward scan results to UI
        this.dispatchEvent(new CustomEvent('bluetoothScanComplete', { detail: event.detail }));
      });

      this.bluetoothTransport.addEventListener('passiveMode', (event: any) => {
        this.dispatchEvent(new CustomEvent('bluetoothPassiveMode', { detail: event.detail }));
      });
    }
  }

  private handlePeerConnected(peer: BitChatPeer) {
    // Convert BitChat peer to MeshNode format
    const node: MeshNode = {
      id: peer.fingerprint,
      name: peer.nickname || `Device ${peer.fingerprint.slice(0, 8)}`,
      isConnected: peer.isOnline,
      signal: 50, // Default signal strength
      lastSeen: new Date(peer.lastSeen),
      hops: 1,
      capabilities: [], // BitChat doesn't track capabilities in the same way
      metadata: {
        nodeType: 'endpoint'
      }
    };

    // Add to default network
    const defaultNetwork = this.getOrCreateNetwork('default');
    const existingIndex = defaultNetwork.nodes.findIndex(n => n.id === node.id);
    if (existingIndex >= 0) {
      defaultNetwork.nodes[existingIndex] = node;
    } else {
      defaultNetwork.nodes.push(node);
    }

    this.dispatchEvent(new CustomEvent('nodeConnected', { detail: node }));
    this.dispatchEvent(new CustomEvent('networkUpdated', { detail: defaultNetwork }));
  }

  private handlePeerDisconnected(peer: BitChatPeer) {
    const defaultNetwork = this.getOrCreateNetwork('default');
    const nodeIndex = defaultNetwork.nodes.findIndex(n => n.id === peer.fingerprint);
    
    if (nodeIndex >= 0) {
      const node = defaultNetwork.nodes[nodeIndex];
      node.isConnected = false;
      
      this.dispatchEvent(new CustomEvent('nodeDisconnected', { detail: node }));
      this.dispatchEvent(new CustomEvent('networkUpdated', { detail: defaultNetwork }));
    }
  }

  private handleMessageReceived(data: { peerId: string; message: any }) {
    this.dispatchEvent(new CustomEvent('messageReceived', { detail: data }));
  }

  private getOrCreateNetwork(id: string): MeshNetwork {
    let network = this.networks.get(id);
    if (!network) {
      network = {
        id,
        name: id === 'default' ? 'BitChat Network' : `Network ${id}`,
        nodes: [],
        topology: 'mesh'
      };
      this.networks.set(id, network);
    }
    return network;
  }

  // Public API for compatibility
  async initialize(): Promise<void> {
    await this.initializeBitChat();
  }

  async startScanning(): Promise<void> {
    await this.initializeBitChat();
    if (this.bitchat) {
      await this.bitchat.start();
    }
  }

  async stopScanning(): Promise<void> {
    if (this.bitchat) {
      await this.bitchat.stop();
    }
  }

  async connectToNetwork(_networkId: string): Promise<boolean> {
    await this.initializeBitChat();
    // For now, just return true as BitChat handles network connections internally
    return true;
  }

  async startNetworking(): Promise<void> {
    await this.initializeBitChat();
    // Networking is already started in initializeBitChat
    // This method is kept for compatibility
  }

  async stopNetworking(): Promise<void> {
    if (this.bitchat) {
      await this.bitchat.stop();
    }
  }

  getNetworks(): MeshNetwork[] {
    return Array.from(this.networks.values());
  }

  getNetwork(id: string): MeshNetwork | undefined {
    return this.networks.get(id);
  }

  getConnectedNodes(): MeshNode[] {
    const defaultNetwork = this.getOrCreateNetwork('default');
    return defaultNetwork.nodes.filter(node => node.isConnected);
  }

  async sendMessage(message: any, targetNodeId?: string): Promise<void> {
    await this.initializeBitChat();
    if (this.bitchat) {
      if (targetNodeId) {
        await this.bitchat.sendMessage(JSON.stringify(message), targetNodeId);
      } else {
        await this.bitchat.sendMessage(JSON.stringify(message));
      }
    }
  }

  // Get Bluetooth transport for direct access
  getBluetoothTransport(): WebBluetoothTransport | null {
    return this.bluetoothTransport;
  }

  // Start Bluetooth device discovery
  async startBluetoothDiscovery(): Promise<void> {
    await this.initializeBitChat();
    if (this.bluetoothTransport) {
      await this.bluetoothTransport.discoverPeers();
    } else {
      throw new Error('Bluetooth transport not initialized');
    }
  }

  // Start active Bluetooth discovery with user dialog
  async startActiveBluetoothDiscovery(): Promise<void> {
    await this.initializeBitChat();
    if (this.bluetoothTransport) {
      await this.bluetoothTransport.discoverPeersWithDialog();
    } else {
      throw new Error('Bluetooth transport not initialized');
    }
  }

  // Manual discovery - alias for active discovery
  async startManualDiscovery(): Promise<void> {
    return this.startActiveBluetoothDiscovery();
  }
}

// Export default instance for compatibility
let defaultManager: MeshNetworkManager | null = null;

export function getMeshManager(): MeshNetworkManager {
  if (!defaultManager) {
    defaultManager = new MeshNetworkManager();
  }
  return defaultManager;
}

// Export instance directly for backward compatibility
export const meshManager = getMeshManager();

// Create a simple class for export default compatibility
export class DefaultMeshNetwork implements MeshNetwork {
  id = 'default';
  name = 'Default Network';
  nodes: MeshNode[] = [];
  topology: 'star' | 'mesh' | 'ring' = 'mesh';
}

// Export the class as default
export default DefaultMeshNetwork;
