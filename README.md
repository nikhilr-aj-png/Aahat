# Aahat Messaging Platform

Aahat is a Supabase-backed messaging platform with a user web app and a separate authenticated admin dashboard.

## Apps

- `web`: user-facing chat app with auth, direct chats, groups, statuses/stories, channels, media uploads, notifications, and calls.
- `admin`: Supabase Auth protected dashboard for `super_admin` users to inspect profiles, conversations, and message audit logs.

## Required Environment

Create `.env` files from the templates:

```bash
copy web\.env.example web\.env
copy admin\.env.example admin\.env
```

Required values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

For push notifications in `web`, also set the `VITE_FIREBASE_*` values from `web/.env.example`.

Never put a Supabase personal access token or service role key in `web/.env` or `admin/.env`. Browser apps must use the anon/publishable key only.

## Supabase Setup

1. Open the Supabase SQL editor for the production project.
2. Run `supabase_schema_v2.sql` fully.
3. Confirm these buckets exist: `avatars`, `attachments`, `voice-notes`, `status-media`, `channel-media`.
4. Create your first admin account through the app or Supabase Auth.
5. Promote that profile:

```sql
UPDATE public.profiles
SET role = 'super_admin'
WHERE email = 'admin@example.com';
```

6. In Supabase Realtime, enable replication for the realtime tables used by the app: `messages`, `conversation_members`, `profiles`, `statuses`, `calls`, `call_signaling`, `channels`, `channel_posts`.

## Local Development

Install and run the user app:

```bash
cd web
npm install
npm run dev
```

Install and run the admin dashboard:

```bash
cd admin
npm install
npm run dev
```

## Production Verification

Run these before deploy:

```bash
cd web
npm run lint
npm run build

cd ..\admin
npm run lint
npm run build
```

Both apps should lint without errors and produce a Vite `dist` directory.

## Deployment

Deploy `web` and `admin` as separate Vite static apps. Set each app's environment variables in the hosting dashboard. Recommended hosting options: Vercel, Netlify, Cloudflare Pages, or Supabase static hosting.

For production calls, configure a TURN server in the WebRTC layer before relying on voice/video calls across restrictive networks. The app currently includes public STUN servers, which are useful for development but not enough for all production networks.

## Security Checklist

- Rotate any Supabase personal access token that was shared outside a secret manager.
- Keep service role keys server-side only.
- Use `profiles.role = 'super_admin'` for admin access.
- Keep RLS enabled on all app tables.
- Review storage policies before making buckets private.
- Enable Supabase email confirmation and rate limits for public production traffic.

