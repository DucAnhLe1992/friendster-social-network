# Friendster Modern 🚀

A modern, full-stack social media platform built with TypeScript, featuring real-time interactions, containerized deployment, and a sleek minimalist design.

![Tech Stack](https://img.shields.io/badge/Stack-TypeScript%20%7C%20React%20%7C%20Node.js%20%7C%20MongoDB-blue)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)
![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?logo=github-actions)

## ✨ Features

### Core Features
- 🔐 **JWT Authentication** - Secure login/register with access & refresh tokens
- 📝 **Posts** - Create, read, update, delete posts with image support
- 💬 **Comments** - Nested comments with likes
- ❤️ **Likes** - Like/unlike posts and comments
- 👤 **User Profiles** - Customizable profiles with avatars and cover images
- 🔍 **Search** - Search users and posts
- 🔔 **Notifications** - Real-time notifications for likes, comments, and follows
- 👥 **Follow System** - Follow/unfollow users with personalized feed

### Advanced Features (Senior Level)
- ⚡ **Real-time** - Socket.io for live notifications and messaging
- 🐳 **Dockerized** - Complete containerization with Docker Compose
- 🔄 **CI/CD Pipeline** - Automated testing and deployment with GitHub Actions
- 📱 **Responsive Design** - Mobile-first approach with dark theme
- 🎨 **Modern UI** - Glassmorphism effects with smooth animations

## 🛠 Tech Stack

### Frontend
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS 3.4+
- **UI Components**: shadcn/ui (40+ components)
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router v6
- **Real-time**: Socket.io-client
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js with TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (access + refresh tokens)
- **Real-time**: Socket.io
- **Validation**: Zod
- **Security**: Helmet, CORS, Rate Limiting

### DevOps
- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Testing**: Vitest (frontend), Jest (backend)

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (optional)
- MongoDB (if running without Docker)

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/yourusername/friendster-modern.git
cd friendster-modern

# Start all services
docker-compose up -d

# Access the application
# Frontend: http://localhost
# API: http://localhost:5000
# MongoDB: localhost:27017
```

### Option 2: Manual Setup

#### 1. Install Dependencies

```bash
# Install backend dependencies
cd apps/api
npm install

# Install frontend dependencies
cd ../web
npm install
```

#### 2. Environment Variables

```bash
# Backend
cd apps/api
cp .env.example .env
# Edit .env with your configuration

# Frontend
cd ../web
cp .env.example .env
# Edit .env with your configuration
```

#### 3. Start MongoDB

```bash
# Using Docker
docker run -d -p 27017:27017 --name friendster-mongo mongo:7-jammy

# Or install MongoDB locally
```

#### 4. Run the Application

```bash
# Terminal 1 - Backend
cd apps/api
npm run dev

# Terminal 2 - Frontend
cd apps/web
npm run dev
```

The application will be available at:
- Frontend: http://localhost:5173
- API: http://localhost:5000

## 📁 Project Structure

```
friendster-modern/
├── apps/
│   ├── api/                 # Express backend
│   │   ├── src/
│   │   │   ├── config/      # Database & env config
│   │   │   ├── controllers/ # Route controllers
│   │   │   ├── middleware/  # Auth & error handlers
│   │   │   ├── models/      # Mongoose models
│   │   │   ├── routes/      # API routes
│   │   │   ├── types/       # TypeScript types
│   │   │   └── utils/       # JWT & validation
│   │   └── package.json
│   │
│   └── web/                 # React frontend
│       ├── src/
│       │   ├── components/  # UI components
│       │   ├── layouts/     # Page layouts
│       │   ├── lib/         # API client
│       │   ├── pages/       # Route pages
│       │   ├── store/       # Zustand stores
│       │   └── types/       # TypeScript types
│       └── package.json
│
├── docker/                  # Docker configurations
├── .github/workflows/       # CI/CD pipelines
├── docker-compose.yml       # Docker orchestration
└── README.md
```

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user

### Posts
- `GET /api/posts` - Get all posts
- `GET /api/posts/feed` - Get personalized feed
- `GET /api/posts/:id` - Get single post
- `POST /api/posts` - Create post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post
- `POST /api/posts/:id/like` - Like post
- `DELETE /api/posts/:id/like` - Unlike post

### Comments
- `GET /api/posts/:id/comments` - Get comments
- `POST /api/posts/:id/comments` - Create comment
- `PUT /api/posts/:id/comments/:commentId` - Update comment
- `DELETE /api/posts/:id/comments/:commentId` - Delete comment
- `POST /api/posts/:id/comments/:commentId/like` - Like comment

### Users
- `GET /api/users/:handle` - Get user profile
- `PUT /api/users/profile` - Update profile
- `POST /api/users/:handle/follow` - Follow user
- `DELETE /api/users/:handle/follow` - Unfollow user
- `GET /api/users/search?q=` - Search users

### Notifications
- `GET /api/notifications` - Get notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `PUT /api/notifications/read-all` - Mark all as read

## 🎨 Design System

### Colors
- **Primary**: Indigo (#6366f1)
- **Accent**: Purple (#a855f7)
- **Background**: Dark navy (#0f0f23)
- **Card**: Dark purple-blue (#1a1a2e)

### Typography
- **Font**: Inter
- **Scale**: 12px to 36px

### Effects
- Glassmorphism with backdrop blur
- Gradient accents
- Smooth micro-interactions

## 🔒 Security Features

- JWT authentication with refresh tokens
- Password hashing with bcrypt (12 rounds)
- Rate limiting on API endpoints
- CORS protection
- Helmet security headers
- Input validation with Zod
- MongoDB injection protection via Mongoose

## 🧪 Testing

```bash
# Backend tests
cd apps/api
npm test

# Frontend tests
cd apps/web
npm test
```

## 🚀 Deployment

### Docker Deployment

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Production Checklist

- [ ] Change JWT secrets
- [ ] Set up production MongoDB (MongoDB Atlas)
- [ ] Configure Cloudinary for image uploads
- [ ] Set up SSL certificates
- [ ] Configure environment variables
- [ ] Set up monitoring (optional)

## 📝 Environment Variables

### Backend (.env)
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://...
JWT_ACCESS_SECRET=your-secret
JWT_REFRESH_SECRET=your-secret
CORS_ORIGIN=https://yourdomain.com
```

### Frontend (.env)
```env
VITE_API_URL=https://api.yourdomain.com/api
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- [shadcn/ui](https://ui.shadcn.com/) for beautiful UI components
- [Tailwind CSS](https://tailwindcss.com/) for utility-first CSS
- [MongoDB](https://www.mongodb.com/) for the database
- [Socket.io](https://socket.io/) for real-time functionality

---

Built with ❤️ using TypeScript, React, and Node.js
