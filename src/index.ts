import express, { Request, Response } from 'express'
import { doubleCsrf } from 'csrf-csrf'
import cookieSession from 'cookie-session'
import * as oauthClient from 'openid-client'

const app = express()

app.use(cookieSession({
  name: 'session',
  keys: [ 'MY_SUPER_SECRET_KEY' ],
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

app.get('/login', (req: Request, res: Response) => {
  const parameters: Record<string, string> = {
    redirect_uri: 'http://localhost:3000/callback',
    scope: 'public',
    // TODO include state for improved security
  }
  res.redirect(oauthClient.buildAuthorizationUrl(config, parameters))
})

app.get('/callback', async (req: Request, res: Response) => {
  const currentURL = new URL('http://localhost:3000/callback?code=' + req.query.code)
  const tokens = await oauthClient.authorizationCodeGrant(config, currentURL)
  const meRes = await oauthClient.fetchProtectedResource(
    config,
    tokens.access_token,
    new URL('https://www.recurse.com/api/v1/profiles/me'),
    'GET')
  const me = await meRes.json()
  res.send(`hello, ${me.first_name}!`)
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
