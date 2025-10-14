import * as crypto from 'node:crypto'

export class CSRF {
  keys: Array<any>
  constructor(keys: Array<any>) {
    this.keys = keys
  }

  // sessionId is base64-encoded
  // salt is base64-encoded
  // returns base64-encoded hash
  #hmacSessionIdAndSalt(sessionId: string, salt: string): string {
    const hmac = crypto.createHmac('sha256', this.keys[0])
    hmac.update([sessionId.length, sessionId, salt.length, salt].join('!'))
    return hmac.digest('base64')
  }

  // sessionId is base64-encoded
  // returns base64-encoded hmac
  generateToken(sessionId: string): string {
    const saltLength = 64
    const salt = crypto.randomBytes(saltLength).toString('base64')
    const hash = this.#hmacSessionIdAndSalt(sessionId, salt)
    return hash + '.' + salt
  }

  // sessionId is base64-encoded
  // token is base64-encoded hmac
  isTokenValid(sessionId: string, token: string): boolean {
    const [actual, salt] = token.split('.', 2)
    const expected = this.#hmacSessionIdAndSalt(sessionId, salt)
    return actual === expected
  }
}
