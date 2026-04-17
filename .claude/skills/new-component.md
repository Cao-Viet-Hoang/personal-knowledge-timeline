---
description: Scaffold a new UI component following PKT project patterns (vanilla JS render function + CSS)
user_invocable: true
---

# Create New Component

When the user asks to create a new component, follow these steps:

## 1. Gather Information
Ask the user (if not already provided):
- Component name (e.g., "tag-manager", "statistics")
- What data it displays or manages
- What user interactions it supports

## 2. Create the JS Component File

Create `js/components/{component-name}.js` following this exact pattern:

```js
/**
 * {ComponentName} component.
 * {Brief description}.
 */

import { $, on } from "../utils/dom.js";
import { icon } from "../utils/icons.js";

/**
 * Render the {componentName} into the given container.
 * @param {HTMLElement} container
 * @param {object} data
 * @param {object} callbacks
 */
export function render{ComponentName}(container, data, callbacks = {}) {
  container.innerHTML = `
    <div class="{cn}">
      <!-- component content -->
    </div>
  `;
}
```

Rules:
- Export a single `render*` function
- Use `container.innerHTML` for rendering
- Use `data-action` attributes for interactive elements
- Use `esc()` for any user-provided text
- Use `icon()` helper for all SVG icons
- All variable/function names in English
- Use shadcn design tokens for all styles (hsl(var(--primary)), var(--space-4), etc.)

## 3. Add CSS Styles

Add styles to the appropriate existing CSS file (e.g., `css/components.css` for generic UI, or create `css/{component-name}.css` for large components).

All styles must use:
- `hsl(var(--...))` for colors
- `var(--space-*)` for spacing
- `var(--radius-*)` for border-radius
- `var(--shadow-*)` for box-shadow
- `var(--transition-*)` for transitions
- `var(--font-*)` and `var(--text-*)` for typography

If a new CSS file is created, add the `<link>` tag to `index.html`.

## 4. Wire Up in app.js

- Import the render function in `app.js`
- Add it to the appropriate render flow
- Register any event delegation handlers via `on(document, "click", "[data-action='...']", handler)`

## 5. Add Responsive Styles

Add mobile breakpoint styles in `css/responsive.css` if the component has layout that needs to adapt.

## 6. Verify

- Check the component renders correctly in dev mode
- Verify all design tokens are used (no hardcoded values)
- Confirm mobile responsiveness
- Ensure all text in code is in English
