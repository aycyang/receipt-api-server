import * as crypto from 'node:crypto'

export class CSRF {
  keys: Array<any>
  constructor(keys: Array<any>) {
    this.keys = keys
  }

  // sessionId is uuid
  // salt is hex string
  // returns hex hmac
  #hmacSessionIdAndSalt(sessionId: string, salt: string): string {
    const hmac = crypto.createHmac('sha256', this.keys[0])
    hmac.update([sessionId.length, sessionId, salt.length, salt].join('!'))
    return hmac.digest('hex')
  }

  // sessionId is uuid
  // returns hex hmac '.' hex salt
  generateToken(sessionId: string): string {
    const saltLength = 64
    const salt = crypto.randomBytes(saltLength).toString('hex')
    const hash = this.#hmacSessionIdAndSalt(sessionId, salt)
    return hash + '.' + salt
  }

  // sessionId is uuid
  // token is hex hmac
  isTokenValid(sessionId: string, token: string): boolean {
    const [actual, salt] = token.split('.', 2)
    const expected = this.#hmacSessionIdAndSalt(sessionId, salt)
    return actual === expected
  }
}
