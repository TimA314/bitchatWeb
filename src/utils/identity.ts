import { ed25519, x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';

export interface Identity {
  noiseStaticPrivate: Uint8Array;
  noiseStaticPublic: Uint8Array;
  signingPrivate: Uint8Array;
  signingPublic: Uint8Array;
  fingerprint: string;  // SHA-256 of noiseStaticPublic as hex
}

export function generateIdentity(): Identity {
  // Generate Curve25519 key pair for Noise static keys
  const noiseStaticPrivate = crypto.getRandomValues(new Uint8Array(32));
  const noiseStaticPublic = x25519.getPublicKey(noiseStaticPrivate);
  
  // Generate Ed25519 key pair for signing
  const signingPrivate = crypto.getRandomValues(new Uint8Array(32));
  const signingPublic = ed25519.getPublicKey(signingPrivate);
  
  // Create fingerprint from Noise static public key
  const fingerprintBytes = sha256(noiseStaticPublic);
  const fingerprint = Array.from(fingerprintBytes)
    .map((b) => (b as number).toString(16).padStart(2, '0'))
    .join('');
  
  const identity = {
    noiseStaticPrivate,
    noiseStaticPublic,
    signingPrivate,
    signingPublic,
    fingerprint
  };
  
  // Persist to localStorage (should be encrypted in production)
  const serialized = {
    noiseStaticPrivate: Array.from(noiseStaticPrivate),
    noiseStaticPublic: Array.from(noiseStaticPublic),
    signingPrivate: Array.from(signingPrivate),
    signingPublic: Array.from(signingPublic),
    fingerprint
  };
  
  localStorage.setItem('bitchat_identity', JSON.stringify(serialized));
  
  console.log('🔑 Generated new BitChat identity');
  console.log('🔖 Fingerprint:', fingerprint);
  
  return identity;
}

export function loadIdentity(): Identity | null {
  try {
    const stored = localStorage.getItem('bitchat_identity');
    if (!stored) return null;
    
    const parsed = JSON.parse(stored);
    
    return {
      noiseStaticPrivate: new Uint8Array(parsed.noiseStaticPrivate),
      noiseStaticPublic: new Uint8Array(parsed.noiseStaticPublic),
      signingPrivate: new Uint8Array(parsed.signingPrivate),
      signingPublic: new Uint8Array(parsed.signingPublic),
      fingerprint: parsed.fingerprint
    };
  } catch (error) {
    console.error('Failed to load identity:', error);
    return null;
  }
}