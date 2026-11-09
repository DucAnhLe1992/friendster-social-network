# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Keyset (cursor) pagination for post lists; pages no longer shift when new posts arrive.
- Structured logging with pino and a request ID on every log line and error response.
- Graceful shutdown: readiness turns off, traffic drains, then connections and the database pool close.
- Startup configuration validated with zod, with strict production rules.
- Error boundaries per page, with a reload prompt when a new version has been deployed.
- Page titles on every screen; accessibility linting (jsx-a11y) and improved image descriptions.
- Playwright end-to-end tests run against the Docker stack in CI; API coverage thresholds; Dependabot.
- Content Security Policy and security headers in nginx; web image runs as non-root with a healthcheck.

### Changed
- Database moved from MongoDB to Postgres on Neon with Drizzle ORM and generated migrations.
- One Compose file for both Neon and bundled Postgres (`--profile local-db`); no hardcoded database password.
- Docker images are published with commit SHA tags only.
- Follow button updates instantly and rolls back if the request fails.
- The realtime connection is kept across silent token refreshes instead of reconnecting.

### Removed
- About 40 unused UI components and their packages.
