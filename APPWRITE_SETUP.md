# Appwrite Setup Guide

## 1. Create Appwrite Account

1. Go to https://cloud.appwrite.io
2. Sign up (gratis, tidak perlu kartu kredit)
3. Create new project: **ChatApp**
4. Copy your **Project ID**

## 2. Configure Frontend

1. Copy `.env.example` to `.env`:
   ```bash
   cd apps/frontend
   cp .env.example .env
   ```

2. Edit `.env` dan masukkan Project ID:
   ```env
   VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
   VITE_APPWRITE_PROJECT_ID=your_project_id_here
   VITE_APPWRITE_DATABASE_ID=chatapp
   ```

## 3. Setup Database & Collections di Appwrite Console

### Create Database
1. Di Appwrite Console, pilih project **ChatApp**
2. Klik **Databases** di sidebar
3. Create database dengan ID: `chatapp`

### Create Collections

#### Collection 1: users
- **Collection ID**: `users`
- **Attributes**:
  - `username` (String, required, size: 50)
  - `email` (Email, required, size: 255)
  - `avatar_url` (URL, optional, size: 500)
  - `email_verified` (Boolean, default: false)
- **Indexes**:
  - `username_idx` on `username` (unique)
  - `email_idx` on `email` (unique)
- **Permissions**:
  - Read: Any
  - Create: Users
  - Update: Users (own documents)
  - Delete: Users (own documents)

#### Collection 2: rooms
- **Collection ID**: `rooms`
- **Attributes**:
  - `name` (String, required, size: 100)
  - `owner_id` (String, required, size: 50)
  - `created_at` (DateTime, required)
- **Permissions**:
  - Read: Any
  - Create: Users
  - Update: Users (owner only)
  - Delete: Users (owner only)

#### Collection 3: messages
- **Collection ID**: `messages`
- **Attributes**:
  - `room_id` (String, required, size: 50)
  - `user_id` (String, required, size: 50)
  - `content` (String, required, size: 5000)
  - `reply_to` (String, optional, size: 50)
  - `edited_at` (DateTime, optional)
  - `deleted_at` (DateTime, optional)
  - `created_at` (DateTime, required)
- **Indexes**:
  - `room_idx` on `room_id`
  - `created_idx` on `created_at` (DESC)
- **Permissions**:
  - Read: Any
  - Create: Users
  - Update: Users (own documents)
  - Delete: Users (own documents)

#### Collection 4: room_users
- **Collection ID**: `room_users`
- **Attributes**:
  - `room_id` (String, required, size: 50)
  - `user_id` (String, required, size: 50)
  - `joined_at` (DateTime, required)
- **Indexes**:
  - `room_user_idx` on `room_id`, `user_id` (unique)
- **Permissions**:
  - Read: Any
  - Create: Users
  - Delete: Users (own documents)

#### Collection 5: message_reads
- **Collection ID**: `message_reads`
- **Attributes**:
  - `user_id` (String, required, size: 50)
  - `room_id` (String, required, size: 50)
  - `last_read_at` (DateTime, required)
- **Indexes**:
  - `user_room_idx` on `user_id`, `room_id` (unique)
- **Permissions**:
  - Read: Users
  - Create: Users
  - Update: Users (own documents)

#### Collection 6: message_reactions
- **Collection ID**: `message_reactions`
- **Attributes**:
  - `message_id` (String, required, size: 50)
  - `user_id` (String, required, size: 50)
  - `emoji` (String, required, size: 10)
  - `created_at` (DateTime, required)
- **Indexes**:
  - `msg_user_idx` on `message_id`, `user_id`, `emoji` (unique)
- **Permissions**:
  - Read: Any
  - Create: Users
  - Delete: Users (own documents)

## 4. Configure Platform Settings

1. Di Appwrite Console, klik **Settings**
2. Add Platform:
   - **Type**: Web
   - **Name**: Frontend
   - **Hostname**: `localhost` (untuk development)
3. Add Platform lagi:
   - **Type**: Web
   - **Name**: Production
   - **Hostname**: `chat-app-sigma-topaz-55.vercel.app` (atau domain Vercel Anda)

## 5. Enable Authentication

1. Klik **Auth** di sidebar
2. Enable:
   - Email/Password
   - Email Verification (optional)

## 6. Deploy to Vercel

1. Add environment variables di Vercel:
   ```
   VITE_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
   VITE_APPWRITE_PROJECT_ID=your_project_id_here
   VITE_APPWRITE_DATABASE_ID=chatapp
   ```

2. Redeploy

## Benefits of Using Appwrite

✅ **No CORS Issues** - Appwrite handles CORS properly
✅ **Built-in Auth** - Email/password, OAuth, JWT
✅ **Real-time Database** - Built-in WebSocket subscriptions
✅ **File Storage** - For avatars and images
✅ **100% Free** - No credit card required
✅ **No Backend Code** - Everything handled by Appwrite

## Migration from Railway Backend

The Rust backend can be deprecated. Appwrite provides:
- Database → Appwrite Databases
- Authentication → Appwrite Account
- WebSocket → Appwrite Realtime
- File Upload → Appwrite Storage
- Email → Appwrite Email (coming soon)

All features are available through the Appwrite SDK in the frontend!
