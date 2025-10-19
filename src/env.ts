import assert from 'node:assert'

// This type definition is meant to catch accidental misuse or misspellings of
// environment variables.
interface Env {
  allowOriginRegex: RegExp
  clientId: string
  clientSecret: string
  csrfCookieDomain: string
  csrfCookieName: string
  isAuthEnabled: boolean
  origin: string
  outFile: string
  secretKey: string
}

function assertIsDefined(v: string | undefined): string {
  assert(v)
  return v
}

function parseBoolean(v: string): boolean {
  return !!v.match(/^(yes|on|true|1)$/)
}

// Instantiate the typed environment variables object, making sure that the
// environment variables are indeed defined.
export const env: Env = {
  allowOriginRegex: new RegExp(assertIsDefined(process.env.ALLOW_ORIGIN_REGEX)),
  clientId: assertIsDefined(process.env.CLIENT_ID),
  clientSecret: assertIsDefined(process.env.CLIENT_SECRET),
  csrfCookieDomain: assertIsDefined(process.env.CSRF_COOKIE_DOMAIN),
  csrfCookieName: assertIsDefined(process.env.CSRF_COOKIE_NAME),
  isAuthEnabled: parseBoolean(assertIsDefined(process.env.ENABLE_AUTH)),
  origin: assertIsDefined(process.env.ORIGIN),
  outFile: assertIsDefined(process.env.OUT_FILE),
  secretKey: assertIsDefined(process.env.SECRET_KEY),
}
