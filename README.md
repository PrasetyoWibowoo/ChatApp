# 💬 Collaboration Notes - Realtime Chat App

A full-stack, open-source realtime chat application with modern WhatsApp-style UI, email verification, and collaborative features.

## ✨ Features

- 💬 **Realtime Chat**: Instant messaging via WebSocket
- ✉️ **Email Verification**: Secure signup with OTP verification codes
- 🔐 **Authentication**: JWT-based login/signup
- 🖼️ **Image Sharing**: Upload and share images in chat
- 😊 **Reactions**: React to messages with emojis
- 📌 **Pin Messages**: Pin important messages to top
- ✏️ **Edit Messages**: Edit your sent messages
- 💬 **Reply**: Reply to specific messages
- 👀 **Read Receipts**: See who read your messages
- 🔍 **Search**: Search messages in chat room
- 🔗 **Private Rooms**: Generate unique shareable links for private conversations
- 📊 **Online Status**: See who's online in real-time
- 💾 **Message History**: All messages persisted to PostgreSQL

## 🛠️ Tech Stack

### Frontend
- **SolidJS** + TypeScript - Reactive UI framework
- **Vite** - Fast build tool
- **Modern CSS** - Custom design system with dark theme

### Backend
- **Appwrite** - Backend as a Service (BaaS)
  - Built-in Authentication (Email/Password, OAuth)
  - Real-time Database with WebSocket subscriptions
  - File Storage for avatars and images
  - Email verification
  - 100% Free - No credit card required

### Deployment
- **Frontend**: Vercel (free, unlimited deployments)
- **Backend**: Appwrite Cloud (free, no credit card needed)
- **Database**: Appwrite Database (free, included)

## Architecture

### Client
- Clean chat UI with message bubbles (left for others, right for self)
- WebSocket connection sends/receives JSON messages:
  - `{ type: "message", content: "..." }` - Chat message
  - `{ type: "typing", is_typing: true/false }` - Typing indicator
  - `{ type: "history", messages: [...] }` - Message history on connect
- Features:
  - Real-time message delivery
  - Typing indicator ("... is typing")
  - Auto-scroll to latest message
  - Message persistence & history
  - User email display

### Server
- Actix Web WS endpoint: `ws://host:8080/ws/rooms/:id`
- Each room uses tokio broadcast channel for message distribution
- Every message saved to PostgreSQL `messages` table
- On connect: sends last 100 messages as history
- REST endpoints:
  - `/api/auth/signup` - Create account
  - `/api/auth/login` - Get JWT token
  - `/api/rooms/:id/messages` - Get message history (HTTP)

## Quick start

1) Copy env and start Postgres

```powershell
Copy-Item .env.example .env
docker compose up -d
```

2) Run backend

```powershell
cd apps/backend
cargo run
```

3) Run frontend

```powershell
cd ..\frontend
npm install
npm run dev
```

4) Open http://localhost:5173
- Sign up / login
- Open a doc at /docs/demo (or any doc ID)
- Open browser DevTools (F12) → Console tab to see debug logs
- You should see logs like:
  - `[Editor] Connecting to WS: ws://localhost:8080/ws/docs/demo`
  - `[YjsWsProvider] connecting to ws://localhost:8080/ws/docs/demo?token=...`
  - `[YjsWsProvider] connected`
  - `[YjsWsProvider] received snapshot`
  
## Docker notes

- The backend Dockerfile lives at the repository root (`Dockerfile`). This is intentional to support monorepo hosts.
- Railway is configured to reference that root Dockerfile (see `apps/backend/railway.toml` with `dockerfilePath = "../Dockerfile"`).
- An additional Dockerfile also exists in `apps/backend/` for local builds if you prefer building from the service folder.

Optional: You can run the backend in Docker to avoid local toolchain/linker issues on Windows. Use the root-level Dockerfile and ensure your `DATABASE_URL` points to the Postgres container (e.g., `postgres://postgres:password@localhost:5433/realtime_notes` for local compose).
  
5) Test realtime features (open same doc in 2 tabs)
- Type in Tab A → Tab B should show:
  - "typing…" indicator in the top bar
  - Editor surface pulses/glows briefly
  - "last: update" or "last: typing" tag appears
  - Console shows `[Editor] Remote change detected` and `[Editor] Remote typing detected`
- If content seems stale after refresh, click "Resync" button in toolbar

## Env variables

See `.env.example`. Key ones:
- DATABASE_URL=postgres://username:password@localhost:5433/realtime_notes (Docker uses 5433→5432 mapping)
- JWT_SECRET=change_me
- BIND_ADDR=0.0.0.0:8080
- SNAPSHOT_INTERVAL_SECS=5 (reduced from 30 for fresher snapshots on reconnect)
- VITE_API_URL=http://localhost:8080 (or http://<your-ip>:8080 for LAN/mobile testing)

## Features

- **Realtime Chat**: Send and receive messages instantly via WebSocket
- **Message History**: Last 100 messages automatically loaded on join
- **Typing Indicators**: See when others are typing
- **Private Rooms**: Generate unique shareable links for private conversations
  - Visit `/create-room` to generate a unique room link
  - Share the link with anyone to join the same chat room
  - Each room ID is unique (e.g., `room-abc123-xyz456`)
- **Message Persistence**: All messages saved to PostgreSQL
- **User Authentication**: JWT-based login/signup
- **Share Button**: Click 🔗 Share button in chat to copy room link

## How to Use Private Rooms

1. **Create a Private Room**:
   - Login to your account
   - Click "Create Private Room" on the login page, or
   - Visit `/create-room` directly
   - Click "Generate Room Link"
   
2. **Share the Link**:
   - Copy the generated link (e.g., `http://localhost:5173/chat/room-abc123-xyz456`)
   - Share it with anyone you want to chat with
   - They just need to have an account (login/signup)

3. **Join via Link**:
   - Anyone with the link can join the room
   - Room is created automatically when first person joins
   - All messages are saved and history is loaded on join

4. **Share from Inside a Room**:
   - Click the 🔗 Share button in the chat topbar
   - Link is automatically copied to clipboard

## Troubleshooting

**Problem**: Messages not appearing in real-time
1. Open browser DevTools → Console
2. Check for `[Chat]` logs - you should see "Connected"
3. Verify WebSocket connection in Network tab (filter: WS)
4. Ensure you're logged in (JWT token in localStorage)
5. Check backend logs for connection errors

**Problem**: "Invalid Date" showing in messages
- Fixed! Timestamps now validated before display
- Empty/invalid timestamps show as blank

## 🚀 Deployment

### Quick Deploy (15 minutes)
See **[QUICK_DEPLOY.md](QUICK_DEPLOY.md)** for step-by-step guide.

### Full Documentation
See **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** for complete deployment documentation including:
- GitHub setup
- Railway (Backend + Database)
- Vercel (Frontend)
- Environment variables
- CORS configuration
- Troubleshooting
- Free alternatives

### Pre-Deployment Checklist
See **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** to ensure everything is ready.

### 🎓 GitHub Education Pack (Optional)
Get free credits for Railway, DigitalOcean, and more:
- https://education.github.com/pack
- No credit card required!

## 📦 Deployment Stack (100% FREE)

| Component | Platform | Status |
|-----------|----------|--------|
| Frontend | Vercel | ✅ Free Forever |
| Backend | Appwrite Cloud | ✅ Free Forever |
| Database | Appwrite Database | ✅ Free (Included) |
| Auth & Storage | Appwrite | ✅ Free (Included) |
| Domain | Vercel | ✅ Free Subdomain |

**Total Cost**: **$0/month** 🎉

**No Credit Card Required!** ✨

## 🔗 Live Demo

*Coming soon after deployment...*

## 📚 Documentation

- **[QUICK_DEPLOY.md](QUICK_DEPLOY.md)** - Deploy in 15 minutes
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Complete deployment guide
- **[DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checklist
- **[EMAIL_VERIFICATION_SETUP.md](EMAIL_VERIFICATION_SETUP.md)** - Email verification setup
- **[PRODUCTION_FEATURES.md](PRODUCTION_FEATURES.md)** - Production features guide

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- Built with Rust, SolidJS, and PostgreSQL
- Deployed on Railway and Vercel (free tiers)
- Email service powered by Gmail SMTP

## Notes
- This is a production-ready foundation with rate limiting, email verification, and security best practices
- Further hardening (enhanced monitoring, load balancing, CDN) can be added for larger scale
- CORS configured for Vercel production domain
