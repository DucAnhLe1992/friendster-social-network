# Friendster Modern - Project Architecture

## Overview
A modern, full-stack social media platform built with TypeScript, featuring real-time interactions, containerized deployment, and CI/CD pipeline.

## Tech Stack

### Frontend
- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 3.4+
- **UI Components**: a small set of shadcn/ui components on Radix primitives
- **State Management**: Zustand + React Query (TanStack Query)
- **Routing**: React Router
- **Real-time**: Socket.io-client
- **HTTP Client**: Axios

### Backend
- **Runtime**: Node.js 22.12+
- **Framework**: Express 5 with TypeScript
- **Database**: PostgreSQL on Neon, with Drizzle ORM and drizzle-kit migrations
- **Authentication**: JWT (access + refresh tokens)
- **Real-time**: Socket.io
- **File Upload**: Multer to local disk; every image is decoded and re-encoded with sharp (unused decoders blocked)
- **Validation**: Zod (request input and environment configuration)
- **Logging**: pino with per-request IDs (`X-Request-Id`), secrets redacted
- **Security**: Helmet, CORS, Rate Limiting

### DevOps & Infrastructure
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Testing**: Vitest + Supertest API integration tests on PGlite (in-memory Postgres) with coverage thresholds, Vitest + Testing Library frontend tests, Playwright end-to-end tests against the Docker stack in CI
- **Code Quality**: ESLint (with jsx-a11y) and TypeScript type checks enforced in CI, production dependency audit, Dependabot

## Project Structure

```
friendster-modern/
├── apps/
│   ├── web/                 # React frontend
│   └── api/                 # Express backend
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   ├── nginx.conf
│   └── security-headers.conf
├── docker-compose.yml       # Neon by default; --profile local-db adds Postgres
├── docker-compose.dev.yml
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── cd.yml
└── README.md
```

## Core Features (MVP)

### Authentication
- JWT-based auth with refresh tokens
- Password hashing with bcrypt
- Protected routes middleware

### Posts
- Create, read, update, delete posts
- Hashtag and mention highlighting
- Image attachments
- Like/unlike functionality

### Comments
- Nested comments (replies)
- Like/unlike comments

### User Profiles
- Profile customization (bio, avatar, cover image)
- View other users' profiles
- Follow/unfollow users

### Feed
- Personalized feed based on following
- Infinite scroll with keyset (cursor) pagination

### Notifications
- Real-time notifications
- Like, comment, follow notifications
- Mark as read

## Additional Features

### Direct Messaging
- Real-time one-to-one messaging
- Unread counts derived from message read state; reads are marked up to the last message the reader saw
- Typing indicators (rate-limited per connection)

### Feed
- Chronological feed of followed accounts
- Trending hashtags

### Search
- Text search for posts and users

## Planned (not implemented)

- Engagement-based feed ranking
- Admin dashboard and content moderation
- Object storage for uploads and a Socket.io Redis adapter (needed to run more than one API instance)

## Database Schema

PostgreSQL hosted on [Neon](https://neon.tech), accessed through Drizzle ORM over `pg`. The schema lives in
`apps/api/src/database/schema.ts`; SQL migrations are generated into `apps/api/migrations` with
`npm run db:generate -w @friendster/api`. Compose runs them once in a migration job before the API starts;
local API development applies pending migrations before the watch process starts.

IDs are 24-character, time-ordered hex strings, so they sort by creation time and keep the format the web app
already uses. Foreign keys cascade related database rows. Media-file deletion is queued in the same transaction
as post/profile changes, then retried by a background worker; database cascades alone cannot clean local files.

| Table | Purpose | Notable constraints |
| --- | --- | --- |
| `users` | Accounts and profiles | unique `email`, unique `handle`, `role` is `user` or `admin` |
| `follows` | Who follows whom | primary key (`follower_id`, `following_id`) |
| `posts` | Posts (up to 280 characters, up to 4 images) | unique (`author_id`, `client_id`) makes retried publishes idempotent; full-text index on `content` |
| `post_likes` | Likes on posts | primary key (`post_id`, `user_id`) |
| `comments` | Comments and one level of replies (`parent_id`) | replies are deleted with their parent |
| `comment_likes` | Likes on comments | primary key (`comment_id`, `user_id`) |
| `notifications` | like / comment / reply / follow / mention | optional `post_id`, `comment_id` |
| `conversations` | Direct conversations | unique `pair_key` (sorted user IDs) gives one conversation per pair |
| `conversation_participants` | Members of each conversation | primary key (`conversation_id`, `user_id`) |
| `messages` | Direct messages | unique (`conversation_id`, `sender_id`, `client_id`) makes retried sends idempotent |
| `session_families` | Refresh-token revocation | one row per sign-in family; rotation and logout lock this row |
| `refresh_sessions` | Refresh-token rotation | unique `jti`; rows reference a session family |
| `media` | Uploaded post images and their owner | unique `path`; `post_id` is set once an image is published |
| `file_deletions` | Durable file cleanup jobs | unique path; failed filesystem deletions are retried with backoff |

Follower counts, post/comment like counts, reply counts and "is liked / is following" flags are computed in SQL on
reads. `posts.comments_count` is different: it is stored and updated transactionally by comment create/delete
handlers, so it is not recomputed on reads and can drift if comments are removed outside those paths.

Publishing a post is one transaction: the post row is inserted and its images are claimed (only the uploader's own,
not-yet-used images qualify). If any image cannot be claimed the transaction rolls back and nothing is saved. The
hourly sweep deletes database records for uploads that no post claimed within a day and enqueues their file paths;
because publication and sweeping contend on the same media rows, an image is either published or swept, never both.
A retry carrying the same `clientId` returns the original post (409 if the content differs).

The last message and unread counts shown in the conversation list are always computed from the messages
themselves, so they cannot drift or move backward. After a realtime reconnect the web app pages forward
(`?after=<id>`) from the last message it had before the outage, and only marks messages read once that gap is filled.

## API Endpoints

### Auth
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/me

### Users
- GET /api/users/search
- GET /api/users/suggestions
- GET /api/users/:handle
- GET /api/users/:handle/replies
- PUT /api/users/profile
- POST /api/users/avatar
- POST /api/users/cover
- POST /api/users/:handle/follow
- DELETE /api/users/:handle/follow
- GET /api/users/:handle/followers
- GET /api/users/:handle/following

### Posts
- GET /api/posts (all posts, newest first)
- GET /api/posts/feed (followed accounts)
- GET /api/posts/trending
- GET /api/posts/search
- GET /api/posts/user/:handle
- POST /api/posts/images
- POST /api/posts
- GET /api/posts/:id
- PUT /api/posts/:id
- DELETE /api/posts/:id
- POST /api/posts/:id/like
- DELETE /api/posts/:id/like

### Comments
- GET /api/posts/:id/comments
- POST /api/posts/:id/comments
- GET /api/posts/:id/comments/:commentId/replies
- PUT /api/posts/:id/comments/:commentId
- DELETE /api/posts/:id/comments/:commentId
- POST /api/posts/:id/comments/:commentId/like
- DELETE /api/posts/:id/comments/:commentId/like

### Notifications
- GET /api/notifications
- PUT /api/notifications/:id/read
- PUT /api/notifications/read-all
- GET /api/notifications/unread-count
- DELETE /api/notifications/:id

### Messages
- GET /api/conversations
- GET /api/conversations/unread-count
- GET /api/conversations/:id
- GET /api/conversations/:id/messages
- POST /api/conversations
- POST /api/conversations/:id/messages
- POST /api/conversations/:id/read

## Real-time Events (Socket.io)

Messages are sent and marked read over HTTP; the socket carries live updates only.

### Message cache contract (web)

- Every message that reaches a thread from outside its own HTTP snapshot (socket events and reconnect catch-up
  pages) enters the cache through one path that also records it in the `LiveBuffer`. A snapshot that was in flight
  merges those messages back in, so an older snapshot can never erase newer messages, and each message appears once.
- Each connection is a sync boundary. A thread that is on screen is **reconciled** (paged forward, or reloaded if
  paging fails). A loaded thread that is not on screen is only **reset**: its stale copy is dropped and it loads
  fresh when opened, so no request is made for it during catch-up.
- Threads that fail for a recoverable reason (network, 5xx, 408, 429) keep their cursors and are retried with
  backoff; `synced` stays false until all succeed. Refusals (other 4xx) are not retried.
- Catch-up belongs to one sign-in. It is aborted on sign-out, account switch, or socket teardown, and after that it
  makes no cache writes, resets, invalidations, retries, or sync-state changes.

### Client -> Server
- typing_start
- typing_stop

### Server -> Client
- new_message
- user_typing
- conversation_read
- new_notification

## Security Considerations

1. **Authentication**: JWT with short-lived access tokens and refresh tokens
2. **Password Security**: bcrypt with salt rounds 12
3. **Rate Limiting**: Express-rate-limit for API endpoints
4. **CORS**: Restricted to known origins
5. **Helmet**: Security headers
6. **Input Validation**: Zod schemas for all inputs
7. **File Upload**: Size and per-account rate limits, signature check, full decode and re-encode, pixel limits, bounded decode concurrency
8. **Database**: Parameterized queries via Drizzle (prevents SQL injection); search input is escaped before `ILIKE`

## Performance Optimizations

1. **Database Indexes**: On frequently queried fields
2. **Pagination**: Keyset cursors (`created_at`, `id`) for post lists and messages, so inserts never shift pages and no `COUNT(*)` runs per request; page numbers for comments and notifications
3. **Image Processing**: Uploads are resized to at most 4096 px and stripped of metadata
4. **Code Splitting**: Route-based lazy loading plus separate vendor chunks

Possible future work: Redis caching, a CDN, and a Socket.io Redis adapter for running several API instances.

## Deployment Strategy

### Development
`npm run dev` runs both apps in watch mode; `npm run db:dev` starts a local Postgres if you are not using Neon.

### Production
`docker compose up -d` runs a one-shot migration container, the API and nginx against Neon. Adding
`--profile local-db` also starts a bundled Postgres. nginx runs as a non-root user, serves the web app with a
Content Security Policy and other security headers, and proxies `/api`, `/socket.io` and `/uploads`. On shutdown the
API reports not-ready, drains in-flight requests and sockets, then closes its database pool. Uploaded files live in
a Docker volume.

## CI/CD Pipeline

### CI (pushes and pull requests to main/develop)
- Production dependency audit (fails on high severity)
- API: type check, lint, migration drift check, integration tests with coverage thresholds, build
- Web: lint, unit tests, type check, build
- Docker: build images, smoke-test the running stack (including security headers), run Playwright end-to-end tests

### CD (opt-in)
- Publishes Docker images tagged only with the commit SHA after CI passes on a push to `main`; it does not deploy a server
