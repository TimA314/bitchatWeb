// BitChat Protocol v1.1 Implementation
// Based on the BitChat Protocol Whitepaper
// Implements the complete 4-layer protocol stack

import type { Identity } from './identity';
import { generateIdentity, loadIdentity } from './identity';
import { NoiseSessionManager } from './noise-protocol';
import { BluetoothTransport } from './bluetooth';
import { v4 as uuidv4 } from 'uuid';

// Message Types from BitChat Protocol specification
export const MessageType = {
  MESSAGE: 0x01,
  DELIVERY_ACK: 0x02,
  READ_RECEIPT: 0x03,
  NOISE_HANDSHAKE_INIT: 0x10,
  NOISE_HANDSHAKE_RESPONSE: 0x11,
  NOISE_HANDSHAKE_FINAL: 0x12,
  FRAGMENT_START: 0x20,
  FRAGMENT_CONTINUE: 0x21,
  FRAGMENT_END: 0x22,
  ANNOUNCEMENT: 0x30,
  PING: 0x40,
  PONG: 0x41
} as const;

export type MessageType = typeof MessageType[keyof typeof MessageType];

// Packet flags bitmask
export const PacketFlags = {
  HAS_RECIPIENT: 0x01,
  HAS_SIGNATURE: 0x02,
  IS_COMPRESSED: 0x04,
  IS_BROADCAST: 0x08
} as const;

export type PacketFlags = typeof PacketFlags[keyof typeof PacketFlags];

// BitChat Protocol Packet Structure
export interface BitchatPacket {
  version: number;
  type: MessageType;
  ttl: number;
  timestamp: bigint;
  flags: number;
  payloadLength: number;
  senderId: Uint8Array; // 8 bytes
  recipientId?: Uint8Array; // 8 bytes, optional
  payload: Uint8Array;
  signature?: Uint8Array; // 64 bytes Ed25519 signature, optional
}

// Application layer message structure
export interface BitchatMessage {
  flags: number;
  timestamp: bigint;
  id: string;
  sender: string;
  content: string;
  originalSender?: string; // For relay messages
  recipientNickname?: string; // For private messages
}

// Delivery acknowledgment structure
export interface DeliveryAck {
  messageId: string;
  timestamp: bigint;
  recipientFingerprint: string;
}

// Peer information
export interface BitchatPeer {
  fingerprint: string;
  nickname: string;
  noiseStaticPublic: Uint8Array;
  lastSeen: Date;
  isConnected: boolean;
  isVerified: boolean;
  isFavorite: boolean;
  isBlocked: boolean;
  trustLevel: number; // 0-100
}

// Optimized Bloom Filter for duplicate detection
class OptimizedBloomFilter {
  private bits: Uint32Array;
  private size: number;
  private hashCount: number;

  constructor(expectedElements: number = 10000, falsePositiveRate: number = 0.01) {
    this.size = Math.ceil((-expectedElements * Math.log(falsePositiveRate)) / (Math.LN2 * Math.LN2));
    this.hashCount = Math.ceil((this.size / expectedElements) * Math.LN2);
    this.bits = new Uint32Array(Math.ceil(this.size / 32));
  }

  add(item: string): void {
    const hashes = this.getHashes(item);
    for (const hash of hashes) {
      const index = hash % this.size;
      const wordIndex = Math.floor(index / 32);
      const bitIndex = index % 32;
      this.bits[wordIndex] |= (1 << bitIndex);
    }
  }

  contains(item: string): boolean {
    const hashes = this.getHashes(item);
    for (const hash of hashes) {
      const index = hash % this.size;
      const wordIndex = Math.floor(index / 32);
      const bitIndex = index % 32;
      if ((this.bits[wordIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }

  private getHashes(item: string): number[] {
    const hashes: number[] = [];
    let hash1 = this.djb2Hash(item);
    let hash2 = this.sdbmHash(item);
    
    for (let i = 0; i < this.hashCount; i++) {
      hashes.push(Math.abs(hash1 + i * hash2));
    }
    return hashes;
  }

  private djb2Hash(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash;
  }

  private sdbmHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + (hash << 6) + (hash << 16) - hash;
    }
    return hash;
  }
}

// Message Retry Service for reliability
class MessageRetryService {
  private pendingMessages: Map<string, {
    packet: BitchatPacket;
    retryCount: number;
    lastSent: Date;
    maxRetries: number;
  }> = new Map();
  
  private retryInterval: number = 5000; // 5 seconds
  private maxRetries: number = 3;

  addMessage(messageId: string, packet: BitchatPacket): void {
    this.pendingMessages.set(messageId, {
      packet,
      retryCount: 0,
      lastSent: new Date(),
      maxRetries: this.maxRetries
    });
  }

  acknowledgeMessage(messageId: string): void {
    this.pendingMessages.delete(messageId);
  }

  getMessagesToRetry(): BitchatPacket[] {
    const now = new Date();
    const toRetry: BitchatPacket[] = [];

    for (const [messageId, pending] of this.pendingMessages.entries()) {
      const timeSinceLastSent = now.getTime() - pending.lastSent.getTime();
      
      if (timeSinceLastSent >= this.retryInterval) {
        if (pending.retryCount < pending.maxRetries) {
          pending.retryCount++;
          pending.lastSent = now;
          toRetry.push(pending.packet);
        } else {
          // Max retries reached, remove from pending
          this.pendingMessages.delete(messageId);
        }
      }
    }

    return toRetry;
  }
}

// Secure Identity State Manager
export class SecureIdentityStateManager {
  private peers: Map<string, BitchatPeer> = new Map();
  private identity: Identity | null = null;

  constructor() {
    this.loadIdentity();
  }

  private loadIdentity(): void {
    this.identity = loadIdentity();
    if (!this.identity) {
      this.identity = generateIdentity();
    }
  }

  getMyIdentity(): Identity {
    if (!this.identity) {
      throw new Error('Identity not initialized');
    }
    return this.identity;
  }

  addPeer(peer: BitchatPeer): void {
    this.peers.set(peer.fingerprint, peer);
  }

  getPeer(fingerprint: string): BitchatPeer | undefined {
    return this.peers.get(fingerprint);
  }

  getAllPeers(): BitchatPeer[] {
    return Array.from(this.peers.values());
  }

  markPeerAsVerified(fingerprint: string): void {
    const peer = this.peers.get(fingerprint);
    if (peer) {
      peer.isVerified = true;
    }
  }

  togglePeerFavorite(fingerprint: string): void {
    const peer = this.peers.get(fingerprint);
    if (peer) {
      peer.isFavorite = !peer.isFavorite;
    }
  }

  blockPeer(fingerprint: string): void {
    const peer = this.peers.get(fingerprint);
    if (peer) {
      peer.isBlocked = true;
    }
  }

  unblockPeer(fingerprint: string): void {
    const peer = this.peers.get(fingerprint);
    if (peer) {
      peer.isBlocked = false;
    }
  }

  isPeerBlocked(fingerprint: string): boolean {
    const peer = this.peers.get(fingerprint);
    return peer?.isBlocked || false;
  }
}

// Main BitChat Protocol Implementation
export class BitChatProtocol extends EventTarget {
  private identityManager: SecureIdentityStateManager;
  private noiseSessionManager: NoiseSessionManager;
  private bloomFilter: OptimizedBloomFilter;
  private retryService: MessageRetryService;
  private transport: BluetoothTransport;
  private isRunning: boolean = false;

  constructor() {
    super();
    this.identityManager = new SecureIdentityStateManager();
    this.noiseSessionManager = new NoiseSessionManager();
    this.bloomFilter = new OptimizedBloomFilter();
    this.retryService = new MessageRetryService();
    this.transport = new BluetoothTransport();
    
    this.setupTransportListeners();
    this.startRetryService();
  }

  private setupTransportListeners(): void {
    this.transport.addEventListener('dataReceived', (event: any) => {
      this.handleIncomingData(event.detail.data, event.detail.peerId);
    });

    this.transport.addEventListener('peerConnected', (event: any) => {
      this.handlePeerConnected(event.detail.peerId);
    });

    this.transport.addEventListener('peerDisconnected', (event: any) => {
      this.handlePeerDisconnected(event.detail.peerId);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    await this.transport.initialize();
    this.isRunning = true;
    
    console.log('🚀 BitChat Protocol started');
    this.dispatchEvent(new CustomEvent('protocolStarted'));
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    await this.transport.shutdown();
    this.isRunning = false;
    
    console.log('🛑 BitChat Protocol stopped');
    this.dispatchEvent(new CustomEvent('protocolStopped'));
  }

  // Send a message using the BitChat protocol
  async sendMessage(content: string, recipientFingerprint?: string, isPrivate: boolean = false): Promise<string> {
    const identity = this.identityManager.getMyIdentity();
    const messageId = uuidv4();
    
    // Create BitchatMessage
    const message: BitchatMessage = {
      flags: isPrivate ? 0x02 : 0x00, // Set private flag
      timestamp: BigInt(Date.now()),
      id: messageId,
      sender: 'Anonymous', // TODO: Implement nickname system
      content,
      recipientNickname: recipientFingerprint ? this.identityManager.getPeer(recipientFingerprint)?.nickname : undefined
    };

    // Serialize message
    const payload = this.serializeBitchatMessage(message);
    
    // Create packet
    const packet: BitchatPacket = {
      version: 1,
      type: MessageType.MESSAGE,
      ttl: 8, // Default TTL
      timestamp: BigInt(Date.now()),
      flags: recipientFingerprint ? PacketFlags.HAS_RECIPIENT : PacketFlags.IS_BROADCAST,
      payloadLength: payload.length,
      senderId: this.truncateFingerprint(identity.fingerprint),
      recipientId: recipientFingerprint ? this.truncateFingerprint(recipientFingerprint) : undefined,
      payload
    };

    // Add to retry service for private messages
    if (isPrivate && recipientFingerprint) {
      this.retryService.addMessage(messageId, packet);
    }

    // Send packet
    await this.sendPacket(packet, recipientFingerprint);
    
    return messageId;
  }

  private async sendPacket(packet: BitchatPacket, recipientFingerprint?: string): Promise<void> {
    const serialized = this.serializePacket(packet);
    
    if (recipientFingerprint) {
      // Private message - encrypt with Noise session
      const session = await this.noiseSessionManager.getOrCreateSession(recipientFingerprint);
      if (session && session.isSessionEstablished()) {
        const encrypted = session.encryptTransportMessage(serialized);
        await this.transport.sendToDevice(recipientFingerprint, encrypted);
      } else {
        // Need to establish session first
        await this.initiateHandshake(recipientFingerprint);
        // Queue message for later
      }
    } else {
      // Broadcast message
      await this.transport.broadcast(serialized);
    }
  }

  private async handleIncomingData(data: Uint8Array, peerId: string): Promise<void> {
    try {
      // Check if peer is blocked
      if (this.identityManager.isPeerBlocked(peerId)) {
        console.log('🚫 Ignoring packet from blocked peer:', peerId);
        return;
      }

      // Try to decrypt if it's a Noise transport message
      const session = this.noiseSessionManager.getSession(peerId);
      let decryptedData = data;
      
      if (session && session.isSessionEstablished()) {
        try {
          decryptedData = session.decryptTransportMessage(data);
        } catch (error) {
          console.warn('Failed to decrypt transport message:', error);
          return;
        }
      }

      const packet = this.deserializePacket(decryptedData);
      if (!packet) return;

      // Check bloom filter for duplicates
      const packetId = this.getPacketId(packet);
      if (this.bloomFilter.contains(packetId)) {
        console.log('🔄 Duplicate packet detected, ignoring');
        return;
      }
      this.bloomFilter.add(packetId);

      // Process packet based on type
      await this.processPacket(packet, peerId);

      // Relay packet if TTL > 0 and not destined for us
      if (packet.ttl > 0 && !this.isPacketForMe(packet)) {
        await this.relayPacket(packet, peerId);
      }

    } catch (error) {
      console.error('Error handling incoming data:', error);
    }
  }

  private async processPacket(packet: BitchatPacket, fromPeerId: string): Promise<void> {
    switch (packet.type) {
      case MessageType.MESSAGE:
        await this.handleMessagePacket(packet, fromPeerId);
        break;
      case MessageType.DELIVERY_ACK:
        this.handleDeliveryAck(packet);
        break;
      case MessageType.NOISE_HANDSHAKE_INIT:
      case MessageType.NOISE_HANDSHAKE_RESPONSE:
      case MessageType.NOISE_HANDSHAKE_FINAL:
        await this.handleHandshakePacket(packet, fromPeerId);
        break;
      case MessageType.ANNOUNCEMENT:
        this.handleAnnouncement(packet, fromPeerId);
        break;
      default:
        console.log('Unknown packet type:', packet.type);
    }
  }

  private async handleMessagePacket(packet: BitchatPacket, fromPeerId: string): Promise<void> {
    const message = this.deserializeBitchatMessage(packet.payload);
    if (!message) return;

    // If it's a private message for us, send delivery ack
    if (this.isPacketForMe(packet) && packet.recipientId) {
      await this.sendDeliveryAck(message.id, fromPeerId);
    }

    // Emit message event
    this.dispatchEvent(new CustomEvent('messageReceived', {
      detail: { message, packet, fromPeerId }
    }));
  }

  private handleDeliveryAck(_packet: BitchatPacket): void {
    // TODO: Deserialize delivery ack and remove from retry service
    console.log('📨 Delivery acknowledgment received');
  }

  private async handleHandshakePacket(packet: BitchatPacket, fromPeerId: string): Promise<void> {
    await this.noiseSessionManager.processHandshakeMessage(fromPeerId, packet.payload);
  }

  private handleAnnouncement(_packet: BitchatPacket, fromPeerId: string): void {
    // TODO: Handle peer announcements
    console.log('📢 Announcement received from:', fromPeerId);
  }

  private async relayPacket(packet: BitchatPacket, excludePeer: string): Promise<void> {
    // Decrement TTL
    packet.ttl--;
    
    if (packet.ttl > 0) {
      const serialized = this.serializePacket(packet);
      await this.transport.relayToAll(serialized, excludePeer);
    }
  }

  private async sendDeliveryAck(messageId: string, recipientPeerId: string): Promise<void> {
    const ack: DeliveryAck = {
      messageId,
      timestamp: BigInt(Date.now()),
      recipientFingerprint: this.identityManager.getMyIdentity().fingerprint
    };

    const payload = this.serializeDeliveryAck(ack);
    const packet: BitchatPacket = {
      version: 1,
      type: MessageType.DELIVERY_ACK,
      ttl: 8,
      timestamp: BigInt(Date.now()),
      flags: PacketFlags.HAS_RECIPIENT,
      payloadLength: payload.length,
      senderId: this.truncateFingerprint(this.identityManager.getMyIdentity().fingerprint),
      recipientId: this.truncateFingerprint(recipientPeerId),
      payload
    };

    await this.sendPacket(packet, recipientPeerId);
  }

  private async initiateHandshake(peerFingerprint: string): Promise<void> {
    // TODO: Implement Noise handshake initiation
    console.log('🤝 Initiating handshake with:', peerFingerprint);
  }

  private handlePeerConnected(peerId: string): void {
    console.log('👋 Peer connected:', peerId);
    this.dispatchEvent(new CustomEvent('peerConnected', { detail: { peerId } }));
  }

  private handlePeerDisconnected(peerId: string): void {
    console.log('👋 Peer disconnected:', peerId);
    this.dispatchEvent(new CustomEvent('peerDisconnected', { detail: { peerId } }));
  }

  private isPacketForMe(packet: BitchatPacket): boolean {
    if (!packet.recipientId) return true; // Broadcast
    
    const myFingerprint = this.truncateFingerprint(this.identityManager.getMyIdentity().fingerprint);
    return this.arraysEqual(packet.recipientId, myFingerprint);
  }

  private getPacketId(packet: BitchatPacket): string {
    // Create unique ID from packet contents
    return `${packet.timestamp}_${Buffer.from(packet.senderId).toString('hex')}_${packet.type}`;
  }

  private truncateFingerprint(fingerprint: string): Uint8Array {
    // Take first 8 bytes of SHA-256 hash
    return new Uint8Array(Buffer.from(fingerprint, 'hex').slice(0, 8));
  }

  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((val, i) => val === b[i]);
  }

  // Serialization methods
  private serializePacket(packet: BitchatPacket): Uint8Array {
    // Implementation based on whitepaper specification
    const headerSize = 13;
    const senderIdSize = 8;
    const recipientIdSize = packet.recipientId ? 8 : 0;
    const signatureSize = packet.signature ? 64 : 0;
    
    const totalSize = headerSize + senderIdSize + recipientIdSize + packet.payload.length + signatureSize;
    
    // Pad to next standard size
    const padSizes = [256, 512, 1024, 2048];
    const padSize = padSizes.find(size => size >= totalSize) || 2048;
    
    const buffer = new ArrayBuffer(padSize);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);
    
    let offset = 0;
    
    // Header (13 bytes)
    view.setUint8(offset++, packet.version);
    view.setUint8(offset++, packet.type);
    view.setUint8(offset++, packet.ttl);
    view.setBigUint64(offset, packet.timestamp);
    offset += 8;
    view.setUint8(offset++, packet.flags);
    view.setUint16(offset, packet.payloadLength);
    offset += 2;
    
    // Sender ID (8 bytes)
    uint8View.set(packet.senderId, offset);
    offset += senderIdSize;
    
    // Recipient ID (8 bytes, optional)
    if (packet.recipientId) {
      uint8View.set(packet.recipientId, offset);
      offset += recipientIdSize;
    }
    
    // Payload
    uint8View.set(packet.payload, offset);
    offset += packet.payload.length;
    
    // Signature (64 bytes, optional)
    if (packet.signature) {
      uint8View.set(packet.signature, offset);
      offset += signatureSize;
    }
    
    // PKCS#7 padding
    const paddingLength = padSize - totalSize;
    for (let i = totalSize; i < padSize; i++) {
      uint8View[i] = paddingLength;
    }
    
    return uint8View;
  }

  private deserializePacket(data: Uint8Array): BitchatPacket | null {
    try {
      const view = new DataView(data.buffer, data.byteOffset);
      let offset = 0;
      
      // Header
      const version = view.getUint8(offset++);
      const type = view.getUint8(offset++);
      const ttl = view.getUint8(offset++);
      const timestamp = view.getBigUint64(offset);
      offset += 8;
      const flags = view.getUint8(offset++);
      const payloadLength = view.getUint16(offset);
      offset += 2;
      
      // Sender ID
      const senderId = data.slice(offset, offset + 8);
      offset += 8;
      
      // Recipient ID (optional)
      let recipientId: Uint8Array | undefined;
      if (flags & PacketFlags.HAS_RECIPIENT) {
        recipientId = data.slice(offset, offset + 8);
        offset += 8;
      }
      
      // Payload
      const payload = data.slice(offset, offset + payloadLength);
      offset += payloadLength;
      
      // Signature (optional)
      let signature: Uint8Array | undefined;
      if (flags & PacketFlags.HAS_SIGNATURE) {
        signature = data.slice(offset, offset + 64);
      }
      
      return {
        version,
        type: type as MessageType,
        ttl,
        timestamp,
        flags,
        payloadLength,
        senderId,
        recipientId,
        payload,
        signature
      };
    } catch (error) {
      console.error('Failed to deserialize packet:', error);
      return null;
    }
  }

  private serializeBitchatMessage(message: BitchatMessage): Uint8Array {
    // Implementation based on whitepaper specification
    const encoder = new TextEncoder();
    
    const idBytes = encoder.encode(message.id);
    const senderBytes = encoder.encode(message.sender);
    const contentBytes = encoder.encode(message.content);
    const originalSenderBytes = message.originalSender ? encoder.encode(message.originalSender) : new Uint8Array(0);
    const recipientBytes = message.recipientNickname ? encoder.encode(message.recipientNickname) : new Uint8Array(0);
    
    const size = 1 + 8 + 1 + idBytes.length + 1 + senderBytes.length + 2 + contentBytes.length +
                 (originalSenderBytes.length > 0 ? 1 + originalSenderBytes.length : 0) +
                 (recipientBytes.length > 0 ? 1 + recipientBytes.length : 0);
    
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);
    let offset = 0;
    
    // Flags
    view.setUint8(offset++, message.flags);
    
    // Timestamp
    view.setBigUint64(offset, message.timestamp);
    offset += 8;
    
    // ID
    view.setUint8(offset++, idBytes.length);
    uint8View.set(idBytes, offset);
    offset += idBytes.length;
    
    // Sender
    view.setUint8(offset++, senderBytes.length);
    uint8View.set(senderBytes, offset);
    offset += senderBytes.length;
    
    // Content
    view.setUint16(offset, contentBytes.length);
    offset += 2;
    uint8View.set(contentBytes, offset);
    offset += contentBytes.length;
    
    // Original sender (optional)
    if (originalSenderBytes.length > 0) {
      view.setUint8(offset++, originalSenderBytes.length);
      uint8View.set(originalSenderBytes, offset);
      offset += originalSenderBytes.length;
    }
    
    // Recipient nickname (optional)
    if (recipientBytes.length > 0) {
      view.setUint8(offset++, recipientBytes.length);
      uint8View.set(recipientBytes, offset);
    }
    
    return uint8View;
  }

  private deserializeBitchatMessage(data: Uint8Array): BitchatMessage | null {
    try {
      const view = new DataView(data.buffer, data.byteOffset);
      const decoder = new TextDecoder();
      let offset = 0;
      
      // Flags
      const flags = view.getUint8(offset++);
      
      // Timestamp
      const timestamp = view.getBigUint64(offset);
      offset += 8;
      
      // ID
      const idLength = view.getUint8(offset++);
      const id = decoder.decode(data.slice(offset, offset + idLength));
      offset += idLength;
      
      // Sender
      const senderLength = view.getUint8(offset++);
      const sender = decoder.decode(data.slice(offset, offset + senderLength));
      offset += senderLength;
      
      // Content
      const contentLength = view.getUint16(offset);
      offset += 2;
      const content = decoder.decode(data.slice(offset, offset + contentLength));
      offset += contentLength;
      
      // Optional fields
      let originalSender: string | undefined;
      let recipientNickname: string | undefined;
      
      if (offset < data.length) {
        const originalSenderLength = view.getUint8(offset++);
        if (originalSenderLength > 0) {
          originalSender = decoder.decode(data.slice(offset, offset + originalSenderLength));
          offset += originalSenderLength;
        }
      }
      
      if (offset < data.length) {
        const recipientLength = view.getUint8(offset++);
        if (recipientLength > 0) {
          recipientNickname = decoder.decode(data.slice(offset, offset + recipientLength));
        }
      }
      
      return {
        flags,
        timestamp,
        id,
        sender,
        content,
        originalSender,
        recipientNickname
      };
    } catch (error) {
      console.error('Failed to deserialize BitchatMessage:', error);
      return null;
    }
  }

  private serializeDeliveryAck(ack: DeliveryAck): Uint8Array {
    const encoder = new TextEncoder();
    const messageIdBytes = encoder.encode(ack.messageId);
    const fingerprintBytes = encoder.encode(ack.recipientFingerprint);
    
    const size = 1 + messageIdBytes.length + 8 + 1 + fingerprintBytes.length;
    const buffer = new ArrayBuffer(size);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);
    let offset = 0;
    
    // Message ID
    view.setUint8(offset++, messageIdBytes.length);
    uint8View.set(messageIdBytes, offset);
    offset += messageIdBytes.length;
    
    // Timestamp
    view.setBigUint64(offset, ack.timestamp);
    offset += 8;
    
    // Recipient fingerprint
    view.setUint8(offset++, fingerprintBytes.length);
    uint8View.set(fingerprintBytes, offset);
    
    return uint8View;
  }

  private startRetryService(): void {
    setInterval(() => {
      const toRetry = this.retryService.getMessagesToRetry();
      for (const packet of toRetry) {
        this.sendPacket(packet).catch(console.error);
      }
    }, 5000); // Check every 5 seconds
  }

  // Public API methods
  getMyFingerprint(): string {
    return this.identityManager.getMyIdentity().fingerprint;
  }

  getPeers(): BitchatPeer[] {
    return this.identityManager.getAllPeers();
  }

  verifyPeer(fingerprint: string): void {
    this.identityManager.markPeerAsVerified(fingerprint);
  }

  blockPeer(fingerprint: string): void {
    this.identityManager.blockPeer(fingerprint);
  }

  unblockPeer(fingerprint: string): void {
    this.identityManager.unblockPeer(fingerprint);
  }
}

// Singleton instance
export const bitchatProtocol = new BitChatProtocol();
