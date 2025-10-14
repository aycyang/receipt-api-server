# Recurse Center Receipt API Server

*This is a work in progress!*

A way for Recursers to interact with the receipt printer in the Recurse Center hub.

## Goals

- Easy-access API endpoint for the receipt printer
- Anyone at RC can set up their own frontend that integrates with the receipt printer API
- The receipt printer API should only accept requests from Recursers

## Design sketch

Let's say the receipt printer API is served from `https://receipt.recurse.com`. It will only accept requests if they come with 2 things: a session cookie and a CSRF token. The session cookie proves that the user is a Recurser. The CSRF token proves that the request came from a frontend served from a `*.recurse.com` subdomain. Next, I will cover how the session cookie and CSRF token are created, which will explain why they can prove these facts.

### Session cookie

How is the session cookie created? When a new user navigates to `https://receipt.recurse.com/login` they will be redirected to `https://recurse.com/oauth/authorize` to begin the OAuth authorization code flow (details of OAuth flow can be found [elsewhere](https://oauth.net/2/grant-types/authorization-code/)). By the end of this flow, the receipt printer API server will have an access token which can be used to query the Recurse Center API. The receipt printer API server does not actually need anything from the Recurse Center API, just perhaps the user's own info in order to prove that the access token works and access wasn't revoked or something. At this point the receipt printer API server has proven to itself that the user is a Recurser, so it goes ahead and creates a session cookie for the user. This session cookie has several important properties:
- It is server-signed so it cannot be forged
- It is `HttpOnly` which means browsers will not allow client-side JS to read it
- It has `Domain: receipt.recurse.com`, so the cookie will only be sent to the receipt printer API server
- It expires in a short-ish amount of time (e.g. 24 hours)
This session cookie is now attached to the user's browser, so anytime the user's browser makes a request to `https://receipt.recurse.com`, this cookie will be passed along with the request.

### CSRF token

When the server creates a session cookie, it also creates a CSRF token for that user. This is stored in another cookie with different properties which will allow any frontend hosted at a `*.recurse.com` subdomain to be able to read it. These properties are:

- It is NOT `HttpOnly`, so it can be read by client-side JS
- It has `Domain: .recurse.com`, so anything hosted from a `*.recurse.com` subdomain can read it

The CSRF token is an HMAC hash of a salt plus the session ID, with the salt also included in plaintext. Since the hash is generated using a secret key known only by the receipt printer API server, it cannot be easily forged. This is the recommended variant of the [double submit cookie pattern](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#alternative-using-a-double-submit-cookie-pattern). All the frontend has to do is read this CSRF token from the cookie and attach it to the API call to `https://receipt.recurse.com`, either as an HTTP header or as a hidden form input. If the frontend can do this, it proves that they are hosted at a `*.recurse.com` subdomain. The server can validate the CSRF token by reading the plaintext salt, combining it with the session ID from the session cookie, calculating the HMAC hash and comparing it with the hash from the CSRF token.

### How to integrate

Let's walk through the expected flow of a frontend. Someone visits a frontend at `https://some-app.recurse.com` that integrates with the receipt printer API. The frontend should start by checking to see if there is a cookie with key `receipt_csrf` in `Domain: .recurse.com`. If not, the frontend should prompt the user to authenticate with the receipt printer API server first, perhaps by providing a link to `https://receipt.recurse.com/login`. Now when the frontend checks for the `receipt_csrf` cookie, it will see that it exists, and it should then include it in an HTML form as a hidden input, or include it as an HTTP header (e.g. `X-CSRF-Token` or similar) in any HTTP requests to `https://receipt.recurse.com`. Note that in the latter case, HTTP requests made to `https://receipt.recurse.com` need to specify `{credentials: "include"}` to tell the browser to pass along the session cookie for `https://receipt.recurse.com`.
