/**
 * Authentication middleware for endpoints that allow access via API key
 *
 * The middleware first looks for a valid signatrue in the header; if not found
 * it defaults to session-based authentication.
 *
 * If no valid authentication method is found, it 403s.
 */
import crypto from 'crypto'
import { Request, Response, NextFunction, RequestHandler } from 'express'

const KNOWN_PUBLIC_KEYS = []


/**
 * Load public key (as string) into a crypto.KeyObject
 */
export function loadPublicKey(key: string): crypto.KeyObject {
    return crypto.createPublicKey({ key, format: 'pem' })
}


/**
 * Validate a signature given a request and a public key.
 *
 * We assume the content hash is created as follows:
 * - the hash is of the request body
 * - padding is PSS
 * - hash algorithm is SHA256
 * - salt length is 0
 */
export function isValidSignature(
    request: Request,
    signature: string,
    publicKey: crypto.KeyObject,
): boolean {
    const verifier = crypto.createVerify('sha256')
    verifier.write(request.body)
    verifier.end()

    return verifier.verify(
        {
            key: publicKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: 0,
        },
        signature,
        'hex',
    )
}

/**
 * If a Signature header is present, treat this as service-based authentication;
 * if we cannot find a public key for which the signature is valid, return a 403.
 *
 * If no Signature header is present, assume we are using cookie-based authentication
 * and fall through to the csrf middleware.
 */
export function publicKeyOrSessionAuth(csrfMiddleware: RequestHandler): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check for a signature, which indicates service-based access
    const signature = req.header('Signature')
    if (signature) {
      // Look for a public key for which the signature is valid
      let success = false
      for (let i = 0; i < KNOWN_PUBLIC_KEYS.length; i++) {
          let publicKey: crypto.KeyObject
          try {
              publicKey = loadPublicKey(KNOWN_PUBLIC_KEYS[i])
          } catch (e) {
              console.log(`Could not load public key ${i} - must be in bad format`)
              continue
          }

          success = success || isValidSignature(req, signature, publicKey)

          if (success) {
              break
          }
      }

      // Return 403 if invalid
      if (!success) {
        const msg = `Could not validate signature`
        console.log(msg)
        res.status(403).send(msg)
      }

      next()
      return
    }

    // If an API key is not provided, validate the session & csrf token
    csrfMiddleware(req, res, next)
  }
}

