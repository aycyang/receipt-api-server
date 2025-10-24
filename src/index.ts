// TODO
// - git pre-commit hook for auto-generating docs, formatting code, linting
// - /image
//   - optional boolean for dry-run/print-preview
//   - return print stats (e.g. bytes_written, image_resized, image_dithered)
//     in json response
//   - return profiling information
// - /text
//   - validate characters are exclusively in range 32-126
// - /escpos
//   - parse and validate before sending to printer (err on being more lenient)
// - /status
//   - look into printer real-time transmit status command
// - check for csrf token in more places: header names other than X-CSRF-Token,
//   in hidden form inputs (20 min)
// - look into why sending large jpg image is slow, do some profiling, send
//   some debug info
//
// - secret key rotation (30 min)
// - investigate if concurrent requests can interfere with each other (30 min)
// - some kind of audit log, stored in a local database mapping user id to
//   lines printed, head energizing strokes, autocutter operations
// - parameterize oauth endpoints so oauth provider can be mocked out (10 min)
// - set up test with mock oauth provider (1 hour)
//
// - archival scanning automation (auto straightening/image stitching tools)
// - online gallery/rss feed
// - automatic deploys (github actions self-hosted runner?)
// - staging environment (maybe it prints to an emulator or a file)
// - automated testing (selenium against staging?)
// - troubleshooting guide (on homepage)
// - development guide (in readme)
// - sysadmin/provisioning guide (in readme)
// - status monitoring (ping /status endpoint? need bidi usb communication)
//
// TESTS
// - can't read csrf token cross-site if not *.recurse.com subdomain
// - send csrf token in hidden form input
// - send csrf token as http header

// Block access to the NodeJS global `process` object.
// For environment variables, please use `env`.
const process = {}

import assert from 'node:assert'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import express, { Request, Response } from 'express'
import cookieSession from 'cookie-session'
import * as oauthClient from 'openid-client'
import { Csrf } from './csrf'
import { env } from './env'
import * as image from './image'
import * as escpos from 'escpos-ts'
import * as escposDeprecated from './escpos-deprecated'
import { isPrintableAscii } from './middleware'
const cors = require('cors')

const app = express()

app.use(express.static('gen'))

// TODO rotate keys
const secretKeys = [ env.secretKey ]
const maxAge = 24 * 60 * 60 * 1000 // 24 hours

app.use(cookieSession({
  name: 'session',
  keys: secretKeys,
  maxAge,
}))

const corsOptions = {
  // If the Origin request header matches the regex, it is reflected back in
  // the Access-Control-Allow-Origin response header.
  origin: env.allowOriginRegex,
  // Enable cookies because we need the session cookie to prove authentication.
  credentials: true,
}

app.use(cors(corsOptions))

// Support CORS preflight requests on all endpoints.
app.options(/.*/, (req, res) => res.sendStatus(204))

const csrf = new Csrf(secretKeys)

const noopMiddleware = (req, res, next) => next()

const port = 3000

const serverMetadata: oauthClient.ServerMetadata = {
  issuer: 'rc', // unknown for recurse.com but required by openid-client
  authorization_endpoint: 'https://www.recurse.com/oauth/authorize',
  // Without 'www.', the POST method is not allowed.
  token_endpoint: 'https://www.recurse.com/oauth/token',
}

const config: oauthClient.Configuration = new oauthClient.Configuration(
  serverMetadata,
  env.clientId,
  env.clientSecret)

app.set('view engine', 'ejs')

app.get('/', (req: Request, res: Response) => {
  res.render('index', { name: req.session.rcName, origin: env.origin })
})

/**
 * Authenticate with Receipt Printer API via Recurse Center OAuth.
 *
 * Once the user has completed the OAuth flow, their browser receives two
 * cookies from Receipt Printer API: a session cookie and a CSRF token cookie.
 * The session cookie can only be seen by Receipt Printer API, while the CSRF
 * token cookie can be seen by any web app served from a `*.recurse.com`
 * subdomain.
 *
 * To make API calls to Receipt Printer API from your web app, you must do the
 * following:
 *
 * 1. Your web app must be served from a `*.recurse.com` subdomain. This is so
 * your web app can read the CSRF token cookie, which has
 * `Domain=.recurse.com`.
 * 2. Before making any API calls to Receipt Printer API, you need to verify
 * that the user is authenticated with Receipt Printer API. To do so, simply
 * check for the presence of a cookie called `receipt_csrf`. If the cookie is
 * not there, you should either redirect or provide a link to this endpoint.
 * 3. Once the user has authenticated with Receipt Printer API, your web app
 * will be able to see a cookie with key `receipt_csrf`. The value of this
 * cookie needs to be included as a header `X-CSRF-Token` or as a hidden form
 * input named `_csrf` in any HTTP requests sent to Receipt Printer API. This
 * serves as proof that the API calls are coming a `*.recurse.com` subdomain.
 * 4. If you are making the HTTP request in JS (e.g. `fetch()`), make sure to
 * set the option `{ credentials: 'include' }`, which tells the browser to also
 * send Receipt Printer API the user's session cookie. If you don't do this,
 * Receipt Printer API will not see a session cookie, and thus will be unable
 * to verify that the user making the request is a Recurser.
 * @route /login
 * @method GET
 * @param {URL} redirect_uri? The URL to redirect back to after
 *                            authentication is complete. Must be a
 *                            `*.recurse.com` subdomain.
 */
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
    if (!url.host.match(env.allowOriginRegex)) {
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
    redirect_uri: env.origin + '/callback',
    scope: 'public',
    state: req.session.state,
  }
  res.redirect(oauthClient.buildAuthorizationUrl(config, parameters).toString())
})

app.get('/logout', (req: Request, res: Response) => {
  req.session = null
  res.clearCookie(env.csrfCookieName)
  res.redirect('/')
})

app.get('/callback', async (req: Request, res: Response) => {
  const currentURL = new URL(env.origin + req.originalUrl)
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
  req.session.rcName = me.name
  const tomorrow: Date = new Date(Date.now() + maxAge)
  req.session.id = crypto.randomUUID()
  req.session.expiresAt = tomorrow
  const csrfToken = csrf.generateToken(req.session.id)
  res.cookie(env.csrfCookieName, csrfToken, {
    // Readable by client-side JS.
    httpOnly: false,
    // Accessible by frontends served from a subdomain of the parent domain.
    domain: env.csrfCookieDomain,
    // Expires at the same time as the session cookie it is tied to.
    expires: tomorrow,
    // The CSRF token cookie does not need to be signed.
    signed: false,
  })
  res.redirect(req.session.redirectUri ?? '/')
})

app.get('/status',
  env.isAuthEnabled ? csrf.express() : noopMiddleware,
  (req, res) => {
    // TODO ping printer
    res.json({status: 'online'})
  }
)

/**
 * Print multiple text blocks to the printer.
 * @route /textblocks
 * @method POST
 * @type application/json
 * @type application/x-www-form-urlencoded
 * @param {TextBlock} textblocks
 */
app.post(
  "/textblocks",
  express.json(),
  express.urlencoded(),
  env.isAuthEnabled ? csrf.express() : noopMiddleware,
  async (req: Request, res: Response) => {
    // TODO: input verification
    const b = new escposDeprecated.EscPosBuilder();
    req.body.textblocks.forEach(block => {
      b.spacing(block.spacing || 0)
      .scale(block.scaleWidth || 0, block.scaleHeight || 0)
      .underline(!!block.underline)
      .bold(!!block.bold)
      .strike(!!block.strike)
      .font(block.font === "b" ? "b" : "a")
      .rotate(!!block.rotate)
      .upsideDown(!!block.upsideDown)
      .invert(!!block.invert)
      .text(block.text || "")

      switch (block.concat) {
        case "cut":
          b.printAndFeed(6);
          b.cut()
          break;
        case "space":
          b.text(" ")
          break;
        case "newline":
          b.printAndFeed(1);
          break;
        case "nospace":
        default:
          break;
      }
    })
    const buf = b.build();

    fs.writeFile(env.outFile, buf, (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log(`text: wrote to ${env.outFile}`);
      }
    });
    console.log(req.body);
    console.log(`wrote to ${env.outFile}`);
    res.json({});
  }
);

/**
 * Print text to the printer.
 * @route /text
 * @method POST
 * @type application/json
 * @type application/x-www-form-urlencoded
 * @param {string} text May only contain ASCII characters in the range 32-126.
 * @param {number} spacing? Space between characters (0-255). Default 0.
 * @param {number} scaleWidth? Scale text horizontally (0-7). Default 0.
 * @param {number} scaleHeight? Scale text vertically (0-7). Default 0.
 * @param {boolean} underline?
 * @param {boolean} bold?
 * @param {boolean} strike? Strikethrough.
 * @param {string} font? "a" or "b". Default "a".
 * @param {boolean} rotate? Rotate 90 degrees clockwise.
 * @param {boolean} upsideDown? Print upside down.
 * @param {boolean} invert? Invert colors (white on black).
 */
app.post(
  "/text",
  express.json(),
  express.urlencoded(),
  env.isAuthEnabled ? csrf.express() : noopMiddleware,
  isPrintableAscii('text'),
  async (req: Request, res: Response) => {
    const b = new escposDeprecated.EscPosBuilder();
    const buf = b
      .spacing(req.body.spacing || 0)
      .scale(req.body.scaleWidth || 0, req.body.scaleHeight || 0)
      .underline(!!req.body.underline)
      .bold(!!req.body.bold)
      .strike(!!req.body.strike)
      .font(req.body.font === "b" ? "b" : "a")
      .rotate(!!req.body.rotate)
      .upsideDown(!!req.body.upsideDown)
      .invert(!!req.body.invert)
      .text(req.body.text || "")
      .printAndFeed(6)
      .cut()
      .build();
    fs.writeFile(env.outFile, buf, (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log(`text: wrote ${buf.length} bytes to ${env.outFile}`);
      }
    });
    res.json({});
  }
);

/**
 * Print an image. See supported Content-Type for supported image formats. For
 * .pbm, use application/octet-stream. For all other formats, if the image is
 * wider than 512px across, it will be shrunk down to be 512px wide, preserving
 * aspect ratio. If it's not black and white, it will be converted to a black
 * and white dithered image using a 4x4 Bayer matrix.
 * @route /image
 * @method POST
 * @type image/tiff
 * @type image/jpeg
 * @type image/png
 * @type image/gif
 * @type image/bmp
 * @type image/x-ms-bmp
 * @type application/octet-stream
 */
app.post('/image',
  express.raw({
    type: [
      'application/octet-stream',
      'image/tiff',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/bmp',
      'image/x-ms-bmp',
    ],
    limit: '1mb',
  }),
  env.isAuthEnabled ? csrf.express() : noopMiddleware,
  async (req: Request, res: Response) => {
    if (!req.body) {
      res.status(400).json({error: 'unsupported Content-Type'})
      return
    }
    let buf: Buffer
    try {
      buf = await image.generateEscPos(req.body)
    } catch (error) {
      console.error(error)
      res.status(400).json({error: error})
      return
    }
    fs.writeFile(env.outFile, buf, err => {
      if (err) {
        console.error(err)
      } else {
        console.log(`image: wrote ${buf.length} bytes to ${env.outFile}`)
      }
    })
    res.json({})
  })


/**
 * Send raw ESC/POS bytes to the printer. Pass the ESC/POS bytes directly in
 * the request body.
 * @route /escpos
 * @method POST
 * @type application/octet-stream
 */
app.post('/escpos',
  express.raw({ type: 'application/octet-stream' }),
  env.isAuthEnabled ? csrf.express() : noopMiddleware,
  async (req: Request, res: Response) => {
  fs.writeFile(env.outFile, req.body, err => {
    if (err) {
      console.error(err)
    } else {
      console.log(`escpos: wrote ${req.body.length} bytes to ${env.outFile}`)
    }
  })
  res.json({})
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
