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
- **Runtime**: Node.js 20+
- **Framework**: Express.js with TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (access + refresh tokens)
- **Real-time**: Socket.io
- **File Upload**: Multer + Cloudinary (or local storage)
- **Validation**: Zod
- **Security**: Helmet, CORS, Rate Limiting

### DevOps & Infrastructure
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Testing**: Vitest (frontend), Jest (backend)
- **Code Quality**: ESLint, Prettier, Husky

## Project Structure

```
friendster-modern/
├── apps/
│   ├── web/                 # React frontend
│   └── api/                 # Express backend
├── packages/
│   ├── shared/              # Shared types and utilities
│   └── config/              # Shared config (eslint, tsconfig)
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── docker-compose.yml
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
- Rich text support (markdown)
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

## Advanced Features (Senior Level)

### Stories
- 24-hour disappearing stories
- Image/video stories
- View tracking

### Direct Messaging
- Real-time private messaging
- Message read receipts
- Typing indicators

### Feed Algorithm
- Engagement-based sorting
- Trending posts

### Search
- Full-text search for posts and users
- Filter by tags, date

### Admin Dashboard
- User management
- Content moderation
- Analytics

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
  createdAt: Date
  updatedAt: Date
}
```

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
  createdAt: Date
}
```

### Conversations
```typescript
{
  _id: ObjectId
  participants: ObjectId[] (ref: User)
  lastMessage: ObjectId (ref: Message)
  unreadCount: Map<ObjectId, number>
  createdAt: Date
  updatedAt: Date
}
```

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

### Stories
- GET /api/stories
- POST /api/stories
- DELETE /api/stories/:id

## Real-time Events (Socket.io)

### Client -> Server
- join_conversation
- leave_conversation
- send_message
- typing_start
- typing_stop
- mark_read

### Server -> Client
- new_message
- user_typing
- message_read
- new_notification
- new_story

## Security Considerations

1. **Authentication**: JWT with short-lived access tokens and refresh tokens
2. **Password Security**: bcrypt with salt rounds 12
3. **Rate Limiting**: Express-rate-limit for API endpoints
4. **CORS**: Restricted to known origins
5. **Helmet**: Security headers
6. **Input Validation**: Zod schemas for all inputs
7. **File Upload**: Size limits, type validation, virus scanning (ClamAV)
8. **MongoDB**: Parameterized queries via Mongoose (prevents injection)

## Performance Optimizations

1. **Database Indexes**: On frequently queried fields
2. **Pagination**: Cursor-based for feeds
3. **Caching**: Redis for hot data
4. **Image Optimization**: WebP format, responsive sizes
5. **Lazy Loading**: Images and components
6. **Code Splitting**: Route-based splitting
7. **CDN**: Static assets served via CDN

## Deployment Strategy

### Development
```bash
docker-compose up
```

### Production
- Frontend: Vercel/Netlify
- Backend: Railway/Render/DigitalOcean
- Database: MongoDB Atlas
- File Storage: Cloudinary/AWS S3
- Real-time: Socket.io with Redis adapter

## CI/CD Pipeline

### On Pull Request
- Lint check
- Type check
- Unit tests
- Build verification

### On Merge to Main
- Run tests
- Build Docker images
- Deploy to staging
- Run E2E tests
- Deploy to production
