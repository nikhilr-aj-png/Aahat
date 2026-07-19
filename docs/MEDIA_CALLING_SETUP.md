# Aahat Supabase media and one-to-one calling

## Current deployment mode

- Chat photos, videos, PDFs and voice notes use the existing Supabase Storage buckets and public URLs.
- Delete for everyone (within 12 hours) removes the corresponding Supabase Storage object and records cleanup status.
- Cloudflare R2 and TURN are retained only as an optional future upgrade; no Cloudflare account is required now.

## Architecture

- SDP, ICE, ringing, accept/reject, media-state and hangup messages use authenticated Supabase Realtime private Broadcast channels.
- Audio/video packets use `RTCPeerConnection` directly between devices. Supabase never transports the live media stream.
- ICE starts with the account-free `stun:stun.cloudflare.com:3478` service; TURN is requested only when `VITE_ENABLE_CLOUDFLARE_TURN=true`.
- Chat files currently upload to the existing Supabase `attachments` and `voice-notes` buckets.
- Supabase `messages.attachment_url` stores the existing Storage URL used by the chat UI and deletion RPC.
- Calls are not recorded and live streams are never written to R2.

## 1. Apply the Supabase migration

Apply `supabase/migrations/20260718_private_webrtc_and_r2_media.sql` after the earlier migrations. It:

- upgrades the existing `calls` table in place to `caller_id`, `receiver_id`, `type`, `status`, `started_at`, `answered_at`, and `ended_at`;
- adds all requested call states and duplicate-call locking through `start_direct_call`;
- limits call reads to caller/receiver and routes mutations through guarded RPCs;
- authorizes only `call:user:<own-user-id>` and participant-only `call:<call-id>` private topics;
- adds R2 metadata columns to the existing `messages` table without creating a duplicate message table;
- prevents users from inserting another user's R2 object key.

Enable Realtime Authorization and disable **Allow public access** in Supabase Dashboard → Realtime Settings. Do not add SDP or ICE payloads to Postgres.

## 2. Optional future Cloudflare Edge Functions (do not deploy now)

```bash
supabase functions deploy rtc-credentials
supabase functions deploy r2-media
```

Hosted Supabase Edge Functions provide `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Store all remaining values with `supabase secrets set`; never put them in a `VITE_` variable.

## 3. Optional future Cloudflare R2 bucket

1. In Cloudflare Dashboard → R2, create a private bucket such as `aahat-private-media`. Do not attach a public custom domain or enable `r2.dev` public access.
2. Create an R2 API token scoped only to **Object Read & Write** for this bucket.
3. Save the Account ID, Access Key ID, Secret Access Key and bucket name as Edge Function secrets.
4. Configure bucket CORS for the real web origins. Example for local and production:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://chat.example.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Uploads are validated twice: before URL creation and again with R2 `HEAD` after upload. Limits are image 2MB, video 50MB, audio 10MB, and document 20MB. Object names use random UUIDs under `conversations/<conversation>/<sender>/`.

## 4. Optional future Cloudflare TURN

1. In Cloudflare Dashboard → Realtime → TURN, create a TURN key.
2. Keep its key ID and API token only in Supabase Edge Function secrets.
3. The `rtc-credentials` function authenticates the Aahat user and requests a one-hour credential from:
   `https://rtc.live.cloudflare.com/v1/turn/keys/<KEY_ID>/credentials/generate-ice-servers`.
4. Cloudflare's returned configuration includes UDP and TCP TURN plus TLS `turns:` URLs. The browser receives only the expiring username/credential, never the long-lived API token.

## 5. Required environment variables

Browser-safe:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (or publishable key)
- existing Firebase browser variables
- `VITE_ENABLE_CLOUDFLARE_TURN=false` for the current account-free mode

Optional future Cloudflare Edge Function secrets:

- `APP_ORIGIN`
- `CLOUDFLARE_TURN_KEY_ID`
- `CLOUDFLARE_TURN_KEY_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`
- `SUPABASE_SERVICE_ROLE_KEY` only for other trusted backend operations that require it; the two new endpoints do not return or expose it.

## 6. Local testing

1. Run Supabase locally and apply all migrations.
2. Run the web client with `npm run dev` from `web/`.
3. Send a photo, video, PDF and voice note; verify the object appears in the existing Supabase Storage bucket.
4. Verify `messages.attachment_url` contains the Supabase Storage URL.
5. Delete the message for everyone within 12 hours; verify the object is removed and `deleted_messages.storage_cleanup_status='deleted'`.
6. Delete for me must hide only the message and must not remove media needed by the other participant.

## 7. Two-device call testing

1. Use two real accounts on separate devices/networks. HTTPS is required outside localhost for camera/microphone access.
2. Start voice and video calls in both directions; verify calling → ringing → connecting → connected.
3. Test reject, 45-second missed call, hangup, mute/unmute, camera off/on, front/rear camera switch and screen sharing.
4. Move one phone between Wi-Fi and cellular. Verify disconnected/reconnecting state and ICE restart.
5. When Cloudflare is enabled in the future, force a restrictive network and verify a `relay` candidate in `chrome://webrtc-internals`.
6. Open a second tab for the same caller and attempt a simultaneous call; the transactional RPC must reject the duplicate.
7. Inspect Supabase Realtime logs/topics: signaling payloads are broadcasts on private channels; no audio/video binary payload is present.

## Security invariants

- Actual call media is WebRTC P2P; Supabase carries signaling events, never the live audio/video stream.
- Current uploaded media bytes live in Supabase Storage and messages store the existing Storage URL.
- Delete for everyone triggers Supabase Storage removal; delete for me does not remove the shared object.
- Optional future Cloudflare credentials and Supabase privileged keys must never enter the browser bundle.
