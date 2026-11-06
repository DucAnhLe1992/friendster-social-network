# Friendster Modern - Project Architecture

## Overview
A modern, full-stack social media platform built with TypeScript, featuring real-time interactions, containerized deployment, and CI/CD pipeline.

## Tech Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS 3.4+
- **UI Components**: shadcn/ui
- **State Management**: Zustand + React Query (TanStack Query)
- **Routing**: React Router v6
- **Real-time**: Socket.io-client
- **Forms**: React Hook Form + Zod
- **HTTP Client**: Axios

### Backend
- **Runtime**: Node.js 22.12+
- **Framework**: Express.js with TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (access + refresh tokens)
- **Real-time**: Socket.io
- **File Upload**: Multer to local disk; every image is decoded and re-encoded with sharp (unused decoders blocked)
- **Validation**: Zod
- **Security**: Helmet, CORS, Rate Limiting

### DevOps & Infrastructure
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Testing**: Vitest + Supertest API integration tests and focused frontend tests; browser end-to-end tests are not yet implemented
- **Code Quality**: ESLint and TypeScript type checks (enforced in CI), production dependency audit

## Project Structure

```
friendster-modern/
├── apps/
│   ├── web/                 # React frontend
│   └── api/                 # Express backend
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── nginx.conf
├── docker-compose.yml
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

### Posts (formerly "Screams")
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
- Infinite scroll pagination

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

- Stories (a data model exists, but there are no routes or UI)
- Engagement-based feed ranking
- Admin dashboard and content moderation
- Frontend and browser end-to-end tests

## Database Schema

### Users
```typescript
{
  _id: ObjectId
  email: string (unique)
  password: string (hashed)
  handle: string (unique)
  displayName: string
  bio: string
  avatar: string (URL)
  coverImage: string (URL)
  location: string
  website: string
  followers: ObjectId[]
  following: ObjectId[]
  isVerified: boolean
  role: 'user' | 'admin'
  createdAt: Date
  updatedAt: Date
}
```

### Posts
```typescript
{
  _id: ObjectId
  author: ObjectId (ref: User)
  content: string
  images: string[]
  likes: ObjectId[] (ref: User)
  commentsCount: number
  sharesCount: number
  isEdited: boolean
  status: 'pending' | 'published'   // pending posts are hidden from every query
  clientId?: string                  // unique per author; makes retried publishes idempotent
  createdAt: Date
  updatedAt: Date
}
```

Publishing is a two-step commit: the post is saved as `pending`, its images are attached, and only then is it
flipped to `published`. A retry carrying the same `clientId` returns the original post (409 if the content
differs). The hourly sweep completes or removes `pending` posts older than the 15-minute claim lease, so an
interrupted publish can never surface a post whose images were cleaned up.

### Comments
```typescript
{
  _id: ObjectId
  post: ObjectId (ref: Post)
  author: ObjectId (ref: User)
  content: string
  parentComment: ObjectId (ref: Comment, optional)
  likes: ObjectId[] (ref: User)
  createdAt: Date
  updatedAt: Date
}
```

### Notifications
```typescript
{
  _id: ObjectId
  recipient: ObjectId (ref: User)
  sender: ObjectId (ref: User)
  type: 'like' | 'comment' | 'follow' | 'mention'
  post: ObjectId (ref: Post, optional)
  comment: ObjectId (ref: Comment, optional)
  isRead: boolean
  createdAt: Date
}
```

### Messages
```typescript
{
  _id: ObjectId
  conversation: ObjectId (ref: Conversation)
  sender: ObjectId (ref: User)
  content: string
  isRead: boolean
  clientId?: string   // unique per sender + conversation; makes retried sends idempotent
  createdAt: Date
}
```

### Conversations
```typescript
{
  _id: ObjectId
  participants: ObjectId[] (ref: User)
  pairKey: string     // unique; one direct conversation per pair
  createdAt: Date
  updatedAt: Date
}
```

The last message and unread counts shown in the conversation list are always computed from the messages
themselves, so they cannot drift or move backward. After a realtime reconnect the web app pages forward
(`?after=<id>`) from the last message it had before the outage, and only marks messages read once that gap is filled.

### Stories
```typescript
{
  _id: ObjectId
  author: ObjectId (ref: User)
  mediaUrl: string
  mediaType: 'image' | 'video'
  views: ObjectId[] (ref: User)
  expiresAt: Date
  createdAt: Date
}
```

## API Endpoints

### Auth
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/me

### Users
- GET /api/users/:handle
- PUT /api/users/profile
- POST /api/users/avatar
- POST /api/users/cover
- POST /api/users/:handle/follow
- DELETE /api/users/:handle/follow
- GET /api/users/:handle/followers
- GET /api/users/:handle/following

### Posts
- GET /api/posts (feed)
- POST /api/posts
- GET /api/posts/:id
- PUT /api/posts/:id
- DELETE /api/posts/:id
- POST /api/posts/:id/like
- DELETE /api/posts/:id/like

### Comments
- GET /api/posts/:id/comments
- POST /api/posts/:id/comments
- PUT /api/comments/:id
- DELETE /api/comments/:id
- POST /api/comments/:id/like
- DELETE /api/comments/:id/like

### Notifications
- GET /api/notifications
- PUT /api/notifications/:id/read
- PUT /api/notifications/read-all

### Messages
- GET /api/conversations
- GET /api/conversations/:id/messages
- POST /api/conversations
- POST /api/conversations/:id/messages

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
8. **MongoDB**: Parameterized queries via Mongoose (prevents injection)

## Performance Optimizations

1. **Database Indexes**: On frequently queried fields
2. **Pagination**: Page-based for feeds, cursor-based (timestamp + id) for messages
3. **Image Processing**: Uploads are resized to at most 4096 px and stripped of metadata
4. **Code Splitting**: Route-based lazy loading plus separate vendor chunks

Possible future work: Redis caching, a CDN, and a Socket.io Redis adapter for running several API instances.

## Deployment Strategy

### Development
```bash
docker-compose up
```

### Production
`docker compose up -d` runs MongoDB (not exposed to the host), the API, and nginx serving the web app and
proxying `/api`, `/socket.io` and `/uploads`. Uploaded files live in a Docker volume.

## CI/CD Pipeline

### CI (pushes and pull requests to main/develop)
- Production dependency audit (fails on high severity)
- API: type check, lint, integration tests, build
- Web: lint, type check, build
- Docker: build images and smoke-test the running stack

### CD (opt-in)
- Publishes Docker images tagged with the commit SHA after CI passes; it does not deploy a server
