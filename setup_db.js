const PAT = process.env.SUPABASE_ACCESS_TOKEN || 'YOUR_SUPABASE_ACCESS_TOKEN';
const REF = process.env.SUPABASE_PROJECT_REF || 'YOUR_SUPABASE_PROJECT_REF';


const sql = `
CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "avatarUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL,
    "lastActiveText" TEXT NOT NULL,
    "isRecent" BOOLEAN NOT NULL,
    "recentMessageText" TEXT NOT NULL,
    "recentMessageTime" TEXT NOT NULL,
    "recentMessageIsUnread" BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    "contactId" TEXT NOT NULL,
    text TEXT NOT NULL,
    "isFromMe" BOOLEAN NOT NULL,
    timestamp BIGINT NOT NULL,
    "timeText" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL,
    "attachmentUrl" TEXT,
    reaction TEXT
);

CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isSessionActive" BOOLEAN DEFAULT false NOT NULL
);

-- Enable Realtime for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE messages, contacts;
`;

fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${PAT}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
})
.then(res => res.json().then(data => ({status: res.status, data})))
.then(console.log)
.catch(console.error);
