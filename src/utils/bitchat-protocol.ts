// BitChat Protocol Implementation
// A decentralized, peer-to-peer messaging protocol for secure communication
// Follows BitChat Protocol Whitepaper v1.1 specification

// Extend the existing Bluetooth interfaces
declare global {
  interface BluetoothRemoteGATTServer {
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  }
  
  interface BluetoothRemoteGATTService {
    getCharacteristic(characteristic: BluetoothServiceUUID): Promise<BluetoothRemoteGATTCharacteristic>;
  }
  
  interface BluetoothRemoteGATTCharacteristic {
    readValue(): Promise<DataView>;
    writeValue(value: BufferSource): Promise<void>;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
    value?: DataView;
  }
}

// BitChat Protocol Constants
export const BITCHAT_PROTOCOL = {
  VERSION: 1,
  SERVICE_UUID: '12345678-1234-5678-9abc-123456789abc',
  CHARACTERISTIC_UUID: '87654321-4321-8765-cba9-987654321098',
  NOISE_PROTOCOL: 'Noise_XX_25519_ChaChaPoly_SHA256',
  MAX_TTL: 16,
  BROADCAST_ID: new Uint8Array(8).fill(0xFF),
  PADDING_SIZES: [256, 512, 1024, 2048]
} as const;

// Message Types (as per BitChat Protocol)
export const MessageType = {
  MESSAGE: 1,
  DELIVERY_ACK: 2,
  READ_RECEIPT: 3,
  NOISE_HANDSHAKE_INIT: 4,
  NOISE_HANDSHAKE_RESP: 5,
  NOISE_HANDSHAKE_FINAL: 6,
  FRAGMENT_START: 7,
  FRAGMENT_CONTINUE: 8,
  FRAGMENT_END: 9,
  HEARTBEAT: 10,
  PEER_ANNOUNCEMENT: 11
} as const;

// Packet Flags
export const PacketFlags = {
  HAS_RECIPIENT: 0x01,
  HAS_SIGNATURE: 0x02,
  IS_COMPRESSED: 0x04,
  IS_FRAGMENTED: 0x08
} as const;

// Core BitChat Protocol Types
export interface BitchatPeer {
  id: Uint8Array; // 8-byte peer ID (truncated from fingerprint)
  fingerprint: Uint8Array; // SHA-256 hash of static public key
  nickname: string;
  staticPublicKey?: Uint8Array; // Curve25519 public key
  signingPublicKey?: Uint8Array; // Ed25519 public key
  device?: BluetoothDevice;
  isConnected: boolean;
  lastSeen: Date;
  isVerified: boolean;
  isFavorite: boolean;
  isBlocked: boolean;
  trustLevel: 'unknown' | 'verified' | 'trusted';
}

export interface BitchatPacket {
  // Fixed-size header (13 bytes)
  version: number; // 1 byte
  type: number; // 1 byte (MessageType)
  ttl: number; // 1 byte
  timestamp: bigint; // 8 bytes (UInt64)
  flags: number; // 1 byte (PacketFlags bitmask)
  payloadLength: number; // 2 bytes (UInt16)
  
  // Variable-size fields
  senderId: Uint8Array; // 8 bytes
  recipientId?: Uint8Array; // 8 bytes (optional, based on HAS_RECIPIENT flag)
  payload: Uint8Array; // Variable length
  signature?: Uint8Array; // 64 bytes (optional, based on HAS_SIGNATURE flag)
}

export interface BitchatMessage {
  flags: number; // 1 byte
  timestamp: bigint; // 8 bytes
  id: string; // UUID
  sender: string; // Nickname
  content: string; // UTF-8 message content
  originalSender?: string; // For relay messages
  recipientNickname?: string; // For private messages
}

export interface DeliveryAck {
  messageId: string;
  timestamp: bigint;
}

export interface ReadReceipt {
  messageId: string;
  timestamp: bigint;
}

// Optimized Bloom Filter for packet deduplication
export class OptimizedBloomFilter {
  private bitArray: Uint8Array;
  private size: number;
  private hashCount: number;
  
  constructor(expectedElements: number = 10000, falsePositiveRate: number = 0.01) {
    this.size = Math.ceil((-expectedElements * Math.log(falsePositiveRate)) / (Math.log(2) ** 2));
    this.hashCount = Math.ceil((this.size / expectedElements) * Math.log(2));
    this.bitArray = new Uint8Array(Math.ceil(this.size / 8));
  }
  
  private hash(data: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < data.length; i++) {
      hash = ((hash << 5) - hash + data.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash) % this.size;
  }
  
  add(item: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const index = this.hash(item, i);
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      this.bitArray[byteIndex] |= (1 << bitIndex);
    }
  }
  
  contains(item: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const index = this.hash(item, i);
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      if (!(this.bitArray[byteIndex] & (1 << bitIndex))) {
        return false;
      }
    }
    return true;
  }
  
  clear(): void {
    this.bitArray.fill(0);
  }
}

// Secure Identity State Manager
export class SecureIdentityStateManager {
  private peers: Map<string, BitchatPeer> = new Map();
  private ownKeys: {
    staticKeyPair?: CryptoKeyPair;
    signingKeyPair?: CryptoKeyPair;
    fingerprint?: Uint8Array;
  } = {};
  
  async initialize(): Promise<void> {
    await this.generateOrLoadKeys();
  }
  
  private async generateOrLoadKeys(): Promise<void> {
    try {
      // Generate Curve25519 static key pair for Noise protocol
      this.ownKeys.staticKeyPair = await crypto.subtle.generateKey(
        {
          name: 'X25519'
        } as any,
        true,
        ['deriveKey', 'deriveBits']
      );
      
      // Generate Ed25519 signing key pair
      this.ownKeys.signingKeyPair = await crypto.subtle.generateKey(
        {
          name: 'Ed25519'
        } as any,
        true,
        ['sign', 'verify']
      );
      
      // Generate fingerprint from static public key
      const staticPublicKeyBytes = await crypto.subtle.exportKey('raw', this.ownKeys.staticKeyPair.publicKey);
      const fingerprintBuffer = await crypto.subtle.digest('SHA-256', staticPublicKeyBytes);
      this.ownKeys.fingerprint = new Uint8Array(fingerprintBuffer);
    } catch (error) {
      console.warn('Advanced crypto not available, using fallback', error);
      // Fallback for browsers without X25519/Ed25519 support
      this.ownKeys.fingerprint = new Uint8Array(32);
      crypto.getRandomValues(this.ownKeys.fingerprint);
    }
  }
  
  getFingerprint(): Uint8Array | undefined {
    return this.ownKeys.fingerprint;
  }
  
  getStaticPublicKey(): CryptoKey | undefined {
    return this.ownKeys.staticKeyPair?.publicKey;
  }
  
  getStaticPrivateKey(): CryptoKey | undefined {
    return this.ownKeys.staticKeyPair?.privateKey;
  }
  
  addPeer(peer: BitchatPeer): void {
    const peerId = this.bytesToHex(peer.id);
    this.peers.set(peerId, peer);
  }
  
  getPeer(peerId: Uint8Array): BitchatPeer | undefined {
    const peerIdHex = this.bytesToHex(peerId);
    return this.peers.get(peerIdHex);
  }
  
  getAllPeers(): BitchatPeer[] {
    return Array.from(this.peers.values());
  }
  
  verifyPeer(peerId: Uint8Array): void {
    const peer = this.getPeer(peerId);
    if (peer) {
      peer.isVerified = true;
      peer.trustLevel = 'verified';
    }
  }
  
  blockPeer(peerId: Uint8Array): void {
    const peer = this.getPeer(peerId);
    if (peer) {
      peer.isBlocked = true;
    }
  }
  
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

// BitChat Packet Serialization
export class BitchatPacketSerializer {
  static serialize(packet: BitchatPacket): ArrayBuffer {
    const hasRecipient = !!(packet.flags & PacketFlags.HAS_RECIPIENT);
    const hasSignature = !!(packet.flags & PacketFlags.HAS_SIGNATURE);
    
    // Calculate total size
    let totalSize = 13; // Fixed header
    totalSize += 8; // senderId
    if (hasRecipient) totalSize += 8; // recipientId
    totalSize += packet.payload.length;
    if (hasSignature) totalSize += 64; // signature
    
    // Add padding to next standard block size
    const paddedSize = BITCHAT_PROTOCOL.PADDING_SIZES.find(size => size >= totalSize) || 2048;
    
    const buffer = new ArrayBuffer(paddedSize);
    const view = new DataView(buffer);
    let offset = 0;
    
    // Fixed header (13 bytes)
    view.setUint8(offset, packet.version); offset += 1;
    view.setUint8(offset, packet.type); offset += 1;
    view.setUint8(offset, packet.ttl); offset += 1;
    view.setBigUint64(offset, packet.timestamp, false); offset += 8;
    view.setUint8(offset, packet.flags); offset += 1;
    view.setUint16(offset, packet.payloadLength, false); offset += 2;
    
    // Variable fields
    new Uint8Array(buffer, offset, 8).set(packet.senderId); offset += 8;
    
    if (hasRecipient && packet.recipientId) {
      new Uint8Array(buffer, offset, 8).set(packet.recipientId); offset += 8;
    }
    
    new Uint8Array(buffer, offset, packet.payload.length).set(packet.payload); offset += packet.payload.length;
    
    if (hasSignature && packet.signature) {
      new Uint8Array(buffer, offset, 64).set(packet.signature); offset += 64;
    }
    
    // PKCS#7 style padding
    const paddingLength = paddedSize - totalSize;
    if (paddingLength > 0) {
      const padding = new Uint8Array(paddingLength).fill(paddingLength);
      new Uint8Array(buffer, offset, paddingLength).set(padding);
    }
    
    return buffer;
  }
  
  static deserialize(data: Uint8Array): BitchatPacket {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;
    
    // Parse fixed header
    const version = view.getUint8(offset); offset += 1;
    const type = view.getUint8(offset); offset += 1;
    const ttl = view.getUint8(offset); offset += 1;
    const timestamp = view.getBigUint64(offset, false); offset += 8;
    const flags = view.getUint8(offset); offset += 1;
    const payloadLength = view.getUint16(offset, false); offset += 2;
    
    // Parse variable fields
    const senderId = new Uint8Array(data.buffer, data.byteOffset + offset, 8); offset += 8;
    
    let recipientId: Uint8Array | undefined;
    if (flags & PacketFlags.HAS_RECIPIENT) {
      recipientId = new Uint8Array(data.buffer, data.byteOffset + offset, 8); offset += 8;
    }
    
    const payload = new Uint8Array(data.buffer, data.byteOffset + offset, payloadLength); offset += payloadLength;
    
    let signature: Uint8Array | undefined;
    if (flags & PacketFlags.HAS_SIGNATURE) {
      signature = new Uint8Array(data.buffer, data.byteOffset + offset, 64);
    }
    
    return {
      version,
      type,
      ttl,
      timestamp,
      flags,
      payloadLength,
      senderId,
      recipientId,
      payload,
      signature
    };
  }
}

// Main BitChat Protocol Manager
export class BitChatProtocolManager extends EventTarget {
  private identityManager: SecureIdentityStateManager;
  private bloomFilter: OptimizedBloomFilter;
  private connectedPeers: Map<string, BluetoothDevice> = new Map();
  
  constructor() {
    super();
    this.identityManager = new SecureIdentityStateManager();
    this.bloomFilter = new OptimizedBloomFilter();
  }
  
  async initialize(): Promise<void> {
    await this.identityManager.initialize();
  }
  
  // Scan for BitChat peers using Bluetooth
  async scanForPeers(): Promise<BitchatPeer[]> {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth not supported');
    }
    
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BITCHAT_PROTOCOL.SERVICE_UUID] }],
        optionalServices: [BITCHAT_PROTOCOL.SERVICE_UUID]
      });
      
      if (!device.gatt) {
        throw new Error('GATT not available');
      }
      
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BITCHAT_PROTOCOL.SERVICE_UUID);
      const characteristic = await service.getCharacteristic(BITCHAT_PROTOCOL.CHARACTERISTIC_UUID);
      
      // Start listening for announcements
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event: Event) => {
        this.handleIncomingData(event as any);
      });
      
      // Send our own announcement
      await this.sendPeerAnnouncement(characteristic);
      
      return this.identityManager.getAllPeers();
    } catch (error) {
      console.error('Failed to scan for peers:', error);
      throw error;
    }
  }
  
  // Connect to a specific peer
  async connectToPeer(peer: BitchatPeer): Promise<boolean> {
    if (!peer.device || peer.isBlocked) {
      return false;
    }
    
    try {
      if (!peer.device.gatt) {
        throw new Error('GATT not available');
      }
      
      const server = await peer.device.gatt.connect();
      const service = await server.getPrimaryService(BITCHAT_PROTOCOL.SERVICE_UUID);
      const characteristic = await service.getCharacteristic(BITCHAT_PROTOCOL.CHARACTERISTIC_UUID);
      
      // Initialize Noise handshake
      await this.initiateNoiseHandshake(characteristic, peer);
      
      peer.isConnected = true;
      peer.lastSeen = new Date();
      
      this.dispatchEvent(new CustomEvent('peerConnected', { detail: peer }));
      return true;
    } catch (error) {
      console.error('Failed to connect to peer:', error);
      return false;
    }
  }
  
  // Send a chat message
  async sendMessage(content: string, recipientId?: Uint8Array): Promise<string> {
    const messageId = crypto.randomUUID();
    const ownFingerprint = this.identityManager.getFingerprint();
    if (!ownFingerprint) {
      throw new Error('Identity not initialized');
    }
    
    const message: BitchatMessage = {
      flags: 0,
      timestamp: BigInt(Date.now()),
      id: messageId,
      sender: 'User', // TODO: Get from settings
      content,
      recipientNickname: recipientId ? this.identityManager.getPeer(recipientId)?.nickname : undefined
    };
    
    const packet: BitchatPacket = {
      version: BITCHAT_PROTOCOL.VERSION,
      type: MessageType.MESSAGE,
      ttl: BITCHAT_PROTOCOL.MAX_TTL,
      timestamp: BigInt(Date.now()),
      flags: recipientId ? PacketFlags.HAS_RECIPIENT : 0,
      payloadLength: 0, // Will be set during serialization
      senderId: ownFingerprint.slice(0, 8),
      recipientId: recipientId,
      payload: this.serializeMessage(message)
    };
    
    packet.payloadLength = packet.payload.length;
    
    await this.broadcastPacket(packet);
    return messageId;
  }
  
  private async sendPeerAnnouncement(characteristic: BluetoothRemoteGATTCharacteristic): Promise<void> {
    const ownFingerprint = this.identityManager.getFingerprint();
    if (!ownFingerprint) return;
    
    const announcement = {
      nickname: 'User', // TODO: Get from settings
      fingerprint: Array.from(ownFingerprint), // Convert to array for JSON
      timestamp: Date.now()
    };
    
    const packet: BitchatPacket = {
      version: BITCHAT_PROTOCOL.VERSION,
      type: MessageType.PEER_ANNOUNCEMENT,
      ttl: 1, // Don't propagate announcements
      timestamp: BigInt(Date.now()),
      flags: 0,
      payloadLength: 0,
      senderId: ownFingerprint.slice(0, 8),
      payload: new TextEncoder().encode(JSON.stringify(announcement))
    };
    
    packet.payloadLength = packet.payload.length;
    const serialized = BitchatPacketSerializer.serialize(packet);
    await characteristic.writeValue(serialized);
  }
  
  private async initiateNoiseHandshake(characteristic: BluetoothRemoteGATTCharacteristic, peer: BitchatPeer): Promise<void> {
    // TODO: Implement full Noise XX handshake
    // This is a simplified version for now
    console.log('Initiating Noise handshake with', peer.nickname);
    
    const ownFingerprint = this.identityManager.getFingerprint();
    if (!ownFingerprint) return;
    
    const handshakePacket: BitchatPacket = {
      version: BITCHAT_PROTOCOL.VERSION,
      type: MessageType.NOISE_HANDSHAKE_INIT,
      ttl: 1,
      timestamp: BigInt(Date.now()),
      flags: PacketFlags.HAS_RECIPIENT,
      payloadLength: 0,
      senderId: ownFingerprint.slice(0, 8),
      recipientId: peer.id,
      payload: new Uint8Array(32) // Placeholder for ephemeral key
    };
    
    handshakePacket.payloadLength = handshakePacket.payload.length;
    const serialized = BitchatPacketSerializer.serialize(handshakePacket);
    await characteristic.writeValue(serialized);
  }
  
  private handleIncomingData(event: any): void {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    if (!characteristic.value) return;
    
    try {
      const data = new Uint8Array(characteristic.value.buffer);
      const packet = BitchatPacketSerializer.deserialize(data);
      
      // Check if packet was already seen (bloom filter)
      const packetId = this.getPacketId(packet);
      if (this.bloomFilter.contains(packetId)) {
        return; // Already processed
      }
      this.bloomFilter.add(packetId);
      
      // Check if sender is blocked
      const sender = this.identityManager.getPeer(packet.senderId);
      if (sender?.isBlocked) {
        return;
      }
      
      this.processPacket(packet);
      
      // Relay packet if TTL > 0 and not for us
      if (packet.ttl > 0 && !this.isPacketForUs(packet)) {
        this.relayPacket(packet);
      }
    } catch (error) {
      console.error('Failed to process incoming data:', error);
    }
  }
  
  private processPacket(packet: BitchatPacket): void {
    switch (packet.type) {
      case MessageType.MESSAGE:
        this.handleChatMessage(packet);
        break;
      case MessageType.PEER_ANNOUNCEMENT:
        this.handlePeerAnnouncement(packet);
        break;
      case MessageType.DELIVERY_ACK:
        this.handleDeliveryAck(packet);
        break;
      case MessageType.READ_RECEIPT:
        this.handleReadReceipt(packet);
        break;
      case MessageType.NOISE_HANDSHAKE_INIT:
      case MessageType.NOISE_HANDSHAKE_RESP:
      case MessageType.NOISE_HANDSHAKE_FINAL:
        this.handleNoiseHandshake(packet);
        break;
      default:
        console.log('Unknown packet type:', packet.type);
    }
  }
  
  private handleChatMessage(packet: BitchatPacket): void {
    try {
      const message = this.deserializeMessage(packet.payload);
      this.dispatchEvent(new CustomEvent('messageReceived', {
        detail: { message, senderId: packet.senderId }
      }));
      
      // Send delivery acknowledgment if it's a private message
      if (packet.recipientId && this.isPacketForUs(packet)) {
        this.sendDeliveryAck(message.id, packet.senderId);
      }
    } catch (error) {
      console.error('Failed to handle chat message:', error);
    }
  }
  
  private handlePeerAnnouncement(packet: BitchatPacket): void {
    try {
      const announcement = JSON.parse(new TextDecoder().decode(packet.payload));
      
      const peer: BitchatPeer = {
        id: packet.senderId,
        fingerprint: new Uint8Array(announcement.fingerprint),
        nickname: announcement.nickname,
        isConnected: false,
        lastSeen: new Date(),
        isVerified: false,
        isFavorite: false,
        isBlocked: false,
        trustLevel: 'unknown'
      };
      
      this.identityManager.addPeer(peer);
      this.dispatchEvent(new CustomEvent('peerDiscovered', { detail: peer }));
    } catch (error) {
      console.error('Failed to handle peer announcement:', error);
    }
  }
  
  private handleDeliveryAck(packet: BitchatPacket): void {
    try {
      const ack = JSON.parse(new TextDecoder().decode(packet.payload));
      this.dispatchEvent(new CustomEvent('deliveryAck', { detail: ack }));
    } catch (error) {
      console.error('Failed to handle delivery ack:', error);
    }
  }
  
  private handleReadReceipt(packet: BitchatPacket): void {
    try {
      const receipt = JSON.parse(new TextDecoder().decode(packet.payload));
      this.dispatchEvent(new CustomEvent('readReceipt', { detail: receipt }));
    } catch (error) {
      console.error('Failed to handle read receipt:', error);
    }
  }
  
  private handleNoiseHandshake(packet: BitchatPacket): void {
    // TODO: Implement full Noise handshake protocol
    console.log('Received Noise handshake packet:', packet.type);
  }
  
  private async sendDeliveryAck(messageId: string, recipientId: Uint8Array): Promise<void> {
    const ownFingerprint = this.identityManager.getFingerprint();
    if (!ownFingerprint) return;
    
    const ack: DeliveryAck = {
      messageId,
      timestamp: BigInt(Date.now())
    };
    
    const packet: BitchatPacket = {
      version: BITCHAT_PROTOCOL.VERSION,
      type: MessageType.DELIVERY_ACK,
      ttl: BITCHAT_PROTOCOL.MAX_TTL,
      timestamp: BigInt(Date.now()),
      flags: PacketFlags.HAS_RECIPIENT,
      payloadLength: 0,
      senderId: ownFingerprint.slice(0, 8),
      recipientId: recipientId,
      payload: new TextEncoder().encode(JSON.stringify(ack))
    };
    
    packet.payloadLength = packet.payload.length;
    await this.broadcastPacket(packet);
  }
  
  private async relayPacket(packet: BitchatPacket): Promise<void> {
    // Decrement TTL and relay
    packet.ttl -= 1;
    if (packet.ttl <= 0) return;
    
    await this.broadcastPacket(packet);
  }
  
  private async broadcastPacket(packet: BitchatPacket): Promise<void> {
    const serialized = BitchatPacketSerializer.serialize(packet);
    
    // Broadcast to all connected peers
    for (const [peerId, device] of this.connectedPeers) {
      try {
        if (device.gatt?.connected) {
          const service = await device.gatt.getPrimaryService(BITCHAT_PROTOCOL.SERVICE_UUID);
          const characteristic = await service.getCharacteristic(BITCHAT_PROTOCOL.CHARACTERISTIC_UUID);
          await characteristic.writeValue(serialized);
        }
      } catch (error) {
        console.error(`Failed to send to peer ${peerId}:`, error);
      }
    }
  }
  
  private isPacketForUs(packet: BitchatPacket): boolean {
    if (!packet.recipientId) return true; // Broadcast message
    
    const ownFingerprint = this.identityManager.getFingerprint();
    if (!ownFingerprint) return false;
    
    const ownId = ownFingerprint.slice(0, 8);
    return this.arraysEqual(packet.recipientId, ownId);
  }
  
  private getPacketId(packet: BitchatPacket): string {
    return `${this.bytesToHex(packet.senderId)}-${packet.timestamp.toString()}`;
  }
  
  private serializeMessage(message: BitchatMessage): Uint8Array {
    const data = JSON.stringify(message);
    return new TextEncoder().encode(data);
  }
  
  private deserializeMessage(data: Uint8Array): BitchatMessage {
    const json = new TextDecoder().decode(data);
    return JSON.parse(json);
  }
  
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}

// Create global instance
export const bitchatProtocol = new BitChatProtocolManager();
