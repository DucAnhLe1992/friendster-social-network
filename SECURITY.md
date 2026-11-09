# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's
**Report a vulnerability** button on the repository's Security tab to send a
private report, including steps to reproduce and the impact you expect.

You can expect an acknowledgement within a few days. Fixes are released on
`main`; there are no long-lived release branches.

## Scope

In scope: the API (`apps/api`), the web app (`apps/web`), and the Docker and
nginx configuration in this repository. Findings that need a compromised
server, leaked secrets, or a modified client build are out of scope.

## Hardening already in place

- Rotating, revocable refresh tokens with reuse detection; short-lived access tokens
- Rate limits on credential and session endpoints
- zod validation on every request and on startup configuration
- Uploaded images are signature-checked, fully decoded and re-encoded
- Content Security Policy and security headers at nginx; Helmet on the API
- Non-root containers; secrets redacted from logs
