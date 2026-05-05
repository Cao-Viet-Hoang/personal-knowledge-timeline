# Personal Knowledge Timeline

A personal knowledge management app for capturing, organizing, and resurfacing information over time. Built with **zero dependencies** — pure vanilla JavaScript ES6 modules, plain CSS with shadcn/ui-inspired design tokens, and a swappable storage backend.

---

## Features

### Knowledge Capture

- **4 entry types** — Link, Note, Thought, Quote, each with type-appropriate fields
- **Quick capture bar** — paste a URL or type a note inline; type is auto-detected
- **Full entry form** — title, content, excerpt, personal note, tags, status, created date, related entries, images
- **Image upload** — drag-drop, paste, or file select with compression profiles (auto / mobile / tablet / desktop)
- **Backdating** — set any creation date when logging past events

### Organization

- **Status workflow** — Inbox → Processed → Archived
- **Tags** — multi-tag with normalization (lowercase, diacritics stripped, deduplicated)
- **Starred entries** — bookmark important items
- **Ticket numbers** — sequential `#1`, `#2`, … IDs (Azure DevOps style) for referencing entries
- **Filter bar** — filter by status, starred, and tag across all views

### Entry Linking

- **Related entries** — manually link entries; search by title or `#N` ticket number
- **Bidirectional backlinks** — "Links to" (outgoing) and "Linked from" (incoming) sections auto-maintained by the store
- **Self-healing** — backlinks are reconstructed on load; dangling refs are cleaned up automatically

### Search

| Mode | Description |
|---|---|
| Keyword | Full-text across title, tags, content, excerpt, notes — weighted scoring |
| Semantic | Embedding-based cosine similarity (requires AI) |
| Hybrid | 60% semantic + 40% keyword blend (default when AI is configured) |

- Real-time results with 200 ms debounce
- Paginated (50 per page)

### AI Features (optional, requires OpenAI-compatible endpoint)

All AI features require a user-supplied API key stored in `localStorage`. No backend, no proxy.

**Entry form AI toolbar:**
- Parse URL — fetch and analyse a web page, extract title, excerpt, and tags
- Auto Title — generate a concise title from content
- Auto Summary — 1–2 sentence summary
- Auto Tags — suggest 3–6 topical tags
- Expand — flesh out a short note into a full paragraph
- Translate — translate content + summary to English or Vietnamese
- EN / VI output language toggle per entry

**Auto-enrichment on save** — when enabled, the AI pipeline runs before the entry is persisted so tags, summary, and embedding land in a single write. A "Save without AI" escape hatch is available on failure.

**Ask your knowledge (RAG):**
- Natural language questions answered from your notes
- Semantically retrieves the most relevant entries
- Grounded citations `[1]`, `[2]` link back to the source entries
- Suggested prompts generated from your tag cloud

**Digest & synthesis:**
- Weekly or monthly summary grouped by theme
- Detect recurring patterns across entries
- Synthesize all starred entries into a narrative

**Chat with entry:**
- Multi-turn conversation scoped to a single entry
- Discuss ideas, ask follow-up questions

**Embedding index:**
- Coverage stats (N / total indexed)
- Index missing, re-index all, or clear vectors from AI Settings

**Tag maintenance:**
- Detect semantic duplicate tags (e.g., `js` / `javascript` / `JS`)
- Merge with one click; updates every affected entry in a single pass

**Duplicate detection:**
- Warns on save when a new entry is >0.82 cosine similar to an existing one

### Review & Reflection

- **Spaced review** — resurfaces entries older than 2 days, 5 per session, random shuffle
- **Daily reflection** — freeform journal entry per calendar day, persisted by date
- AI-suggested reflection prompts (when AI is configured)

### Storage

| Mode | Backend |
|---|---|
| Dev | IndexedDB (local, no credentials needed) |
| Prod | Firebase Firestore (cloud sync) |

- Adapter pattern — swap backends without touching app logic
- Incremental persistence — only the changed entry/reflection/meta is written
- Separate vector storage — embeddings never bloat the main document
- Auto-migration from legacy localStorage (dev) and legacy single-doc Firestore format (prod)

### UI & UX

- Sidebar navigation with mobile drawer
- Entry detail modal with full field display, image lightbox, and action buttons
- Markdown rendering in Ask answers and Digest output
- Image lightbox with arrow-key navigation
- Responsive layout — mobile-first, tested at 480 px

**Keyboard shortcuts:**

| Shortcut | Action |
|---|---|
| `Ctrl / Cmd + K` | Open search |
| `Ctrl / Cmd + N` | New entry |
| `Ctrl + Enter` | Submit in Ask view |
| `Esc` | Close modal / dropdown |
| `←` / `→` | Navigate lightbox images |

---

## Tech Stack

- **Language** — Vanilla JavaScript (ES6 modules, `type="module"`)
- **Styling** — Plain CSS with CSS custom properties (shadcn/ui design tokens)
- **Icons** — Inline SVG from the Lucide icon set
- **Fonts** — Inter via Google Fonts
- **Storage** — IndexedDB (dev) / Firebase Firestore (prod) via adapter pattern
- **Build tools** — None. No npm, no bundler, no transpiler.
- **Firebase SDK** — Loaded dynamically via CDN script injection (prod mode only)
- **AI** — Any OpenAI-compatible endpoint (`POST /chat/completions` + `POST /embeddings`)

---

## Running Locally

Open `index.html` directly in a browser, or serve with any static file server:

```bash
npx serve .
# or
python -m http.server 8000
```

No build step required.

---

## Project Structure

```
index.html
css/
  variables.css       ← Design tokens (shadcn/ui palette)
  base.css, utilities.css, layout.css
  components.css      ← Buttons, badges, tags, inputs
  forms.css, modal.css, timeline.css
  search.css, review.css, ai.css, responsive.css
js/
  app.js              ← Main entry, routing, event delegation
  config.js           ← Environment config (dev/prod switch)
  components/         ← View render functions
  ai/                 ← Browser-side AI layer (config, client, actions, search, index)
  store/              ← CRUD, event bus, IndexedDB & Firestore adapters
  utils/              ← DOM helpers, icons, date, image, markdown, tags
```

---

## AI Configuration

1. Open **AI Settings** (gear icon in the sidebar).
2. Enter your endpoint base URL (e.g., `https://api.openai.com/v1`), API key, chat model, and embedding model.
3. Click **Test connection**.

Azure OpenAI is supported via its v1 surface — set `baseUrl` to `https://{resource}.openai.azure.com/openai/v1` and use your deployment name as the model.

Credentials are stored only in your browser's `localStorage` and are sent only to the configured endpoint.
