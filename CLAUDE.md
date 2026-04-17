# Personal Knowledge Timeline (PKT)

A personal knowledge management app for capturing, organizing, and resurfacing information over time. Built with zero dependencies — pure vanilla JavaScript ES6 modules, plain CSS with shadcn/ui-inspired design tokens, and a swappable storage backend (IndexedDB for dev, Firebase Firestore for prod). Designed to scale to thousands of entries.

## Tech Stack

- **Language**: Vanilla JavaScript (ES6 modules, `type="module"`)
- **Styling**: Plain CSS with CSS custom properties (design tokens in `css/variables.css`)
- **Icons**: Inline SVG from Lucide icon set (`js/utils/icons.js`)
- **Fonts**: Inter (sans-serif) via Google Fonts
- **Storage**: Adapter pattern — `LocalAdapter` (dev, IndexedDB) / `FirebaseAdapter` (prod, Firestore sub-collections)
- **Build tools**: None. No npm, no bundler, no transpiler
- **Firebase SDK**: Loaded dynamically via CDN script injection (prod mode only)

## Architecture

```
index.html                  ← Single entry point
css/
  variables.css             ← Design tokens (shadcn/ui palette)
  base.css                  ← Global resets
  utilities.css             ← Utility classes
  layout.css                ← App shell layout
  components.css            ← Buttons, badges, tags, inputs
  forms.css                 ← Form elements
  modal.css                 ← Modal & dialog
  timeline.css              ← Timeline & entry cards
  search.css                ← Search page
  review.css                ← Review/reflection view
  ai.css                    ← AI-feature UI (settings, ask, digest, chat, toolbar)
  responsive.css            ← Mobile breakpoints
js/
  app.js                    ← Main entry, routing, event delegation
  config.js                 ← Environment config (dev/prod switch)
  components/               ← View components (render functions)
    sidebar.js, timeline.js, entry-card.js, entry-detail.js,
    entry-form.js, search.js, filters.js, review.js,
    modal.js, confirm-modal.js, firebase-modal.js,
    ai-settings-modal.js, ask-view.js, digest-view.js,
    chat-entry-modal.js
  ai/                       ← Browser-side AI layer (OpenAI-compatible)
    ai-config.js            ← Endpoint/key/model config (localStorage)
    ai-client.js            ← Low-level chat + embeddings HTTP calls
    ai-actions.js           ← High-level features (enrich, translate, RAG, digest)
    ai-search.js            ← Semantic / hybrid / similarity search
    ai-index.js             ← Batch embedding jobs + per-entry index
    embeddings.js           ← Vector math, base64 Float32 codec
  store/                    ← Data layer
    store.js                ← CRUD, filter, search, reflections, embeddings
    event-bus.js            ← Pub/sub for state changes
    local-adapter.js        ← IndexedDB persistence (dev)
    firebase-adapter.js     ← Firestore sub-collection persistence (prod)
  utils/                    ← Stateless helpers
    dom.js                  ← $, $$, on, html, createElement
    icons.js                ← SVG icon library
    date.js                 ← Date formatting
    image.js                ← Image compression & upload
data/
  seed.json                 ← Sample data for dev mode
```

## Core Patterns

### Component Pattern
Each component is a **function that returns an HTML string** via template literals. Components are rendered by assigning to `element.innerHTML`. There is no virtual DOM.

```js
// Good — component returns HTML string
export function renderMyComponent(container, data) {
  container.innerHTML = `<div class="my-component">...</div>`;
}
```

### Event Handling
Use **event delegation** via the `on()` helper from `js/utils/dom.js`. Actions are triggered through `data-*` attributes.

```js
on(document, "click", "[data-action='my-action']", (e, el) => {
  // handle action
});
```

### State Management
- State lives in `js/store/store.js` as a private `_db` object (all entries cached in memory)
- Mutations go through exported store functions (createEntry, updateEntry, etc.)
- Changes emit events via `event-bus.js` (e.g., `ENTRIES_CHANGED`)
- Persistence is **incremental** — only the changed entry/reflection/meta is written to the adapter
- Timeline and search views use **pagination** (50 items per page with "Load more")

### Storage Adapter
Adapters implement:
- `load()` → `{ entries, reflections, meta } | null` (bulk load on boot)
- `persistEntry(id, entry)` → write single entry
- `deleteEntry(id)` → delete single entry
- `persistReflection(date, ref)` → write single reflection
- `persistMeta(meta)` → write meta
- `persistAll(db)` → bulk write (seed loading)
- `clear()` → wipe all data

**LocalAdapter** uses IndexedDB with auto-migration from legacy localStorage.
**FirebaseAdapter** uses Firestore sub-collections with auto-migration from legacy single-doc format.

## Naming Conventions

| Category        | Convention         | Example                              |
|-----------------|--------------------|--------------------------------------|
| JS variables    | camelCase          | `currentView`, `activeFilters`       |
| JS constants    | UPPER_SNAKE_CASE   | `VIEW_TITLES`, `TYPE_LABELS`         |
| JS private vars | leading underscore | `_db`, `_adapter`                    |
| CSS classes     | BEM-like           | `.ec`, `.ec-title`, `.ec--link`      |
| Data attributes | kebab-case         | `data-entry-id`, `data-action`       |
| Event names     | SCREAMING_SNAKE    | `ENTRIES_CHANGED`, `ENTRY_CREATED`   |
| File names      | kebab-case         | `entry-card.js`, `local-adapter.js`  |
| Functions       | camelCase verbs    | `renderTimeline`, `handleSaveEntry`  |

## Code Rules

1. **All code MUST be written in English** — variable names, function names, comments, commit messages, CSS class names, data attributes. No Vietnamese or other languages in source code.

2. **Follow shadcn/ui design system** — Use CSS custom properties from `css/variables.css` for all colors, spacing, radius, shadows, and typography. Never hardcode color values or pixel sizes. Reference tokens like `hsl(var(--primary))`, `var(--space-4)`, `var(--radius-md)`.

3. **Maintain visual and structural consistency** — New components must match the existing style: same spacing scale, same color tokens, same border-radius, same shadow levels. Check `css/components.css` for reference patterns.

4. **No external dependencies** — This project has zero npm packages. Do not introduce any package manager, bundler, or external library. Use browser-native APIs only.

5. **Components are render functions** — Each component exports a `render*` function that writes HTML to a container via `innerHTML`. Do not create class-based components or use DOM diffing.

6. **Use event delegation** — Attach handlers via `on(document, "click", "[data-action='...']", handler)`. Do not attach listeners directly to dynamically created elements.

7. **Store is the single source of truth** — All data mutations go through `store.js`. Components read from the store; they never hold their own persistent state.

8. **CSS files are modular** — Each CSS file covers one concern. New features should add styles to the appropriate existing file, or create a new file following the same pattern (imported in `index.html`).

9. **HTML escaping** — Always use the `esc()` function when inserting user-provided text into HTML templates to prevent XSS.

10. **Mobile-first responsive** — All new UI must work on mobile. Check `css/responsive.css` for breakpoint patterns.

## Environment

- **Dev mode** (`ENV = "dev"` in `config.js`): Uses IndexedDB + `data/seed.json`. No credentials needed.
- **Prod mode** (`ENV = "prod"`): Uses Firebase Firestore. Credentials entered via UI modal on first visit.

## Documentation Sync (MANDATORY)

**After every code change**, you MUST update the relevant documentation to stay in sync with the codebase:

### When to update CLAUDE.md
- **New file created** → Update the Architecture tree above
- **File renamed or deleted** → Remove/rename in the Architecture tree
- **New component added** → Add to the `components/` list
- **New CSS file added** → Add to the `css/` list
- **New util added** → Add to the `utils/` list
- **New naming convention** → Add to the Naming Conventions table
- **New code rule established** → Add to the Code Rules list
- **New view/route added** → Document in the relevant section

### When to update `.claude/rules/`
- **New store function pattern** → Update `rules/store-pattern.md` (add new events, new adapter methods, etc.)
- **New component convention** → Update `rules/component-pattern.md`
- **New CSS token or pattern** → Update `rules/css-conventions.md`
- **New naming convention** → Update `rules/code-style.md`

### When to update `.claude/skills/`
- **New workflow pattern emerges** → Create a new skill or update existing ones
- **Existing skill steps change** → Update the skill's step-by-step guide

### When to update `.claude/agents/`
- **New review criteria needed** → Add to the relevant agent's checklist
- **New pattern to enforce** → Add to agent's "What You Check" section

### How to sync
1. After completing any code change, **review which docs are affected**
2. Update ALL affected docs **in the same session** — never leave docs stale
3. The Architecture tree in this file must **exactly match** the actual file structure
4. Rules must reflect the **current** patterns in the codebase, not outdated ones
5. If you add a new event to `event-bus.js`, update both `CLAUDE.md` and `rules/store-pattern.md`
6. If you add a new design token to `variables.css`, update `rules/css-conventions.md`

**Rule: No code change is complete until its documentation is updated.**

## Environment

- **Dev mode** (`ENV = "dev"` in `config.js`): Uses IndexedDB + `data/seed.json`. No credentials needed.
- **Prod mode** (`ENV = "prod"`): Uses Firebase Firestore. Credentials entered via UI modal on first visit.

## Running Locally

Open `index.html` directly in a browser, or serve with any static file server:
```bash
npx serve .
# or
python -m http.server 8000
```
