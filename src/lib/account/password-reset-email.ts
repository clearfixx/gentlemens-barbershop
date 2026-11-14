/** Build a reset email without allowing untrusted user input into HTML. */
export function buildPasswordResetEmail(token: string | undefined, siteUrl: string | undefined, production: boolean): string {
  if (!token || token.length > 2048 || !siteUrl) throw new Error('Password reset configuration is invalid')
  const origin = new URL(siteUrl)
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error('Invalid password reset origin')
  }
  if (production && origin.protocol !== 'https:') throw new Error('Password reset requires HTTPS')
  const reset = new URL('/uk/auth/reset-password', origin)
  reset.searchParams.set('token', token)
  const href = reset.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return '<p>Gentlemen’s Barbershop — password reset</p><p><a href="' + href + '">Reset password / Відновити пароль</a></p><p>This link expires in 60 minutes.</p>'
}
