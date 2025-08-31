// Type declarations for bitchat-qudag WASM module
// Based on https://docs.rs/crate/bitchat-qudag/latest
declare module 'bitchat-qudag-wasm' {
  export default function init(): Promise<void>;
  
  // Core BitChat Protocol Types
  export interface BitChatIdentity {
    fingerprint: string;
    public_key: Uint8Array;
    private_key: Uint8Array;
    nickname?: string;
  }
  
  export interface BitChatMessage {
    id: string;
    content: string;
    timestamp: number;
    sender_fingerprint: string;
    recipient_fingerprint?: string;
    is_private: boolean;
    signature: Uint8Array;
  }
  
  export interface NoiseHandshakeState {
    state: Uint8Array;
    is_initiator: boolean;
    is_complete: boolean;
  }
  
  export interface EncryptedPayload {
    ciphertext: Uint8Array;
    nonce: Uint8Array;
  }
  
  // Identity Management
  export function generate_identity(nickname?: string): BitChatIdentity;
  export function identity_from_private_key(private_key: Uint8Array, nickname?: string): BitChatIdentity;
  export function serialize_identity(identity: BitChatIdentity): Uint8Array;
  export function deserialize_identity(data: Uint8Array): BitChatIdentity;
  
  // Message Operations
  export function create_message(
    content: string, 
    sender: BitChatIdentity, 
    recipient_fingerprint?: string
  ): BitChatMessage;
  export function serialize_message(message: BitChatMessage): Uint8Array;
  export function deserialize_message(data: Uint8Array): BitChatMessage;
  export function verify_message_signature(message: BitChatMessage, sender_public_key: Uint8Array): boolean;
  
  // Noise Protocol Implementation
  export function noise_handshake_init(): NoiseHandshakeState;
  export function noise_handshake_respond(initiator_payload: Uint8Array): NoiseHandshakeState;
  export function noise_handshake_step(
    state: NoiseHandshakeState, 
    peer_payload?: Uint8Array
  ): { state: NoiseHandshakeState; payload?: Uint8Array };
  export function noise_encrypt(state: NoiseHandshakeState, plaintext: Uint8Array): EncryptedPayload;
  export function noise_decrypt(state: NoiseHandshakeState, encrypted: EncryptedPayload): Uint8Array;
  
  // Quantum-Resistant Cryptography
  export function generate_post_quantum_keypair(): { public_key: Uint8Array; private_key: Uint8Array };
  export function post_quantum_encrypt(public_key: Uint8Array, plaintext: Uint8Array): Uint8Array;
  export function post_quantum_decrypt(private_key: Uint8Array, ciphertext: Uint8Array): Uint8Array;
  
  // Mesh Network Utilities
  export function calculate_mesh_route(
    nodes: Array<{ fingerprint: string; connections: string[] }>,
    source: string,
    destination: string
  ): string[];
  
  // Error Types
  export class BitChatError extends Error {
    constructor(message: string);
  }
  
  export class NoiseError extends Error {
    constructor(message: string);
  }
  
  export class CryptoError extends Error {
    constructor(message: string);
  }
}
