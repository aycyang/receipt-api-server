/**
 * Authentication middleware for endpoints that allow access via API key
 *
 * The middleware first looks for a valid API key in the header; if not found
 * it defaults to session-based authentication.
 *
 * If not valid authentication method is found, it 403s.
 */
import { Request, Response, NextFunction, RequestHandler } from 'express'
import { Database } from 'sqlite3'

import * as dblib from './db'

export function apiOrSessionAuth(db: Database, csrfMiddleware: RequestHandler): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check for an API key
    const apikey = req.header('X-API-Key')
    if (apikey) {  
      const row = await dblib.getKey(db, apikey)
      if (!row) {
        console.log("Provided key not found or deleted")
        res.status(403).end()
      }

      // Valid key found; call next and short circuit
      dblib.updateKeyLastUsedAt(db, row.key)
      next()
      return
    }

    // If an API key is not provided, validate the session & csrf token
    csrfMiddleware(req, res, next)
  }
}

