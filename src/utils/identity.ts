// BitChat Identity Management
// Simplified identity generation and management

export interface UserIdentity {
  id: string;
  nickname: string;
  publicKey?: string;
  fingerprint: string;
  created: Date;
}

// Generate a simple identity for now
export function generateIdentity(nickname: string = 'Anonymous'): UserIdentity {
  // Generate a simple ID based on timestamp and random
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const id = `${timestamp}-${random}`;
  
  // Create a simple fingerprint
  const fingerprint = btoa(`${nickname}-${id}`).substring(0, 16);
  
  return {
    id,
    nickname,
    fingerprint,
    created: new Date()
  };
}

// Get or create stored identity
export function getStoredIdentity(): UserIdentity | null {
  try {
    const stored = localStorage.getItem('bitchat-identity');
    if (stored) {
      const identity = JSON.parse(stored);
      identity.created = new Date(identity.created);
      return identity;
    }
  } catch (error) {
    console.warn('Failed to load stored identity:', error);
  }
  return null;
}

// Store identity
export function storeIdentity(identity: UserIdentity): void {
  try {
    localStorage.setItem('bitchat-identity', JSON.stringify(identity));
  } catch (error) {
    console.warn('Failed to store identity:', error);
  }
}

// Get or create identity
export function getCurrentIdentity(): UserIdentity {
  let identity = getStoredIdentity();
  if (!identity) {
    identity = generateIdentity();
    storeIdentity(identity);
  }
  return identity;
}
