/**
 * TODO
 * - document redirect_uri (10 min)
 * - only show login link on receipt.recurse.com homepage if there's no session
 *   cookie (20 min)
 * - write deployment command (no watch) and systemd config to start on boot
 *   (10 min)
 * - html templating with ejs (20 min)
 * - generate docs using js docstring (10 min)
 * - raw esc/pos endpoint: send me raw esc/pos bytes and I parse and validate
 *   it, then send it to the printer (1 hour)
 * - check for csrf token in more places: header names other than X-CSRF-Token,
 *   in hidden form inputs (20 min)
 * - look into adding GET routes for two-way communication with printer. for
 *   example, there is a command to get paper sensor status (40 min)
 * - text endpoint: add validation to check that characters are exclusively
 *   printable ascii, etc. (20 min)
 * - text endpoint: add some formatting options (e.g. font selection,
 *   horiz/vertical stretching, justification, upside down, bold, color
 *   inversion, underline, strikethrough) (20 min)
 * - image endpoint: send me a jpg/png/gif and I validate, resize, preprocess
 *   and print it (with dry-run/preview option?) (hard to make this composable
 *   with text and other esc/pos commands, but should be useful for people who
 *   just want a no-fuss way to print an image) (2 hours)
 * - secret key rotation (30 min)
 * - investigate if concurrent requests can interfere with each other (30 min)
 * - if not receipt.recurse.com, redirect to it (20 min)
 *   - add a bit of client-side JS that will check the origin and redirect if
 *     it's not process.env.ORIGIN
 * - some kind of audit log
 * - parameterize oauth endpoints so oauth provider can be mocked out (10 min)
 * - set up test with mock oauth provider (1 hour)
 *
 * TESTS
 * - can't read csrf token cross-site if not *.recurse.com subdomain
 * - send csrf token in hidden form input
 * - send csrf token as http header
 */

import assert from 'node:assert'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import express, { Request, Response } from 'express'
import cookieSession from 'cookie-session'
import * as oauthClient from 'openid-client'
import { Csrf } from './csrf'
import * as escpos from './escpos'
const cors = require('cors')

assert(process.env.AUTHENTICATION, 'Environment variable AUTHENTICATION is missing')
assert(process.env.OUT_FILE, 'Environment variable OUT_FILE is missing')
assert(process.env.CSRF_COOKIE_DOMAIN, 'Environment variable CSRF_COOKIE_DOMAIN is missing')
assert(process.env.ALLOW_ORIGIN_REGEX, 'Environment variable ALLOW_ORIGIN_REGEX is missing')
assert(process.env.ORIGIN, 'Environment variable ORIGIN is missing')
assert(process.env.CLIENT_ID, 'Environment variable CLIENT_ID is missing')
assert(process.env.CLIENT_SECRET, 'Environment variable CLIENT_SECRET is missing')
assert(process.env.SECRET_KEY, 'Environment variable SECRET_KEY is missing')

const allowOriginRegex = new RegExp(process.env.ALLOW_ORIGIN_REGEX)

const app = express()

// TODO rotate keys
const secretKeys = [ process.env.SECRET_KEY ]
const maxAge = 24 * 60 * 60 * 1000 // 24 hours

app.use(cookieSession({
  name: 'session',
  keys: secretKeys,
  maxAge,
}))

const corsOptions = {
  // If the Origin request header matches the regex, it is reflected back in
  // the Access-Control-Allow-Origin response header.
  origin: allowOriginRegex,
  // Enable cookies because we need the session cookie to prove authentication.
  credentials: true,
}

app.use(cors(corsOptions))

const csrf = new Csrf(secretKeys)

const noopMiddleware = (req, res, next) => next()

// TODO accept other truthy values
const isAuthEnabled = process.env.ENABLE_AUTH === 'on'

const port = 3000

const serverMetadata: oauthClient.ServerMetadata = {
  issuer: 'rc', // unknown for recurse.com but required by openid-client
  authorization_endpoint: 'https://www.recurse.com/oauth/authorize',
  // Without 'www.', the POST method is not allowed.
  token_endpoint: 'https://www.recurse.com/oauth/token',
}

const config: oauthClient.Configuration = new oauthClient.Configuration(
  serverMetadata,
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET)

app.get('/', (req: Request, res: Response) => {
  res.send('<h1>Receipt Printer API Server</h1><a href="login">Click here to authenticate with Receipt Printer API Server by way of RC OAuth.</a><br><br><br><br><br>This site is under construction. Check out the <a href="https://github.com/aycyang/receipt-api-server">source code</a>.')
})

app.get('/login', (req: Request, res: Response) => {
  req.session.referer = req.header('Referer')
  // redirect_uri is an optional URL parameter which this server will redirect
  // back to after authentication is complete.
  if (req.query.redirect_uri) {
    // Validate the redirect URI.
    const redirectUri = req.query.redirect_uri.toString()
    let url: URL
    try {
      url = new URL(redirectUri)
    } catch (e) {
      // Not a URL.
      console.error(``)
      res.status(400).json({ error: `'${redirectUri}' is not a URL.` })
      return
    }
    // To be safe, only redirect if domain is trusted.
    if (!url.host.match(allowOriginRegex)) {
      res.status(400).json({ error: `'${redirectUri}' is not an allowed origin.` })
      return
    }
    req.session.redirectUri = redirectUri
  } else {
    // Explicitly unset the redirect URI if it's not in the query params.
    // Otherwise, a redirect URI from a stale session may be used.
    req.session.redirectUri = undefined
  }

  // Kick off the RC OAuth authorization code flow.
  req.session.state = oauthClient.randomState()
  const parameters: Record<string, string> = {
    redirect_uri: process.env.ORIGIN + '/callback',
    scope: 'public',
    state: req.session.state,
  }
  res.redirect(oauthClient.buildAuthorizationUrl(config, parameters).toString())
})

app.get('/callback', async (req: Request, res: Response) => {
  const currentURL = new URL(process.env.ORIGIN + req.originalUrl)
  const tokens = await oauthClient.authorizationCodeGrant(
    config,
    currentURL,
    { expectedState: req.session.state })
  const meRes = await oauthClient.fetchProtectedResource(
    config,
    tokens.access_token,
    new URL('https://www.recurse.com/api/v1/profiles/me'),
    'GET')
  const me = await meRes.json()
  req.session.rcId = me.id
  const tomorrow: Date = new Date(Date.now() + maxAge)
  req.session.id = crypto.randomUUID()
  req.session.expiresAt = tomorrow
  const csrfToken = csrf.generateToken(req.session.id)
  res.cookie('receipt_csrf', csrfToken, {
    // Readable by client-side JS.
    httpOnly: false,
    // Accessible by frontends served from a subdomain of the parent domain.
    domain: process.env.CSRF_COOKIE_DOMAIN,
    // Expires at the same time as the session cookie it is tied to.
    expires: tomorrow,
    // The CSRF token cookie does not need to be signed.
    signed: false,
  })
  if (req.session.redirectUri) {
    res.redirect(req.session.redirectUri)
  } else {
    const goBackHtml = `go back from whence you came: <a href="${req.session.referer}">${req.session.referer}</a>`
    res.send(`<br>Hello, <strong>${me.first_name}</strong>! You are now authenticated with Receipt Printer API Server.<br><br>${req.session.referer ? goBackHtml : ''}<br><br><br><br><br>This site is under construction. Check out the <a href="https://github.com/aycyang/receipt-api-server">source code</a>.`)
  }
})

app.options('/status', (req, res) => res.sendStatus(204))
app.get('/status',
  isAuthEnabled ? csrf.express() : noopMiddleware,
  (req, res) => {
    // TODO ping printer
    res.json({status: 'online'})
  }
)

// TODO use same CORS rules for all endpoints
// Handle CORS preflight requests.
app.options('/text', (req, res) => res.sendStatus(204))
app.post('/text',
  express.json(),
  express.urlencoded(),
  isAuthEnabled ? csrf.express() : noopMiddleware,
  async (req: Request, res: Response) => {
  const content = req.body.text
  const buf = Buffer.from(
    '\x1b\x40' + content + '\x1b\x64\x06' + '\x1d\x56\x00')
  fs.writeFile(process.env.OUT_FILE, buf, err => {
    if (err) {
      console.error(err)
    } else {
      console.log(`text: wrote to ${process.env.OUT_FILE}`)
    }
  })
  console.log(req.body)
  console.log(`wrote to ${process.env.OUT_FILE}`)
  res.json({})
})

// Handle CORS preflight requests.
app.options('/escpos', (req, res) => res.sendStatus(204))
app.post('/escpos',
  express.raw({ type: 'application/octet-stream' }),
  isAuthEnabled ? csrf.express() : noopMiddleware,
  async (req: Request, res: Response) => {
  if (!escpos.validate(req.body)) {
    console.log('invalid escpos: ' + req.body)
    res.status(400).json({error: 'invalid escpos'})
    return
  }
  fs.writeFile(process.env.OUT_FILE, req.body, err => {
    if (err) {
      console.error(err)
    } else {
      console.log(`escpos: wrote ${req.body.length} bytes to ${process.env.OUT_FILE}`)
    }
  })
  res.json({})
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
