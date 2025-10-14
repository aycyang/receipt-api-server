/**
 * TODO
 * - generate random session id (10 min)
 * - figure out secret key storage (20 min)
 * - create a simple, CSRF-protected API for doing the most basic thing (print text and cut) (20 min)
 * - deploy to the pi (20 min)
 * - reverse proxy the pi (2 hours)
 * - point receipt.recurse.com CNAME at the reverse proxy (5 min)
 * - set up a basic frontend on a different subdomain to test cross-subdomain API calls (1 hour)
 */


import express, { Request, Response } from 'express'
import * as Cookies  from 'cookies'
import cookieSession from 'cookie-session'
import * as oauthClient from 'openid-client'
import * as csrf from './csrf'

const app = express()

const cookieKeys = ['TODO some securely stored keys']

app.use(Cookies.express(cookieKeys))

app.use(cookieSession({
  name: 'session',
  keys: cookieKeys,
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
}))

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
  req.session.id = 'TODO some random session id'
  const csrfToken = csrf.generateToken(req.session.id)
  res.cookies.set('receipt_csrf', csrfToken, {
    httpOnly: false,
    domain: process.env.PARENT_DOMAIN,
  })
  res.send(`hello, ${me.first_name}!`)
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
