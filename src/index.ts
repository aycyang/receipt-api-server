/**
 * TODO
 * - raw esc/pos endpoint: send me raw esc/pos bytes and I parse and validate
 *   it, then send it to the printer (1 hour)
 * - refactor csrf validation into middleware so I don't have to manually check
 *   it every time (30 min)
 * - check for csrf token in more places: header names other than X-CSRF-Token,
 *   in hidden form inputs (20 min)
 * - look into leveraging openapi middleware for reducing the manual work of
 *   writing out API method signatures and writing docs (30 min)
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
 */

import express, { Request, Response } from 'express'
import * as Cookies  from 'cookies'
import cookieSession from 'cookie-session'
import * as oauthClient from 'openid-client'
import { CSRF } from './csrf'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as escpos from './escpos'
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
  issuer: 'rc', // unknown for recurse.com but required by openid-client
  authorization_endpoint: 'https://www.recurse.com/oauth/authorize',
  token_endpoint: 'https://www.recurse.com/oauth/token',
}

const config: oauthClient.Configuration = new oauthClient.Configuration(
  serverMetadata,
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET)

app.get('/', (req: Request, res: Response) => {
  res.send('<h1>Receipt Printer API Server</h1><a href="login">Click here to authenticate with Receipt Printer API Server by way of RC OAuth.</a><br><br><br><br><br>This site is under construction. Check out the <a href="https://github.com/aycyang/receipt-api-server">source code</a>.')
})

app.get('/login', async (req: Request, res: Response) => {
  req.session.referrer = req.header('Referer')
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
  res.send(`<br>Hello, <strong>${me.first_name}</strong>! You are now authenticated with Receipt Printer API Server.<br><br>To go back from whence you came: <a href=${req.session.referrer}>${req.session.referrer}</a><br><br><br><br><br>This site is under construction. Check out the <a href="https://github.com/aycyang/receipt-api-server">source code</a>.`)
})


const corsOptions = {
  origin: /\.recurse\.com$/,
  credentials: true,
}

app.options('/text', cors(corsOptions))
app.post('/text', cors(corsOptions), express.json(), express.urlencoded(), async (req: Request, res: Response) => {
  if (process.env.AUTHENTICATION === 'on') {
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
  }
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
  res.send(`Printed:<br><pre>${content}</pre><br>Thank you!\n`)
})

app.options('/escpos', cors(corsOptions))
app.post('/escpos', cors(corsOptions), express.raw('application/octet-stream'), async (req: Request, res: Response) => {
  if (process.env.AUTHENTICATION === 'on') {
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
  }
  if (!escpos.validate(req.body)) {
    console.log('invalid escpos: ' + req.body)
    res.status(400).end()
    return
  }
  fs.writeFile(process.env.OUT_FILE, req.body, err => {
    if (err) {
      console.error(err)
    } else {
      console.log(`escpos: wrote ${req.body.length} bytes to ${process.env.OUT_FILE}`)
    }
  })
  res.send('Thank you!\n')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
