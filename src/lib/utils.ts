/**
 * Utility for conditional class names (cn function).
 * Compatible with Tailwind CSS merge.
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format price in Kazakhstani tenge (₸)
 */
export function formatPrice(amount: number, _currency = 'KZT'): string {
  const formatted = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 0,
  }).format(amount)
  return `${formatted} ₸`
}

/**
 * Format phone for Kazakhstan display (+7 (7XX) XXX-XX-XX)
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 11) {
    return `+7 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9, 11)}`
  }
  return phone
}

/**
 * Pure TypeScript SHA-256 implementation.
 * Used as universal fallback when crypto.subtle is undefined
 * (e.g. on HTTP IP testing from mobile Safari / Android over local Wi-Fi).
 */
function sha256Fallback(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount))
  }
  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  let result = ''

  const words: number[] = []
  const asciiBitLength = ascii.length * 8

  let hash: number[] = []
  const k: number[] = []
  let primeCounter = 0

  const isPrime = (n: number) => {
    for (let factor = 2, max = Math.sqrt(n); factor <= max; factor++) {
      if (n % factor === 0) return false
    }
    return true
  }

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (isPrime(candidate)) {
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 1 / 2) * maxWord) | 0
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0
      primeCounter++
    }
  }

  ascii += '\x80'
  while ((ascii.length % 64) - 56) ascii += '\x00'
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i)
    words[i >> 2] = (words[i >> 2] || 0) | (j << ((3 - (i % 4)) * 8))
  }
  words[words.length] = (asciiBitLength / maxWord) | 0
  words[words.length] = asciiBitLength | 0

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16))
    const oldHash = hash
    hash = hash.slice(0, 8)

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15] ?? 0
      const w2 = w[i - 2] ?? 0

      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)
      w[i] = i < 16 ? (w[i] ?? 0) : ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) | 0

      const h0 = hash[0] ?? 0
      const h1 = hash[1] ?? 0
      const h2 = hash[2] ?? 0
      const h3 = hash[3] ?? 0
      const h4 = hash[4] ?? 0
      const h5 = hash[5] ?? 0
      const h6 = hash[6] ?? 0
      const h7 = hash[7] ?? 0

      const ch = (h4 & h5) ^ (~h4 & h6)
      const maj = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2)
      const temp1 =
        (h7 +
          (rightRotate(h4, 6) ^ rightRotate(h4, 11) ^ rightRotate(h4, 25)) +
          ch +
          (k[i] ?? 0) +
          (w[i] ?? 0)) |
        0
      const temp2 = ((rightRotate(h0, 2) ^ rightRotate(h0, 13) ^ rightRotate(h0, 22)) + maj) | 0

      hash = [(temp1 + temp2) | 0, h0, h1, h2, (h3 + temp1) | 0, h4, h5, h6]
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = ((hash[i] ?? 0) + (oldHash[i] ?? 0)) | 0
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = ((hash[i] ?? 0) >> (b * 8)) & 255
      result += (byte < 16 ? '0' : '') + byte.toString(16)
    }
  }
  return result
}

/**
 * Hash a string (with crypto.subtle when available in Secure Context / HTTPS,
 * or with pure JS SHA-256 fallback when in HTTP / local IP).
 */
export async function hashToken(token: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle?.digest) {
      const hashBuffer = await window.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(token)
      )
      return Array.from(new Uint8Array(hashBuffer), (b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    // fallback if subtle digest fails or is blocked by browser policy
  }
  return sha256Fallback(token)
}

/**
 * Generate a cryptographic access token for booking
 */
export async function generateAccessToken(): Promise<{ token: string; hash: string }> {
  let token = ''
  try {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const array = new Uint8Array(32)
      window.crypto.getRandomValues(array)
      token = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    // fallback
  }

  if (!token) {
    // Universal fallback random generator
    token = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, '0')
    ).join('')
  }

  const hash = await hashToken(token)
  return { token, hash }
}

/**
 * Generate idempotency key from booking parameters
 */
export function generateIdempotencyKey(
  tenantId: string,
  serviceId: string,
  startAt: string,
  clientPhone: string
): string {
  return `${tenantId}:${serviceId}:${startAt}:${clientPhone}`
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + '…'
}

/**
 * Delay helper for debouncing
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Client-side image compression: reads an image File and compresses it
 * to max 1280px width/height as a high-efficiency JPEG Data URL.
 */
export function compressImageFile(
  file: File,
  maxWidth = 1280,
  maxHeight = 1280,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          } else {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(e.target?.result as string)
          return
        }

        ctx.drawImage(img, 0, 0, width, height)
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(compressedDataUrl)
      }
      img.src = e.target?.result as string
    }
    reader.readAsDataURL(file)
  })
}
