import { beforeAll, describe, expect, it } from 'vitest'

let encrypt: typeof import('@/lib/crypto').encrypt
let decrypt: typeof import('@/lib/crypto').decrypt

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-vitest-suite-32-chars'
  const cryptoModule = await import('@/lib/crypto')
  encrypt = cryptoModule.encrypt
  decrypt = cryptoModule.decrypt
})

describe('Crypto module tests', () => {
  it('should round-trip encrypt and decrypt a normal string', () => {
    const original = 'Hello world!'
    const encrypted = encrypt(original)
    expect(encrypted).not.toBe(original)
    expect(decrypt(encrypted)).toBe(original)
  })

  it('should round-trip encrypt and decrypt a unicode string', () => {
    const original = '👋 🧑‍💻 🚀 中文 日本語 🧪'
    const encrypted = encrypt(original)
    expect(decrypt(encrypted)).toBe(original)
  })

  it('should round-trip encrypt and decrypt a long string', () => {
    const original = 'a'.repeat(10000)
    const encrypted = encrypt(original)
    expect(decrypt(encrypted)).toBe(original)
  })

  it('should return empty string for empty input', () => {
    expect(encrypt('')).toBe('')
    expect(decrypt('')).toBe('')
  })

  it('should produce different ciphertexts for the same plaintext due to random IV', () => {
    const plaintext = 'super-secret-plaintext'
    const enc1 = encrypt(plaintext)
    const enc2 = encrypt(plaintext)
    expect(enc1).not.toBe(enc2)
    expect(decrypt(enc1)).toBe(plaintext)
    expect(decrypt(enc2)).toBe(plaintext)
  })

  it('should throw an error on malformed input', () => {
    expect(() => decrypt('notvalid')).toThrow()
    expect(() => decrypt('part1:part2')).toThrow()
  })

  it.skip('should skip legacy CBC path testing as CBC support has been removed', () => {
    // CBC support was removed in Phase 14.
  })
})
