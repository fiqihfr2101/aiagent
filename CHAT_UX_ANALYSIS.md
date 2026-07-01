# AFILABS Chat Feature — UX Analysis & Improvement Plan

---

## 📋 Current Issues

### Issue 1: No URL Routing
**Problem:** Semua navigasi = client-side state (useState). URL selalu `/`, gak pernah berubah.
**Impact:** 
- ❌ User gak bisa bookmark halaman
- ❌ Gak bisa share link ke halaman spesifik
- ❌ Browser back/forward gak work
- ❌ SEO buruk

### Issue 2: No Session History Persistence
**Problem:** Chat messages disimpan di `useState` (React memory). Hilang saat:
- Ganti tab (Dashboard → Chat → Messages)
- Refresh page
- Close browser

**Backend sudah ada:** `chat_repository.py` dengan PostgreSQL storage
**Frontend belum pakai:** Tidak ada load/save history

### Issue 3: Chat UX Kurang Lengkap
**Problem:** Fitur chat terlalu basic dibanding ChatGPT/Claude

---

## 🎯 Recommended Features

### Tier 1: Critical (Must Have)

#### 1. Session History Sidebar
```
┌─────────────────────────────────────────────┐
│  Orchestrator Chat                          │
├──────────┬──────────────────────────────────┤
│ HISTORY  │  Chat messages here              │
│          │                                  │
│ ▼ Today  │  [HILMAN] Here's the PRD...     │
│  • PRD   │                                  │
│  • API   │  User: Buatkan PRD untuk...      │
│          │                                  │
│ ▼ Yesterday                                   │
│  • Auth  │                                  │
│  • UI    │                                  │
│          │                                  │
│ [+ New]  │  ┌─────────────────────┐         │
│          │  │ Type a message...   │ [Send]  │
│          │  └─────────────────────┘         │
└──────────┴──────────────────────────────────┘
```

**Fitur:**
- ✅ Sidebar daftar conversations
- ✅ Group by date (Today, Yesterday, Last 7 days)
- ✅ Click to load conversation
- ✅ "New Chat" button
- ✅ Delete conversation
- ✅ Rename conversation (auto-generated title)

#### 2. Persistent Conversation State
```
User sends message
    ↓
Backend stores di PostgreSQL (chat_messages table)
    ↓
User switches tab
    ↓
User comes back to Chat
    ↓
Frontend loads conversation from backend API
    ↓
Messages restored! ✅
```

**API Endpoints Needed:**
```
GET /chat/conversations                    → List all conversations
GET /chat/conversations/{id}              → Get conversation with messages
POST /chat/conversations                   → Create new conversation
DELETE /chat/conversations/{id}           → Delete conversation
PATCH /chat/conversations/{id}            → Update conversation (rename)
```

#### 3. URL Routing (Next.js App Router)
```
/dashboard     → Dashboard page
/chat          → Chat page
/chat/{id}     → Specific conversation
/messages      → Messages page
/memory        → Memory page
/analytics     → Analytics page
/workflows     → Workflows page
/plugins       → Plugins page
/settings      → Settings page
```

---

### Tier 2: Important (Should Have)

#### 4. Streaming Responses
**Current:** User waits for full response (can take 30+ seconds)
**Better:** Stream response token-by-token (like ChatGPT)

```
User: "Buatkan PRD untuk project ini"
    ↓
HILMAN: "Baik, saya akan..."  ← Appears immediately
HILMAN: "buatkan PRD untuk..."  ← Streams in
HILMAN: "project JastipHub..."  ← Continues
```

**Implementation:**
```python
# Backend: Use SSE for streaming
@app.post("/chat/stream")
async def chat_stream(prompt: str = Form(...)):
    async def generate():
        async for chunk in llm_stream(prompt):
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

#### 5. Agent Quick Selector
```
┌─────────────────────────────────────────────┐
│  Route to:                                  │
│  [HILMAN 📋] [BAHLUL ⚙️] [DEDEN 🎨]       │
│  [TEDDY 🎨] [BUDI 🧪]                      │
└─────────────────────────────────────────────┘
```

**Fitur:**
- ✅ Click agent badge to force-route
- ✅ Show agent status (online/offline)
- ✅ Show agent current task

#### 6. File Preview & Management
```
┌─────────────────────────────────────────────┐
│  📎 Attached Files                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │📄 PRD   │ │🖼️ Mockup│ │💻 Code  │      │
│  │ .md     │ │ .png    │ │ .py     │      │
│  │ 14.9KB  │ │ 2.1MB   │ │ 3.2KB   │      │
│  │ [x]     │ │ [x]     │ │ [x]     │      │
│  └─────────┘ └─────────┘ └─────────┘      │
└─────────────────────────────────────────────┘
```

**Fitur:**
- ✅ Preview images inline
- ✅ Show file icons for documents
- ✅ Show file size
- ✅ Remove file before sending
- ✅ Drag & drop support

#### 7. Message Actions
```
┌─────────────────────────────────────────────┐
│  [HILMAN] Here's the PRD...                 │
│                                             │
│  [📋 Copy] [🔄 Regenerate] [📌 Pin]        │
└─────────────────────────────────────────────┘
```

**Fitur:**
- ✅ Copy message content
- ✅ Regenerate response
- ✅ Pin important messages
- ✅ React with emoji

---

### Tier 3: Nice to Have

#### 8. Multi-Agent Collaboration
```
User: "Buatkan full-stack feature untuk auth"
    ↓
HILMAN: "Saya akan koordinasikan tim:"
    ↓
  → BAHLUL: "Backend API siap" ✅
  → DEDEN: "Frontend UI siap" ✅
  → BUDI: "Test cases siap" ✅
    ↓
HILMAN: "Semua task selesai! Here's the summary..."
```

#### 9. Knowledge Base Integration
```
User: "Buatkan PRD"
    ↓
Agent checks knowledge base:
  → Previous PRDs
  → Project context
  → Team capabilities
    ↓
Agent generates context-aware PRD
```

#### 10. Code Execution
```
User: "Test API endpoint ini"
    ↓
Agent runs code:
  → curl /api/test
  → Returns result
    ↓
Agent: "API returns 200 OK with data..."
```

---

## 📊 Feature Priority Matrix

| Priority | Feature | Effort | Impact |
|----------|---------|--------|--------|
| 🔴 P0 | Session History Sidebar | Medium | High |
| 🔴 P0 | Persistent Conversation State | Medium | High |
| 🔴 P0 | URL Routing | High | High |
| 🟡 P1 | Streaming Responses | Medium | High |
| 🟡 P1 | Agent Quick Selector | Low | Medium |
| 🟡 P1 | File Preview & Management | Medium | Medium |
| 🟡 P1 | Message Actions | Low | Medium |
| 🟢 P2 | Multi-Agent Collaboration | High | High |
| 🟢 P2 | Knowledge Base Integration | High | Medium |
| 🟢 P2 | Code Execution | High | Medium |

---

## 🚀 Implementation Plan

### Phase 1: Foundation (Week 1)
1. ✅ Implement URL routing (Next.js App Router)
2. ✅ Implement session history sidebar
3. ✅ Implement persistent conversation state
4. ✅ Add conversation list API endpoints

### Phase 2: Core UX (Week 2)
5. ✅ Implement streaming responses
6. ✅ Implement agent quick selector
7. ✅ Implement file preview & management
8. ✅ Implement message actions

### Phase 3: Advanced (Week 3+)
9. ⏳ Multi-agent collaboration
10. ⏳ Knowledge base integration
11. ⏳ Code execution

---

## 📝 Technical Notes

### Frontend Architecture
```
frontend/src/
├── app/
│   ├── layout.tsx              → Root layout
│   ├── page.tsx                → Redirect ke /dashboard
│   ├── dashboard/
│   │   └── page.tsx            → Dashboard page
│   ├── chat/
│   │   ├── page.tsx            → Chat page (new conversation)
│   │   └── [id]/
│   │       └── page.tsx        → Specific conversation
│   ├── messages/
│   │   └── page.tsx            → Messages page
│   ├── memory/
│   │   └── page.tsx            → Memory page
│   ├── analytics/
│   │   └── page.tsx            → Analytics page
│   ├── workflows/
│   │   └── page.tsx            → Workflows page
│   ├── plugins/
│   │   └── page.tsx            → Plugins page
│   └── settings/
│       └── page.tsx            → Settings page (sudah ada)
```

### Backend API
```
GET    /chat/conversations              → List conversations
POST   /chat/conversations              → Create conversation
GET    /chat/conversations/{id}         → Get conversation + messages
DELETE /chat/conversations/{id}         → Delete conversation
PATCH  /chat/conversations/{id}         → Update conversation
POST   /chat                            → Send message (existing)
POST   /chat/stream                     → Send message (streaming)
```

### Database Schema (sudah ada)
```sql
-- chat_conversations table
CREATE TABLE chat_conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT DEFAULT 'New Chat',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- chat_messages table
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    agent_name TEXT,
    agent_role TEXT,
    files TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id)
);
```