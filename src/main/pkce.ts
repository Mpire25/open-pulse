import { createHash, randomBytes } from 'node:crypto'

export interface PkcePair {
  verifier: string
  challenge: string
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function randomState(): string {
  return randomBytes(16).toString('base64url')
}

/** Decode a JWT payload without verifying the signature (for reading claims client-side). */
export function decodeJwtPayload<T>(jwt: string): T | null {
  try {
    const payload = jwt.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}
