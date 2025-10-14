# Recurse Center Receipt API Server

A way for Recursers to interact with the receipt printer in the Recurse Center hub.

### Goals

- Anyone can create a frontend that integrates with this API
- Users must login to their Recurse Center account to be able to use this API

### Todo

- [ ] /login endpoint that does oauth authorization code flow with pkce, or if already authenticated, set non-HttpOnly csrfToken cookie
- [ ] /callback endpoint that receives redirect from oauth provider, validates the access token and sets the session cookie
