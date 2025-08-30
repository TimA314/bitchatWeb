// Nostr Transport for BitChat
// Implements Nostr-based messaging for online peer-to-peer communication

import type { BitChatTransport } from './bitchat-core';

// Simplified Nostr implementation for BitChat
// Will use the proper nostr-tools when API is stabilized

export interface NostrRelay {
  url: string;
  connected: boolean;
  lastPing: number;
}

export class NostrTransport extends EventTarget implements BitChatTransport {
  private relays: NostrRelay[] = [];
  private privateKey: string | null = null;
  private publicKey: string | null = null;
  private isInitialized = false;
  private websockets: Map<string, WebSocket> = new Map();

  // Default Nostr relays for BitChat
  private defaultRelays = [
    'wss://relay.damus.io',
    'wss://nos.lol', 
    'wss://relay.snort.social',
    'wss://relay.current.fyi'
  ];

  constructor(customRelays?: string[]) {
    super();
    
    if (customRelays) {
      this.defaultRelays = customRelays;
    }
  }

  // Initialize the Nostr transport
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load or generate Nostr keypair
      await this.initializeIdentity();
      
      // Connect to relays
      await this.connectToRelays();
      
      this.isInitialized = true;
      console.log('🟣 Nostr transport initialized');
      this.dispatchEvent(new CustomEvent('initialized'));
      
    } catch (error) {
      console.error('Failed to initialize Nostr transport:', error);
      throw error;
    }
  }

  // Shutdown the transport
  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    // Close all websockets
    for (const ws of this.websockets.values()) {
      ws.close();
    }
    this.websockets.clear();
    
    this.isInitialized = false;
    console.log('🟣 Nostr transport shutdown');
    this.dispatchEvent(new CustomEvent('shutdown'));
  }

  // Send message to specific peer
  async sendMessage(data: Uint8Array, recipient?: string): Promise<void> {
    if (!this.isInitialized || !this.privateKey) {
      throw new Error('Nostr transport not initialized');
    }

    try {
      // Convert data to hex for transmission
      const content = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Create Nostr event (simplified)
      const event = {
        kind: 30000, // Custom BitChat kind
        content,
        tags: [
          ['t', 'bitchat'],
          ['client', 'bitchat-pwa']
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: this.publicKey
      };

      // Add recipient tag for private messages
      if (recipient) {
        event.tags.push(['p', recipient]);
      }

      // Send to all connected relays
      const message = JSON.stringify(['EVENT', event]);
      for (const ws of this.websockets.values()) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
      
      console.log(`📤 Sent Nostr message to ${recipient || 'broadcast'}`);
      
    } catch (error) {
      console.error('Failed to send Nostr message:', error);
      throw error;
    }
  }

  // Broadcast message to all peers
  async broadcastMessage(data: Uint8Array): Promise<void> {
    return this.sendMessage(data); // No recipient = broadcast
  }

  // Initialize or load Nostr identity
  private async initializeIdentity(): Promise<void> {
    const stored = localStorage.getItem('bitchat-nostr-identity');
    
    if (stored) {
      const identity = JSON.parse(stored);
      this.privateKey = identity.privateKey;
      this.publicKey = identity.publicKey;
      console.log('📱 Loaded existing Nostr identity:', this.publicKey?.substring(0, 16));
    } else {
      // Generate simple keypair (in production, use proper cryptography)
      this.privateKey = this.generateSimpleKey();
      this.publicKey = this.generateSimpleKey(); // Simplified for demo
      
      const identity = {
        privateKey: this.privateKey,
        publicKey: this.publicKey
      };
      
      localStorage.setItem('bitchat-nostr-identity', JSON.stringify(identity));
      console.log('🆕 Generated new Nostr identity:', this.publicKey.substring(0, 16));
    }
  }

  // Simple key generation (replace with proper crypto in production)
  private generateSimpleKey(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Connect to Nostr relays
  private async connectToRelays(): Promise<void> {
    this.relays = this.defaultRelays.map(url => ({
      url,
      connected: false,
      lastPing: 0
    }));

    // Connect to relays via WebSocket
    const connectionPromises = this.relays.map(async (relay) => {
      try {
        const ws = new WebSocket(relay.url);
        
        ws.onopen = () => {
          relay.connected = true;
          relay.lastPing = Date.now();
          console.log(`🔗 Connected to Nostr relay: ${relay.url}`);
          
          // Subscribe to BitChat messages
          const subscription = JSON.stringify([
            'REQ',
            'bitchat-sub',
            {
              kinds: [30000],
              '#t': ['bitchat'],
              since: Math.floor(Date.now() / 1000) - 3600 // Last hour
            }
          ]);
          ws.send(subscription);
        };

        ws.onmessage = (event) => {
          this.handleNostrMessage(event.data, relay.url);
        };

        ws.onclose = () => {
          relay.connected = false;
          this.websockets.delete(relay.url);
          console.log(`❌ Disconnected from relay: ${relay.url}`);
        };

        ws.onerror = (error) => {
          console.error(`Relay error ${relay.url}:`, error);
          relay.connected = false;
        };

        this.websockets.set(relay.url, ws);
        
      } catch (error) {
        console.error(`Failed to connect to relay ${relay.url}:`, error);
        relay.connected = false;
      }
    });

    await Promise.allSettled(connectionPromises);
    
    // Wait a bit for connections to establish
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const connectedCount = this.relays.filter(r => r.connected).length;
    console.log(`🟣 Connected to ${connectedCount}/${this.relays.length} Nostr relays`);
  }

  // Handle incoming Nostr messages
  private handleNostrMessage(data: string, _relayUrl: string): void {
    try {
      const message = JSON.parse(data);
      
      if (message[0] === 'EVENT' && message[2]) {
        const event = message[2];
        
        // Skip our own messages
        if (event.pubkey === this.publicKey) {
          return;
        }

        // Check if it's a BitChat message
        const isBitChatMessage = event.tags?.some((tag: string[]) => 
          tag[0] === 't' && tag[1] === 'bitchat'
        );

        if (isBitChatMessage && event.content) {
          // Convert hex content back to bytes
          const hexMatches = event.content.match(/.{2}/g);
          if (hexMatches) {
            const data = new Uint8Array(hexMatches.map((byte: string) => parseInt(byte, 16)));

            console.log(`📥 Received Nostr message from ${event.pubkey.substring(0, 16)}`);
            
            this.dispatchEvent(new CustomEvent('messageReceived', {
              detail: {
                data,
                peerId: event.pubkey,
                transport: 'nostr'
              }
            }));

            // Emit peer discovery
            this.dispatchEvent(new CustomEvent('peerDiscovered', {
              detail: {
                peer: {
                  fingerprint: event.pubkey,
                  publicKey: new Uint8Array(),
                  nickname: 'Nostr User',
                  lastSeen: event.created_at * 1000,
                  isOnline: true,
                  transport: 'nostr'
                }
              }
            }));
          }
        }
      }
      
    } catch (error) {
      console.error('Failed to handle Nostr message:', error);
    }
  }

  // Get connected relay count
  getConnectedRelayCount(): number {
    return this.relays.filter(r => r.connected).length;
  }

  // Get Nostr public key
  getPublicKey(): string | null {
    return this.publicKey;
  }

  // Get relay status
  getRelayStatus(): NostrRelay[] {
    return [...this.relays];
  }

  // Add custom relay
  async addRelay(url: string): Promise<void> {
    const existing = this.relays.find(r => r.url === url);
    if (existing) return;

    const relay: NostrRelay = {
      url,
      connected: false,
      lastPing: 0
    };

    try {
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        relay.connected = true;
        relay.lastPing = Date.now();
        console.log(`➕ Added relay: ${url}`);
      };

      ws.onmessage = (event) => {
        this.handleNostrMessage(event.data, url);
      };

      ws.onclose = () => {
        relay.connected = false;
        this.websockets.delete(url);
      };

      this.websockets.set(url, ws);
      this.relays.push(relay);
      
    } catch (error) {
      console.error(`Failed to add relay ${url}:`, error);
      throw error;
    }
  }

  // Remove relay
  removeRelay(url: string): void {
    const ws = this.websockets.get(url);
    if (ws) {
      ws.close();
      this.websockets.delete(url);
    }

    const index = this.relays.findIndex(r => r.url === url);
    if (index !== -1) {
      this.relays.splice(index, 1);
      console.log(`➖ Removed relay: ${url}`);
    }
  }
}
