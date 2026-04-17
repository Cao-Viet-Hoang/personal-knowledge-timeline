---
description: Rules for creating and modifying UI components in the vanilla JS component system
globs: ["js/components/**/*.js"]
---

# Component Pattern Rules

## Structure
Every component file follows this pattern:

```js
/**
 * ComponentName component.
 * Brief description of what it renders.
 */

import { $, on } from "../utils/dom.js";
import { icon } from "../utils/icons.js";

export function renderComponentName(container, data, callbacks) {
  container.innerHTML = `
    <div class="component-name">
      ${data.items.map(item => `
        <div class="component-item" data-item-id="${item.id}">
          ${esc(item.title)}
        </div>
      `).join("")}
    </div>
  `;
}
```

## Key Rules

1. **Export a single `render*` function** — named `render` + PascalCase component name
2. **Accept `container` as first parameter** — the DOM element to render into
3. **Render via `innerHTML`** — assign the full HTML string to `container.innerHTML`
4. **Never return DOM nodes** — return HTML strings only; the caller sets innerHTML
5. **Accept callbacks object** — pass event handlers as `{ onEntryClick, onStar, onEdit }`, not as direct function references in templates
6. **Use `data-*` attributes for actions** — e.g., `data-action="detail-star"`, `data-entry-id="${entry.id}"`
7. **Escape user content** — always wrap user-provided text with `esc()` to prevent XSS
8. **Use `icon()` helper for SVGs** — import from `../utils/icons.js`, never inline raw SVG

## Event Handling in Components

Components do NOT attach their own event listeners to rendered elements. Instead:

- Use `data-action` and `data-*` attributes on interactive elements
- Register delegated handlers in `app.js` via `on(document, "click", "[data-action='...']", handler)`
- For component-local interactions (e.g., type selector toggle), use `initFormInteractions()` pattern called after render

## Conditional Rendering

Use ternary operators and logical AND for conditional content:

```js
${entry.starred ? icon("star-filled") : icon("star")}
${entry.sourceUrl ? `<a href="${esc(entry.sourceUrl)}">${esc(entry.sourceDomain)}</a>` : ""}
```

## Iteration

Use `.map().join("")` for rendering lists:

```js
${entries.map(entry => `<div class="ec">${renderEntryCard(entry)}</div>`).join("")}
```

## Icons

Always use the icon helper, never hardcode SVGs:

```js
import { icon } from "../utils/icons.js";
// Usage in template:
${icon("star")}
${icon("edit", 16)}  // with custom size
```
