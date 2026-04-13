>[!WARNING]
>This app is still not for use and the production deployment exists, but doesn't work perfectly
# Real-time chat
A real time chat app for a workshop at TUMO center Armenia.

<a href="https://real-time-chat-1-mvfc.onrender.com">
    <img src="./public/website.png"/>
</a>

## Features

- **Real-time messaging** with WebSocket connections
- **Room-based chat** with multiple conversation spaces
- **User authentication** with JWT tokens and secure password hashing
- **Typing indicators** to show when users are typing
- **Markdown support** in messages (bold, italic, code, etc.)
- **Emoji picker** with categorized emojis
- **Responsive design** with Gruvbox color theme
- **Redis-backed storage** for user credentials
- **Admin panel** for system monitoring and user management

## Tech Stack

- **Backend**: Node.js, Express, TypeScript
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Real-time**: WebSocket (ws library)
- **Database**: Redis for user storage
- **Auth**: JWT tokens, bcrypt password hashing
- **Build**: TypeScript compiler, pnpm for package management

## Local Setup

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Start Redis locally**:
   ```bash
   # Using Docker (recommended)
   docker run --rm -p 6379:6379 redis:latest

   # Or install Redis system-wide and run:
   redis-server
   ```

3. **Set environment variables**:
   Create a `.env` file in the project root:
   ```env
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   PORT=5000  # Optional, defaults to 5000
   ```

4. **Run the app**:
   ```bash
   # Development mode (with hot reload)
   pnpm run start

   # Or build and run manually
   pnpm run build
   node dist/server.js
   ```

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- `POST /auth/login` - Login existing user
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```

### WebSocket
- `ws://localhost:5000?token=<jwt>&room=<room_name>` - Chat WebSocket connection

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `JWT_SECRET` | Secret key for JWT signing | Required |
| `PORT` | Server port | `5000` |
| `ADMIN_PASSWORD` | The password of the `Admin` user | `admin123` |

## Redis Management

### Viewing Data
```bash
# Connect to Redis
redis-cli

# List all keys
KEYS "*"

# List user keys
KEYS "user:*"

# View user data
HGETALL user:username

# Database info
INFO keyspace
```

### Data Structure
- **Users**: `user:<username>` → Hash with `passwordHash` field
- Passwords are hashed with bcrypt (12 salt rounds)

## Development

### Available Scripts
- `pnpm run build` - Compile TypeScript to JavaScript
- `pnpm run dev` - Watch TypeScript files for changes
- `pnpm run run-server` - Run the compiled server
- `pnpm run start` - Run both dev watcher and server concurrently

### Project Structure
```
├── src/
│   ├── app.ts          # Express app setup
│   ├── server.ts       # Server entry point
│   ├── wss.ts          # WebSocket server
│   ├── rooms.ts        # Room management
│   ├── types.ts        # TypeScript types
│   ├── auth/
│   │   ├── jwt.ts      # JWT utilities
│   │   ├── redis.ts    # Redis user operations
│   │   └── routes.ts   # Auth API routes
├── public/
│   ├── index.html      # Login/register page
│   ├── chat.html       # Chat interface
│   ├── js/
│   │   ├── main.js     # Chat client logic
│   │   └── login.js    # Login form handler
│   └── css/style.css   # Styles
├── dist/               # Compiled JavaScript
├── .env                # Environment variables
└── package.json        # Dependencies and scripts
```

## Admin Panel

Login with username **"Admin"** and password **"admin123"** to access the administrative dashboard.

**Note**: The admin user is automatically created on server startup if it doesn't exist. The password is hardcoded for demonstration purposes.

### Features:
- **User Management**: View all registered users, online status, and delete users (except Admin)
- **Room Monitoring**: See active chat rooms and users in each room  
- **System Information**: Server status, Redis statistics, WebSocket connections
- **Administrative Actions**: Clear all user data from Redis

### Admin API Endpoints
- `GET /auth/admin/users` - List all users and online status
- `GET /auth/admin/rooms` - Get active rooms and connections
- `GET /auth/admin/system` - System and Redis statistics
- `DELETE /auth/admin/users/:username` - Delete a user account
- `POST /auth/admin/clear-redis` - Clear all user data from Redis

All admin endpoints require JWT authentication with admin privileges.

## Redis Usage

User credentials are stored in Redis as hashes under keys like `user:<username>`. The app reads stored password hashes for login and writes new user records on registration.

## Troubleshooting

### Common Issues

**Redis connection failed**
- Ensure Redis is running: `redis-cli ping`
- Check `REDIS_URL` in `.env`
- If using Docker, verify port mapping: `docker ps`

**Server won't start**
- Check for TypeScript errors: `pnpm run build`
- Verify environment variables are set
- Check port availability: `ss -tlnp | grep :5000`

**WebSocket connection fails**
- Ensure JWT token is valid (not expired)
- Check browser console for errors
- Verify server is running on correct port

**Login/register not working**
- Check Redis connectivity
- Verify JWT_SECRET is set
- Check browser network tab for API errors

### Logs
- Server logs show connection status and errors
- Use `redis-cli MONITOR` to see Redis operations
- Browser dev tools for frontend debugging

## Deployment

### Production Considerations
- Change `JWT_SECRET` to a strong, random value
- Use a managed Redis service (Redis Cloud, AWS ElastiCache, etc.)
- Set `NODE_ENV=production`
- Configure reverse proxy (nginx) for SSL
- Use process manager like PM2 for production

### Example Docker Compose
```yaml
version: '3.8'
services:
  redis:
    image: redis:latest
    ports:
      - "6379:6379"
  chat-app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=your-secret
    depends_on:
      - redis
```

