import * as crypto from 'node:crypto'
import { Request, Response, NextFunction, RequestHandler } from 'express'

export class Csrf {
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

  // express middleware
  express(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.session) {
        console.log("no session")
        res.status(403).end()
        return
      }
      if (Date.now() > req.session.expiresAt) {
        console.log("session expired")
        res.status(403).end()
        return
      }
      const sessionId = req.session.id
      if (!sessionId) {
        console.log("no session id")
        res.status(403).end()
        return
      }
      const csrfToken = req.header('X-CSRF-Token')
      if (!csrfToken) {
        console.log("no csrf token")
        res.status(403).end()
        return
      }
      if (!this.isTokenValid(req.session.id, csrfToken)) {
        console.log("csrf token not valid")
        res.status(403).end()
        return
      }
      next()
    }
  }
}
