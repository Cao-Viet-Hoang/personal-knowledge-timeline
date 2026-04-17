---
description: Enforces English-only code and consistent naming conventions across the project
globs: ["js/**/*.js", "css/**/*.css", "*.html"]
---

# Code Style Rules

## Language
- ALL code must be written in English: variable names, function names, class names, comments, console messages, data attributes, CSS classes.
- No Vietnamese or other non-English text in source code. User-facing UI strings are the only exception.

## JavaScript Naming
- Variables and functions: `camelCase` — `currentView`, `handleSaveEntry`
- Constants: `UPPER_SNAKE_CASE` — `VIEW_TITLES`, `TYPE_LABELS`
- Module-private variables: prefix with underscore — `_db`, `_adapter`
- Event names: `SCREAMING_SNAKE_CASE` — `ENTRIES_CHANGED`, `ENTRY_CREATED`
- IDs: prefix pattern `e_001` (entries), `r_001` (reflections)

## CSS Naming
- Classes use BEM-like convention: `.block`, `.block-element`, `.block--modifier`
- Entry card example: `.ec` (block), `.ec-title` (element), `.ec--link` (modifier)
- Data attributes: `kebab-case` — `data-entry-id`, `data-action`

## File Naming
- All files: `kebab-case` — `entry-card.js`, `local-adapter.js`, `firebase-modal.js`
- CSS files: one concern per file — `timeline.css`, `components.css`, `responsive.css`

## Code Formatting
- Use 2-space indentation
- Use double quotes for HTML attribute values in template literals
- Use template literals (backticks) for multi-line HTML strings
- Always end files with a newline
- Use JSDoc comments for exported functions with `@param` and `@returns`

## General
- No `var` — use `const` by default, `let` only when reassignment is needed
- Prefer `for...of` loops over `.forEach()` for simple iteration
- Use optional chaining (`?.`) and nullish coalescing (`??`) where appropriate
- No `console.log` in production code — use `console.error` for actual errors with `[Module]` prefix
