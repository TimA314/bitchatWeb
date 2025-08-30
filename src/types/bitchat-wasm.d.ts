// Type declarations for bitchat-qudag WASM module
declare module '@bitchat/qudag-wasm' {
  export default function init(): Promise<void>;
  
  export interface BitChatWasmIdentity {
    fingerprint: string;
    publicKey: Uint8Array;
    privateKey: Uint8Array;
    nickname: string;
  }
  
  export interface BitChatWasmMessage {
    id: string;
    content: string;
    timestamp: number;
    sender: string;
    recipient?: string;
    isPrivate: boolean;
    signature?: Uint8Array;
  }
  
  export function generate_identity(): BitChatWasmIdentity;
  export function serialize_message(message: BitChatWasmMessage): Uint8Array;
  export function deserialize_message(data: Uint8Array): BitChatWasmMessage;
  export function verify_signature(message: BitChatWasmMessage, publicKey: Uint8Array): boolean;
}
