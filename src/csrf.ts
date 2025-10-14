import * as crypto from 'node:crypto'

const hmacSecret = 'TODO hmac secret'

// sessionId is base64-encoded
// salt is base64-encoded
// returns base64-encoded hash
function hmacSessionIdAndSalt(sessionId: string, salt: string): string {
  const hmac = crypto.createHmac('sha256', hmacSecret)
  hmac.update([sessionId.length, sessionId, salt.length, salt].join('!'))
  return hmac.digest('base64')
}

// sessionId is base64-encoded
// returns base64-encoded hmac
export function generateToken(sessionId: string): string {
  const saltLength = 64
  const salt = crypto.randomBytes(saltLength).toString('base64')
  const hash = hmacSessionIdAndSalt(sessionId, salt)
  return hash + '.' + salt
}

// sessionId is base64-encoded
// token is base64-encoded hmac
export function isTokenValid(sessionId: string, token: string): boolean {
  const [actual, salt] = token.split('.', 2)
  const expected = hmacSessionIdAndSalt(sessionId, salt)
  return actual === expected
}
