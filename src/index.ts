/**
 * TODO
 * - create a simple, CSRF-protected API for doing the most basic thing (print text and cut) (20 min)
 * - set up a basic frontend on a different subdomain to test cross-subdomain API calls (1 hour)
 * - key rotation
 * - if not receipt.recurse.com, redirect to it
 */

import express, { Request, Response } from 'express'
import * as Cookies  from 'cookies'
import cookieSession from 'cookie-session'
import * as oauthClient from 'openid-client'
import { CSRF } from './csrf'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
const cors = require('cors')

const app = express()

// TODO rotate keys
const secretKey = Buffer.from(process.env.SECRET_KEY, 'hex')
const secretKeys = [ secretKey ]

app.use(Cookies.express(secretKeys))

app.use(cookieSession({
  name: 'session',
  keys: secretKeys,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
}))

const csrf = new CSRF(secretKeys)

const port = 3000

const serverMetadata: oauthClient.ServerMetadata = {
  issuer: 'rc', // unknown for recurse.com
  authorization_endpoint: 'https://www.recurse.com/oauth/authorize',
  token_endpoint: 'https://www.recurse.com/oauth/token',
}

const config: oauthClient.Configuration = new oauthClient.Configuration(
  serverMetadata,
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET)

app.get('/', (req: Request, res: Response) => {
  res.send('<a href="login">login to RC</a>')
})

app.get('/login', async (req: Request, res: Response) => {
  req.session.state = oauthClient.randomState()
  const parameters: Record<string, string> = {
    redirect_uri: process.env.ORIGIN + '/callback',
    scope: 'public',
    state: req.session.state,
  }
  res.redirect(oauthClient.buildAuthorizationUrl(config, parameters))
})


app.get('/callback', async (req: Request, res: Response) => {
  const params = new URLSearchParams(req.query).toString()
  const currentURL = new URL(process.env.ORIGIN + '/callback?' + params)
  const tokens = await oauthClient.authorizationCodeGrant(config, currentURL, {
    expectedState: req.session.state,
  })
  const meRes = await oauthClient.fetchProtectedResource(
    config,
    tokens.access_token,
    new URL('https://www.recurse.com/api/v1/profiles/me'),
    'GET')
  const me = await meRes.json()
  req.session.id = crypto.randomUUID()
  const csrfToken = csrf.generateToken(req.session.id)
  res.cookies.set('receipt_csrf', csrfToken, {
    httpOnly: false,
    domain: process.env.PARENT_DOMAIN,
  })
  res.send(`hello, ${me.first_name}!`)
})

const corsOptions = {
  origin: /\.recurse\.com$/,
  credentials: true,
}

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.post('/text', cors(corsOptions), async (req: Request, res: Response) => {
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
  if (!csrf.isTokenValid(req.session.id, csrfToken)) {
    console.log("csrf token not valid")
    res.status(403).end()
    return
  }
  const content = req.body.text
  const buf = Buffer.from(
    '\x1b\x40' + content + '\x1b\x64\x06' + '\x1d\x56\x00')
  fs.writeFile(process.env.OUT_FILE, buf, err => {
    if (err) {
      console.error(err)
    } else {
      console.log(`wrote to ${process.env.OUT_FILE}`)
    }
  })
  console.log(req.body)
  res.send('ok\n')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
