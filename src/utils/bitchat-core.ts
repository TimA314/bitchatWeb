// BitChat Core Protocol Implementation
// Uses bitchat-qudag WASM when available, with fallback implementations
// Supports both BLE mesh networking and Nostr for hybrid operation

import { BitChatQudag } from './bitchat-wasm';

// Core BitChat types based on the whitepaper specification
export interface BitChatMessage {
  id: string;
  content: string;
  timestamp: number;
  sender: string;
  recipient?: string;
  isPrivate: boolean;
  signature?: Uint8Array;
}

export interface BitChatPeer {
  fingerprint: string;
  publicKey: Uint8Array;
  nickname?: string;
  lastSeen: number;
  isOnline: boolean;
  transport: 'ble' | 'nostr' | 'both';
}

export interface BitChatIdentity {
  fingerprint: string;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  nickname: string;
}

// Transport layer interface
export interface BitChatTransport {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  sendMessage(data: Uint8Array, recipient?: string): Promise<void>;
  broadcastMessage(data: Uint8Array): Promise<void>;
  addEventListener(event: string, handler: (data: any) => void): void;
  removeEventListener(event: string, handler: (data: any) => void): void;
}

// Main BitChat Protocol class
export class BitChatProtocol extends EventTarget {
  private identity: BitChatIdentity | null = null;
  private peers: Map<string, BitChatPeer> = new Map();
  private transports: BitChatTransport[] = [];
  private bitchatCore: BitChatQudag;
  private isInitialized = false;

  constructor() {
    super();
    this.bitchatCore = new BitChatQudag();
  }

  // Initialize the BitChat protocol
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize BitChat WASM core
      await this.bitchatCore.initialize();
      console.log('✅ BitChat Qudag WASM module loaded successfully');
    } catch (error) {
      console.log('WASM module not available, using fallback implementation');
    }

    // Initialize identity
    await this.initializeIdentity();
    
    this.isInitialized = true;
    this.dispatchEvent(new CustomEvent('initialized'));
    console.log('🚀 BitChat Protocol initialized');
  }

  // Initialize or load user identity
  private async initializeIdentity(): Promise<void> {
    const stored = localStorage.getItem('bitchat-identity');
    
    if (stored) {
      this.identity = JSON.parse(stored);
      console.log('📱 Loaded existing identity:', this.identity?.fingerprint);
    } else {
      this.identity = await this.generateNewIdentity();
      localStorage.setItem('bitchat-identity', JSON.stringify(this.identity));
      console.log('🆕 Generated new identity:', this.identity.fingerprint);
    }
  }

  // Generate a new BitChat identity
  private async generateNewIdentity(): Promise<BitChatIdentity> {
    if (this.bitchatCore.isWasmAvailable()) {
      // Use WASM module for identity generation
      const wasmIdentity = await this.bitchatCore.generateIdentity();
      // Convert from WASM format to core format
      return {
        fingerprint: wasmIdentity.fingerprint,
        publicKey: wasmIdentity.public_key,
        privateKey: wasmIdentity.private_key,
        nickname: wasmIdentity.nickname || 'Anonymous'
      };
    } else {
      // Fallback: Use Web Crypto API with ECDSA (better browser support)
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        true,
        ['sign', 'verify']
      );

      const publicKeyBuffer = await crypto.subtle.exportKey('raw', keyPair.publicKey);
      const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      
      const publicKey = new Uint8Array(publicKeyBuffer);
      const privateKey = new Uint8Array(privateKeyBuffer);
      
      // Generate fingerprint from public key
      const hash = await crypto.subtle.digest('SHA-256', publicKey);
      const fingerprint = Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      return {
        fingerprint: fingerprint.substring(0, 16), // Use first 8 bytes
        publicKey,
        privateKey,
        nickname: `User${fingerprint.substring(0, 8)}`
      };
    }
  }

  // Add a transport layer (BLE, Nostr, etc.)
  addTransport(transport: BitChatTransport): void {
    this.transports.push(transport);

    // Set up event listeners
    transport.addEventListener('messageReceived', (event) => {
      this.handleIncomingMessage(event.data, event.transport);
    });

    transport.addEventListener('peerDiscovered', (event) => {
      this.handlePeerDiscovered(event.peer);
    });

    // Handle Bluetooth availability announcements
    transport.addEventListener('bluetoothAnnouncement', (event) => {
      this.handleBluetoothAnnouncement(event.detail, transport);
    });

    // Handle Bluetooth coordination requests
    transport.addEventListener('bluetoothCoordination', (event) => {
      this.handleBluetoothCoordination(event.detail, transport);
    });
  }

  // Handle Bluetooth availability announcements
  private handleBluetoothAnnouncement(announcement: any, sourceTransport: BitChatTransport): void {
    console.log('📡 Bluetooth availability announced:', announcement);

    // Broadcast this announcement via other transports (especially Nostr)
    for (const transport of this.transports) {
      if (transport !== sourceTransport && transport.constructor.name === 'NostrTransport') {
        try {
          // Send Bluetooth availability via Nostr
          (transport as any).sendBluetoothCoordination('broadcast', {
            type: 'bluetooth_available',
            announcement,
            sourceTransport: sourceTransport.constructor.name
          });
        } catch (error) {
          console.warn('Failed to broadcast Bluetooth availability via Nostr:', error);
        }
      }
    }
  }

  // Handle Bluetooth coordination requests
  private handleBluetoothCoordination(coordination: any, sourceTransport: BitChatTransport): void {
    console.log('🔗 Bluetooth coordination received:', coordination);

    // If this is a Bluetooth availability announcement from Nostr, notify Bluetooth transport
    if (coordination.type === 'bluetooth_available' && sourceTransport.constructor.name === 'NostrTransport') {
      const bluetoothTransport = this.transports.find(t => t.constructor.name === 'WebBluetoothTransport');
      if (bluetoothTransport) {
        (bluetoothTransport as unknown as EventTarget).dispatchEvent(new CustomEvent('peerDiscovered', {
          detail: {
            peer: {
              fingerprint: coordination.announcement.deviceName || 'Unknown',
              publicKey: new Uint8Array(),
              nickname: 'Bluetooth Device',
              lastSeen: Date.now(),
              isOnline: true,
              transport: 'ble'
            }
          }
        }));
      }
    }
  }

  // Send a message
  async sendMessage(content: string, recipient?: string): Promise<string> {
    if (!this.identity) {
      throw new Error('BitChat not initialized');
    }

    const message: BitChatMessage = {
      id: this.generateMessageId(),
      content,
      timestamp: Date.now(),
      sender: this.identity.fingerprint,
      recipient,
      isPrivate: !!recipient
    };

    // Serialize and sign message
    const serialized = await this.serializeMessage(message);
    
    // Send via all available transports
    for (const transport of this.transports) {
      try {
        if (recipient) {
          await transport.sendMessage(serialized, recipient);
        } else {
          await transport.broadcastMessage(serialized);
        }
      } catch (error) {
        console.error('Failed to send via transport:', error);
      }
    }

    // Emit local event
    this.dispatchEvent(new CustomEvent('messageSent', { detail: message }));
    
    console.log(`📤 BitChat message sent:`, {
      id: message.id,
      sender: message.sender.substring(0, 8),
      recipient: message.recipient?.substring(0, 8) || 'broadcast',
      contentLength: message.content.length,
      timestamp: new Date(message.timestamp).toLocaleTimeString()
    });
    
    return message.id;
  }

  // Handle incoming messages
  private async handleIncomingMessage(data: Uint8Array, transportType: string): Promise<void> {
    try {
      const message = await this.deserializeMessage(data);
      
      // Verify message signature
      if (!await this.verifyMessage(message)) {
        console.warn('Invalid message signature');
        return;
      }

      // Update peer info
      this.updatePeerLastSeen(message.sender);

      // Emit message received event
      this.dispatchEvent(new CustomEvent('messageReceived', { 
        detail: { message, transport: transportType } 
      }));

      console.log(`📨 BitChat message processed:`, {
        sender: message.sender.substring(0, 8),
        contentLength: message.content.length,
        transport: transportType,
        timestamp: new Date(message.timestamp).toLocaleTimeString()
      });
      
    } catch (error) {
      console.error('Failed to handle incoming message:', error);
    }
  }

  // Handle peer discovery
  private handlePeerDiscovered(peer: BitChatPeer): void {
    this.peers.set(peer.fingerprint, peer);
    this.dispatchEvent(new CustomEvent('peerDiscovered', { detail: peer }));
  }

  // Update peer last seen timestamp
  private updatePeerLastSeen(fingerprint: string): void {
    const peer = this.peers.get(fingerprint);
    if (peer) {
      peer.lastSeen = Date.now();
      peer.isOnline = true;
    }
  }

  // Serialize message for transmission
  private async serializeMessage(message: BitChatMessage): Promise<Uint8Array> {
    if (this.bitchatCore.isWasmAvailable()) {
      // TODO: Convert between core and WASM message formats
      console.log('🔧 Using fallback serialization - interface conversion needed');
    }
    
    // Fallback serialization
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(message));
    
    // Sign the message
    if (this.identity) {
      const signature = await this.signData(data);
      message.signature = signature;
    }
    
    return encoder.encode(JSON.stringify(message));
  }

  // Deserialize received message
  private async deserializeMessage(data: Uint8Array): Promise<BitChatMessage> {
    if (this.bitchatCore.isWasmAvailable()) {
      // Note: May need interface conversion between WASM and core types
      const wasmMessage = await this.bitchatCore.deserializeMessage(data);
      // Convert from WASM format to core format if needed
      return wasmMessage as any; // TODO: Proper type conversion
    } else {
      // Fallback deserialization
      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(data));
    }
  }

  // Sign data with identity private key
  private async signData(data: Uint8Array): Promise<Uint8Array> {
    if (!this.identity) {
      throw new Error('No identity available for signing');
    }

    if (this.bitchatCore.isWasmAvailable()) {
      // Use WASM module for signing when available
      // TODO: Add sign_data method to WASM interface
      // return await this.bitchatCore.sign_data(data, this.identity.privateKey);
      console.warn('WASM signing not yet implemented, using fallback');
    }
    
    // Fallback: Simple hash-based signature for demo
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data.toString()));
    return new Uint8Array(hashBuffer);
  }

  // Verify message signature
  private async verifyMessage(message: BitChatMessage): Promise<boolean> {
    if (!message.signature) return false;

    const peer = this.peers.get(message.sender);
    if (!peer) return false;

    if (this.bitchatCore.isWasmAvailable()) {
      // Use WASM module for verification when available
      // TODO: Convert between core and WASM message formats
      console.log('🔧 Using fallback verification - interface conversion needed');
    }
    
    // Fallback: Simple verification for demo
    const messageToVerify = { ...message };
    delete messageToVerify.signature;
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(messageToVerify));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const expectedSignature = new Uint8Array(hashBuffer);
    
    // Simple comparison for demo
    return this.arraysEqual(message.signature, expectedSignature);
  }

  // Helper function to compare arrays
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((val, i) => val === b[i]);
  }

  // Generate unique message ID
  private generateMessageId(): string {
    return crypto.randomUUID();
  }

  // Get current user identity
  getIdentity(): BitChatIdentity | null {
    return this.identity;
  }

  // Get discovered peers
  getPeers(): BitChatPeer[] {
    return Array.from(this.peers.values());
  }

  // Get online peers
  getOnlinePeers(): BitChatPeer[] {
    const now = Date.now();
    return Array.from(this.peers.values()).filter(
      peer => peer.isOnline && (now - peer.lastSeen) < 30000 // 30 seconds
    );
  }

  // Start the protocol
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Initialize all transports
    for (const transport of this.transports) {
      try {
        await transport.initialize();
        console.log('✅ Transport initialized');
      } catch (error) {
        console.error('Failed to initialize transport:', error);
      }
    }

    this.dispatchEvent(new CustomEvent('started'));
    console.log('🚀 BitChat Protocol started');
  }

  // Stop the protocol
  async stop(): Promise<void> {
    for (const transport of this.transports) {
      try {
        await transport.shutdown();
      } catch (error) {
        console.error('Failed to shutdown transport:', error);
      }
    }

    this.dispatchEvent(new CustomEvent('stopped'));
    console.log('🛑 BitChat Protocol stopped');
  }

  // Start Bluetooth discovery
  async startBluetoothDiscovery(): Promise<void> {
    const bluetoothTransport = this.transports.find(t => t.constructor.name === 'WebBluetoothTransport');
    if (bluetoothTransport) {
      await (bluetoothTransport as any).discoverPeersWithDialog();
      console.log('Bluetooth discovery initiated');
    } else {
      console.warn('Bluetooth transport not found');
    }
  }
}

// Singleton instance
export const bitchatProtocol = new BitChatProtocol();
