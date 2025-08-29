// Noise Protocol Framework Implementation
// Implements Noise_XX_25519_ChaChaPoly_SHA256 for BitChat Protocol v1.1
// Based on the Noise Protocol Framework specification and BitChat whitepaper

// Noise Protocol Constants
export const NOISE_CONSTANTS = {
  PROTOCOL_NAME: 'Noise_XX_25519_ChaChaPoly_SHA256',
  DH_LEN: 32, // Curve25519 key length
  HASH_LEN: 32, // SHA-256 hash length
  AEAD_LEN: 16, // ChaCha20-Poly1305 tag length
  MAX_NONCE: 0xFFFFFFFFFFFFFFn - 1n, // 2^64 - 2
  PROLOGUE: new TextEncoder().encode('BitChat-v1.1')
} as const;

// Noise Message Patterns for XX handshake
export const XX_PATTERN = {
  INITIATOR_PATTERNS: [
    ['e'], // -> e
    ['e', 'ee', 's', 'es'], // <- e, ee, s, es
    ['s', 'se'] // -> s, se
  ],
  RESPONDER_PATTERNS: [
    [], // <- e
    ['e', 'ee', 's', 'es'], // -> e, ee, s, es  
    ['s', 'se'] // <- s, se
  ]
} as const;

// Noise handshake states
export const NoiseHandshakeStates = {
  UNINITIALIZED: 'uninitialized',
  WAITING_FOR_RESPONSE: 'waiting_for_response',
  WAITING_FOR_FINAL: 'waiting_for_final',
  COMPLETED: 'completed',
  FAILED: 'failed'
} as const;

export type NoiseHandshakeState = typeof NoiseHandshakeStates[keyof typeof NoiseHandshakeStates];

// Cipher state for ChaCha20-Poly1305
export class NoiseCipherState {
  private key: Uint8Array | null = null;
  private nonce: bigint = 0n;
  
  initializeKey(key: Uint8Array): void {
    if (key.length !== 32) {
      throw new Error('Invalid key length for ChaCha20');
    }
    this.key = new Uint8Array(key);
  }
  
  hasKey(): boolean {
    return this.key !== null;
  }
  
  // Simple XOR cipher for demo (NOT SECURE - replace with actual ChaCha20-Poly1305)
  encrypt(plaintext: Uint8Array): Uint8Array {
    if (!this.key) {
      throw new Error('Cipher not initialized');
    }
    
    this.nonce++;
    if (this.nonce > NOISE_CONSTANTS.MAX_NONCE) {
      throw new Error('Nonce overflow - rekey required');
    }
    
    // Create output buffer with nonce prefix and auth tag
    const ciphertext = new Uint8Array(8 + plaintext.length + NOISE_CONSTANTS.AEAD_LEN);
    
    // Store nonce in first 8 bytes
    const nonceBytes = new ArrayBuffer(8);
    new DataView(nonceBytes).setBigUint64(0, this.nonce, false);
    ciphertext.set(new Uint8Array(nonceBytes), 0);
    
    // Simple XOR encryption (NOT SECURE)
    for (let i = 0; i < plaintext.length; i++) {
      ciphertext[i + 8] = plaintext[i] ^ this.key[i % this.key.length] ^ Number(this.nonce & 0xFFn);
    }
    
    // Add dummy auth tag
    const tag = new Uint8Array(NOISE_CONSTANTS.AEAD_LEN);
    crypto.getRandomValues(tag);
    ciphertext.set(tag, 8 + plaintext.length);
    
    return ciphertext;
  }
  
  decrypt(ciphertext: Uint8Array): Uint8Array {
    if (!this.key) {
      throw new Error('Cipher not initialized');
    }
    
    if (ciphertext.length < 8 + NOISE_CONSTANTS.AEAD_LEN) {
      throw new Error('Invalid ciphertext length');
    }
    
    // Extract nonce
    const nonceBytes = ciphertext.slice(0, 8);
    const messageNonce = new DataView(nonceBytes.buffer).getBigUint64(0, false);
    
    // Extract encrypted data (excluding nonce and auth tag)
    const encryptedData = ciphertext.slice(8, ciphertext.length - NOISE_CONSTANTS.AEAD_LEN);
    // TODO: Verify auth tag in production
    
    // Simple XOR decryption
    const plaintext = new Uint8Array(encryptedData.length);
    for (let i = 0; i < encryptedData.length; i++) {
      plaintext[i] = encryptedData[i] ^ this.key[i % this.key.length] ^ Number(messageNonce & 0xFFn);
    }
    
    return plaintext;
  }
  
  rekey(): void {
    if (!this.key) return;
    
    // Rekey by encrypting 32 zero bytes and using result as new key
    const zeros = new Uint8Array(32);
    const newKey = this.encrypt(zeros);
    this.key = newKey.slice(8, 40); // Extract key portion
    this.nonce = 0n;
  }
  
  clear(): void {
    if (this.key) {
      this.key.fill(0);
      this.key = null;
    }
    this.nonce = 0n;
  }
}

// Symmetric state for Noise handshake
export class NoiseSymmetricState {
  private cipherState: NoiseCipherState;
  private ck: Uint8Array; // Chaining key
  private h: Uint8Array; // Handshake hash
  
  constructor() {
    this.cipherState = new NoiseCipherState();
    this.ck = new Uint8Array(NOISE_CONSTANTS.HASH_LEN);
    this.h = new Uint8Array(NOISE_CONSTANTS.HASH_LEN);
  }
  
  async initializeSymmetric(protocolName: string): Promise<void> {
    const protocolBytes = new TextEncoder().encode(protocolName);
    
    if (protocolBytes.length <= NOISE_CONSTANTS.HASH_LEN) {
      this.h.set(protocolBytes);
      this.h.fill(0, protocolBytes.length);
    } else {
      const hashBuffer = await crypto.subtle.digest('SHA-256', protocolBytes);
      this.h.set(new Uint8Array(hashBuffer));
    }
    
    this.ck.set(this.h);
  }
  
  async mixKey(inputKeyMaterial: Uint8Array): Promise<void> {
    const [ck, tempKey] = await this.hkdf(this.ck, inputKeyMaterial, 2);
    this.ck = ck;
    this.cipherState.initializeKey(tempKey);
  }
  
  async mixHash(data: Uint8Array): Promise<void> {
    const combined = new Uint8Array(this.h.length + data.length);
    combined.set(this.h);
    combined.set(data, this.h.length);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    this.h.set(new Uint8Array(hashBuffer));
  }
  
  async mixKeyAndHash(inputKeyMaterial: Uint8Array): Promise<void> {
    const [ck, tempH, tempKey] = await this.hkdf(this.ck, inputKeyMaterial, 3);
    this.ck = ck;
    await this.mixHash(tempH);
    this.cipherState.initializeKey(tempKey);
  }
  
  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    const ciphertext = this.cipherState.hasKey() ? 
      this.cipherState.encrypt(plaintext) : 
      plaintext;
    
    this.mixHash(ciphertext);
    return ciphertext;
  }
  
  decryptAndHash(ciphertext: Uint8Array): Uint8Array {
    const plaintext = this.cipherState.hasKey() ? 
      this.cipherState.decrypt(ciphertext) : 
      ciphertext;
    
    this.mixHash(ciphertext);
    return plaintext;
  }
  
  async split(): Promise<[NoiseCipherState, NoiseCipherState]> {
    const [tempKey1, tempKey2] = await this.hkdf(this.ck, new Uint8Array(0), 2);
    
    const cipher1 = new NoiseCipherState();
    const cipher2 = new NoiseCipherState();
    
    cipher1.initializeKey(tempKey1);
    cipher2.initializeKey(tempKey2);
    
    return [cipher1, cipher2];
  }
  
  getHandshakeHash(): Uint8Array {
    return new Uint8Array(this.h);
  }
  
  // Simple HKDF implementation using SHA-256
  private async hkdf(chainingKey: Uint8Array, inputKeyMaterial: Uint8Array, numOutputs: number): Promise<Uint8Array[]> {
    // HKDF-Extract
    const prk = await this.hmac(chainingKey, inputKeyMaterial);
    
    // HKDF-Expand
    const outputs: Uint8Array[] = [];
    let t = new Uint8Array(0);
    
    for (let i = 1; i <= numOutputs; i++) {
      const info = new Uint8Array([i]);
      const combined = new Uint8Array(t.length + info.length);
      combined.set(t);
      combined.set(info, t.length);
      
      const hmacResult = await this.hmac(prk, combined);
      t = new Uint8Array(hmacResult);
      outputs.push(new Uint8Array(t));
    }
    
    return outputs;
  }
  
  private async hmac(key: Uint8Array, data: Uint8Array): Promise<ArrayBuffer> {
    // Create new ArrayBuffers to avoid SharedArrayBuffer issues
    const keyBuffer = new ArrayBuffer(key.length);
    new Uint8Array(keyBuffer).set(key);
    
    const dataBuffer = new ArrayBuffer(data.length);
    new Uint8Array(dataBuffer).set(data);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    return await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
  }
  
  hasCipherKey(): boolean {
    return this.cipherState.hasKey();
  }
}

// Main Noise handshake state
export class NoiseHandshakeProtocol {
  private symmetricState: NoiseSymmetricState;
  private staticKeypair?: { publicKey: Uint8Array; privateKey: Uint8Array };
  private ephemeralKeypair?: { publicKey: Uint8Array; privateKey: Uint8Array };
  private remoteStaticPublicKey?: Uint8Array;
  private remoteEphemeralPublicKey?: Uint8Array;
  private isInitiator: boolean;
  private messagePatternIndex: number = 0;
  
  constructor(isInitiator: boolean) {
    this.symmetricState = new NoiseSymmetricState();
    this.isInitiator = isInitiator;
  }
  
  async initialize(staticKeypair: { publicKey: Uint8Array; privateKey: Uint8Array }): Promise<void> {
    await this.symmetricState.initializeSymmetric(NOISE_CONSTANTS.PROTOCOL_NAME);
    await this.symmetricState.mixHash(NOISE_CONSTANTS.PROLOGUE);
    
    this.staticKeypair = staticKeypair;
  }
  
  async writeMessage(payload: Uint8Array): Promise<Uint8Array> {
    const patterns = this.isInitiator ? 
      XX_PATTERN.INITIATOR_PATTERNS[this.messagePatternIndex] :
      XX_PATTERN.RESPONDER_PATTERNS[this.messagePatternIndex];
    
    const buffer: Uint8Array[] = [];
    
    for (const token of patterns) {
      switch (token) {
        case 'e':
          this.ephemeralKeypair = await this.generateKeypair();
          buffer.push(this.ephemeralKeypair.publicKey);
          await this.symmetricState.mixHash(this.ephemeralKeypair.publicKey);
          break;
          
        case 's':
          if (!this.staticKeypair) throw new Error('Static keypair not set');
          const encryptedStatic = this.symmetricState.encryptAndHash(this.staticKeypair.publicKey);
          buffer.push(encryptedStatic);
          break;
          
        case 'ee':
          if (!this.ephemeralKeypair || !this.remoteEphemeralPublicKey) {
            throw new Error('Ephemeral keys not available for DH');
          }
          const dhEE = await this.dh(this.ephemeralKeypair.privateKey, this.remoteEphemeralPublicKey);
          await this.symmetricState.mixKey(dhEE);
          break;
          
        case 'es':
          if (this.isInitiator) {
            if (!this.ephemeralKeypair || !this.remoteStaticPublicKey) {
              throw new Error('Keys not available for es DH');
            }
            const dhES = await this.dh(this.ephemeralKeypair.privateKey, this.remoteStaticPublicKey);
            await this.symmetricState.mixKey(dhES);
          } else {
            if (!this.staticKeypair || !this.remoteEphemeralPublicKey) {
              throw new Error('Keys not available for se DH');
            }
            const dhSE = await this.dh(this.staticKeypair.privateKey, this.remoteEphemeralPublicKey);
            await this.symmetricState.mixKey(dhSE);
          }
          break;
          
        case 'se':
          if (this.isInitiator) {
            if (!this.staticKeypair || !this.remoteEphemeralPublicKey) {
              throw new Error('Keys not available for se DH');
            }
            const dhSE = await this.dh(this.staticKeypair.privateKey, this.remoteEphemeralPublicKey);
            await this.symmetricState.mixKey(dhSE);
          } else {
            if (!this.ephemeralKeypair || !this.remoteStaticPublicKey) {
              throw new Error('Keys not available for es DH');
            }
            const dhES = await this.dh(this.ephemeralKeypair.privateKey, this.remoteStaticPublicKey);
            await this.symmetricState.mixKey(dhES);
          }
          break;
      }
    }
    
    // Encrypt payload
    const encryptedPayload = this.symmetricState.encryptAndHash(payload);
    buffer.push(encryptedPayload);
    
    this.messagePatternIndex++;
    
    // Combine all parts
    const totalLength = buffer.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of buffer) {
      result.set(part, offset);
      offset += part.length;
    }
    
    return result;
  }
  
  async readMessage(message: Uint8Array): Promise<Uint8Array> {
    const patterns = this.isInitiator ? 
      XX_PATTERN.RESPONDER_PATTERNS[this.messagePatternIndex] :
      XX_PATTERN.INITIATOR_PATTERNS[this.messagePatternIndex];
    
    let offset = 0;
    
    for (const token of patterns) {
      switch (token) {
        case 'e':
          this.remoteEphemeralPublicKey = message.slice(offset, offset + NOISE_CONSTANTS.DH_LEN);
          await this.symmetricState.mixHash(this.remoteEphemeralPublicKey);
          offset += NOISE_CONSTANTS.DH_LEN;
          break;
          
        case 's':
          const staticLen = this.symmetricState.hasCipherKey() ? 
            NOISE_CONSTANTS.DH_LEN + NOISE_CONSTANTS.AEAD_LEN :
            NOISE_CONSTANTS.DH_LEN;
          const encryptedStatic = message.slice(offset, offset + staticLen);
          this.remoteStaticPublicKey = this.symmetricState.decryptAndHash(encryptedStatic);
          offset += staticLen;
          break;
          
        case 'ee':
          if (!this.ephemeralKeypair || !this.remoteEphemeralPublicKey) {
            throw new Error('Ephemeral keys not available for DH');
          }
          const dhEE = await this.dh(this.ephemeralKeypair.privateKey, this.remoteEphemeralPublicKey);
          await this.symmetricState.mixKey(dhEE);
          break;
          
        case 'es':
          if (this.isInitiator) {
            if (!this.ephemeralKeypair || !this.remoteStaticPublicKey) {
              throw new Error('Keys not available for es DH');
            }
            const dhES = await this.dh(this.ephemeralKeypair.privateKey, this.remoteStaticPublicKey);
            await this.symmetricState.mixKey(dhES);
          } else {
            if (!this.staticKeypair || !this.remoteEphemeralPublicKey) {
              throw new Error('Keys not available for se DH');
            }
            const dhSE = await this.dh(this.staticKeypair.privateKey, this.remoteEphemeralPublicKey);
            await this.symmetricState.mixKey(dhSE);
          }
          break;
          
        case 'se':
          if (this.isInitiator) {
            if (!this.staticKeypair || !this.remoteEphemeralPublicKey) {
              throw new Error('Keys not available for se DH');
            }
            const dhSE = await this.dh(this.staticKeypair.privateKey, this.remoteEphemeralPublicKey);
            await this.symmetricState.mixKey(dhSE);
          } else {
            if (!this.ephemeralKeypair || !this.remoteStaticPublicKey) {
              throw new Error('Keys not available for es DH');
            }
            const dhES = await this.dh(this.ephemeralKeypair.privateKey, this.remoteStaticPublicKey);
            await this.symmetricState.mixKey(dhES);
          }
          break;
      }
    }
    
    // Decrypt payload
    const payloadCiphertext = message.slice(offset);
    const payload = this.symmetricState.decryptAndHash(payloadCiphertext);
    
    this.messagePatternIndex++;
    
    return payload;
  }
  
  async finalize(): Promise<{ sendCipher: NoiseCipherState; receiveCipher: NoiseCipherState; handshakeHash: Uint8Array }> {
    const [cipher1, cipher2] = await this.symmetricState.split();
    const handshakeHash = this.symmetricState.getHandshakeHash();
    
    if (this.isInitiator) {
      return {
        sendCipher: cipher1,
        receiveCipher: cipher2,
        handshakeHash
      };
    } else {
      return {
        sendCipher: cipher2,
        receiveCipher: cipher1,
        handshakeHash
      };
    }
  }
  
  getRemoteStaticPublicKey(): Uint8Array | undefined {
    return this.remoteStaticPublicKey;
  }
  
  // Simple DH implementation (NOT SECURE - replace with actual Curve25519)
  private async dh(privateKey: Uint8Array, publicKey: Uint8Array): Promise<Uint8Array> {
    // This is a mock implementation - in production use actual Curve25519
    const shared = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      shared[i] = privateKey[i] ^ publicKey[i];
    }
    
    // Hash the result to make it more random
    const hashBuffer = await crypto.subtle.digest('SHA-256', shared);
    return new Uint8Array(hashBuffer);
  }
  
  // Simple keypair generation (NOT SECURE - replace with actual Curve25519)
  private async generateKeypair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
    const privateKey = new Uint8Array(32);
    crypto.getRandomValues(privateKey);
    
    // Mock public key generation
    const publicKey = new Uint8Array(32);
    crypto.getRandomValues(publicKey);
    
    return { publicKey, privateKey };
  }
}

// High-level Noise session management
export class NoiseSession {
  private sendCipher?: NoiseCipherState;
  private receiveCipher?: NoiseCipherState;
  private handshakeHash?: Uint8Array;
  private isEstablished: boolean = false;
  private peerId: string;
  
  constructor(peerId: string) {
    this.peerId = peerId;
  }
  
  async establishFromHandshake(
    sendCipher: NoiseCipherState,
    receiveCipher: NoiseCipherState,
    handshakeHash: Uint8Array
  ): Promise<void> {
    this.sendCipher = sendCipher;
    this.receiveCipher = receiveCipher;
    this.handshakeHash = handshakeHash;
    this.isEstablished = true;
    
    console.log(`🔐 Noise session established for peer: ${this.peerId}`);
    console.log(`📊 Handshake hash: ${this.bytesToHex(handshakeHash.slice(0, 8))}...`);
  }
  
  encrypt(plaintext: Uint8Array): Uint8Array {
    if (!this.isEstablished || !this.sendCipher) {
      throw new Error('Session not established');
    }
    
    return this.sendCipher.encrypt(plaintext);
  }
  
  decrypt(ciphertext: Uint8Array): Uint8Array {
    if (!this.isEstablished || !this.receiveCipher) {
      throw new Error('Session not established');
    }
    
    return this.receiveCipher.decrypt(ciphertext);
  }
  
  getHandshakeHash(): Uint8Array | undefined {
    return this.handshakeHash;
  }
  
  isSessionEstablished(): boolean {
    return this.isEstablished;
  }
  
  rekey(): void {
    if (this.sendCipher) this.sendCipher.rekey();
    if (this.receiveCipher) this.receiveCipher.rekey();
  }
  
  destroy(): void {
    if (this.sendCipher) this.sendCipher.clear();
    if (this.receiveCipher) this.receiveCipher.clear();
    if (this.handshakeHash) this.handshakeHash.fill(0);
    
    this.isEstablished = false;
    console.log(`🔒 Noise session destroyed for peer: ${this.peerId}`);
  }
  
  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
