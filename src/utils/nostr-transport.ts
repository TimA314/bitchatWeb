// Nostr Transport for BitChat
// Implements Nostr-based messaging for online peer-to-peer communication

import type { BitChatTransport } from './bitchat-core';
import { BitChatQudag } from './bitchat-wasm.js';

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
  private bitchatWasm: BitChatQudag | null = null;

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
      // Initialize WASM cryptographic functions
      this.bitchatWasm = new BitChatQudag();
      await this.bitchatWasm.initialize();
      
      // Load or generate Nostr identity using WASM crypto
      await this.initializeIdentity();
      
      // Connect to relays
      await this.connectToRelays();
      
      this.isInitialized = true;
      console.log('🟣 Nostr transport initialized with WASM cryptography');
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
      // Convert message data to hex for transmission
      const messageContent = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Create Nostr event (simplified)
      const event: any = {
        kind: 30000, // Custom BitChat kind
        content: messageContent,
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

      // Generate event ID (SHA-256 hash of serialized event)
      const serialized = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
      const encoder = new TextEncoder();
      const eventData = encoder.encode(serialized);
      const hashBuffer = await crypto.subtle.digest('SHA-256', eventData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      event.id = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Send to all connected relays
      const message = JSON.stringify(['EVENT', event]);
      console.log(`📤 Sending Nostr message to ${recipient || 'broadcast'}:`, {
        kind: event.kind,
        tags: event.tags,
        contentLength: event.content.length,
        eventId: event.id,
        connectedRelays: this.websockets.size
      });

      for (const ws of this.websockets.values()) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      }
      
    } catch (error) {
      console.error('Failed to send Nostr message:', error);
      throw error;
    }
  }

  // Broadcast message to all peers
  async broadcastMessage(data: Uint8Array): Promise<void> {
    return this.sendMessage(data); // No recipient = broadcast
  }

  // Initialize or load Nostr identity using WASM crypto
  private async initializeIdentity(): Promise<void> {
    if (!this.bitchatWasm) throw new Error('WASM not initialized');
    
    const stored = localStorage.getItem('bitchat-nostr-identity');
    
    if (stored) {
      const identity = JSON.parse(stored);
      // Verify the stored identity is valid
      if (identity.fingerprint && identity.publicKey) {
        this.privateKey = identity.privateKey;
        this.publicKey = identity.publicKey;
        console.log('📱 Loaded existing Nostr identity:', identity.fingerprint);
        return;
      }
    }
    
    // Generate new identity using WASM crypto
    const wasmIdentity = await this.bitchatWasm.generateIdentity('NostrTransport');
    
    this.privateKey = Array.from(wasmIdentity.private_key).map(b => b.toString(16).padStart(2, '0')).join('');
    this.publicKey = Array.from(wasmIdentity.public_key).map(b => b.toString(16).padStart(2, '0')).join('');
    
    const identity = {
      fingerprint: wasmIdentity.fingerprint,
      privateKey: this.privateKey,
      publicKey: this.publicKey
    };
    
    localStorage.setItem('bitchat-nostr-identity', JSON.stringify(identity));
    console.log('🆕 Generated new Nostr identity with WASM crypto:', wasmIdentity.fingerprint);
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
              '#t': ['bitchat', 'presence'], // Include both bitchat and presence tags
              since: Math.floor(Date.now() / 1000) - 3600 // Last hour
            }
          ]);
          console.log(`📡 Subscribing to BitChat messages on ${relay.url}:`, JSON.parse(subscription));
          ws.send(subscription);

          // Send a presence announcement
          this.sendPresenceAnnouncement(relay.url);
        };

        ws.onmessage = (event) => {
          console.log(`📨 Raw message from ${relay.url}:`, event.data.substring(0, 200) + '...');
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
  private handleNostrMessage(data: string, relayUrl: string): void {
    try {
      const message = JSON.parse(data);

      // Log all messages for debugging
      if (message[0] === 'EVENT') {
        console.log(`📨 EVENT from ${relayUrl}: kind=${message[2]?.kind}, pubkey=${message[2]?.pubkey?.substring(0, 8)}..., tags=`, message[2]?.tags);
      } else if (message[0] === 'NOTICE') {
        console.log(`📢 NOTICE from ${relayUrl}: ${message[1]}`);
      } else if (message[0] === 'EOSE') {
        console.log(`🏁 End of stored events from ${relayUrl}`);
      } else {
        console.log(`📨 ${message[0]} from ${relayUrl}:`, message);
      }

      if (message[0] === 'EVENT' && message[2]) {
        const event = message[2];

        // Skip our own messages
        if (event.pubkey === this.publicKey) {
          console.log('🔄 Skipping our own message from', relayUrl);
          return;
        }

        // Check if it's a BitChat message or presence announcement
        const isBitChatMessage = event.tags?.some((tag: string[]) =>
          tag[0] === 't' && tag[1] === 'bitchat'
        );
        const isPresenceAnnouncement = event.tags?.some((tag: string[]) =>
          tag[0] === 't' && tag[1] === 'presence'
        );

        console.log(`🔍 Event analysis: kind=${event.kind}, hasBitChatTag=${isBitChatMessage}, hasPresenceTag=${isPresenceAnnouncement}, contentLength=${event.content?.length || 0}`);

        if (isPresenceAnnouncement && event.content) {
          // Handle presence announcements
          console.log(`👋 Presence announcement from ${event.pubkey.substring(0, 16)}`);
          try {
            const hexMatches = event.content.match(/.{2}/g);
            if (hexMatches) {
              const data = new Uint8Array(hexMatches.map((byte: string) => parseInt(byte, 16)));
              const decoder = new TextDecoder();
              const presenceData = JSON.parse(decoder.decode(data));
              console.log('📍 Presence data:', presenceData);
            }
          } catch (decodeError) {
            console.log('📍 Could not decode presence data');
          }

          // Emit peer discovery for presence announcements
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
        else if (isBitChatMessage && event.content) {
          // Convert hex content back to bytes
          const hexMatches = event.content.match(/.{2}/g);
          if (hexMatches) {
            const data = new Uint8Array(hexMatches.map((byte: string) => parseInt(byte, 16)));

            console.log(`📥 BitChat message received from ${event.pubkey.substring(0, 16)} (${data.length} bytes)`);
            console.log('🔍 Message content preview:', Array.from(data.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '));

            // Try to decode as JSON for debugging
            try {
              const decoder = new TextDecoder();
              const textContent = decoder.decode(data);
              console.log('📄 Decoded content:', textContent);
            } catch (decodeError) {
              console.log('📄 Could not decode as text');
            }            this.dispatchEvent(new CustomEvent('messageReceived', {
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

  // Send a presence announcement to let other devices know we're here
  private async sendPresenceAnnouncement(relayUrl: string): Promise<void> {
    try {
      if (!this.publicKey) return;

      // Create a simple presence announcement
      const presenceData = JSON.stringify({
        type: 'presence',
        device: navigator.userAgent.includes('Android') ? 'android' : 'desktop',
        timestamp: Date.now(),
        version: '1.0'
      });

      const content = Array.from(new TextEncoder().encode(presenceData))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const event: any = {
        kind: 30000, // Custom BitChat kind
        content,
        tags: [
          ['t', 'bitchat'],
          ['t', 'presence'],
          ['client', 'bitchat-pwa']
        ],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: this.publicKey
      };

      // Generate event ID (SHA-256 hash of serialized event)
      const serialized = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
      const encoder = new TextEncoder();
      const eventData = encoder.encode(serialized);
      const hashBuffer = await crypto.subtle.digest('SHA-256', eventData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      event.id = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      console.log(`📢 Generated presence event ID: ${event.id}`);

      const message = JSON.stringify(['EVENT', event]);
      const ws = this.websockets.get(relayUrl);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        console.log(`📢 Sent presence announcement to ${relayUrl}`);
      }
    } catch (error) {
      console.error('Failed to send presence announcement:', error);
    }
  }

  // Manually announce presence (for debugging)
  async announcePresence(): Promise<void> {
    console.log('📢 Manually announcing presence...');
    for (const relay of this.relays) {
      if (relay.connected) {
        await this.sendPresenceAnnouncement(relay.url);
      }
    }
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
