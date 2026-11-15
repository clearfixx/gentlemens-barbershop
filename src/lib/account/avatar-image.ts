export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

const formats = {
  'image/jpeg': { extension: 'jpg', valid: (b: Uint8Array) =>
    b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { extension: 'png', valid: (b: Uint8Array) =>
    b.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v) },
  'image/webp': { extension: 'webp', valid: (b: Uint8Array) =>
    b.length >= 16 && String.fromCharCode(...b.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...b.slice(8, 12)) === 'WEBP' },
} as const

export type AvatarMimeType = keyof typeof formats

export function validateAvatarBytes(mimeType: string, bytes: Uint8Array): { extension: string; mimeType: AvatarMimeType } {
  const format = formats[mimeType as AvatarMimeType]
  if (!format || bytes.length === 0 || bytes.length > AVATAR_MAX_BYTES || !format.valid(bytes)) {
    throw new RangeError('Invalid profile photo: JPEG, PNG or WebP up to 2 MB')
  }
  return { extension: format.extension, mimeType: mimeType as AvatarMimeType }
}
