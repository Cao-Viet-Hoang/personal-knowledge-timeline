---
description: Create a new CSS module file following the shadcn/ui design token system
user_invocable: true
---

# Create New CSS Module

When the user needs a new CSS file for a feature or section:

## 1. Create the File

Create `css/{feature-name}.css` with this structure:

```css
/* ============================================
   {Feature Name} Styles
   ============================================ */

.{feature-prefix} {
  /* Use design tokens from variables.css */
  background: hsl(var(--card));
  color: hsl(var(--card-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: var(--radius-md);
  padding: var(--space-4);
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-base);
}
```

## 2. Design Token Checklist

Before writing any CSS, verify you're using tokens for ALL of these:

- [ ] Colors → `hsl(var(--background))`, `hsl(var(--primary))`, etc.
- [ ] Spacing → `var(--space-1)` through `var(--space-16)`
- [ ] Radius → `var(--radius-sm)` through `var(--radius-full)`
- [ ] Shadows → `var(--shadow-xs)` through `var(--shadow-lg)`
- [ ] Font sizes → `var(--text-xs)` through `var(--text-3xl)`
- [ ] Font weights → `var(--font-normal)` through `var(--font-bold)`
- [ ] Transitions → `var(--transition-fast/base/slow)`
- [ ] Z-index → `var(--z-dropdown/sticky/modal-backdrop/modal/toast)`

**Zero hardcoded values allowed.** No `#hex`, no `rgb()`, no `12px`, no `0.5rem` — only tokens.

## 3. Import in index.html

Add the link tag in `index.html`, maintaining the existing order:
```html
<!-- After the last CSS import, before </head> -->
<link rel="stylesheet" href="css/{feature-name}.css">
```

Place it in logical order:
1. variables.css (tokens)
2. base.css (resets)
3. utilities.css
4. layout.css
5. components.css
6. forms.css
7. modal.css
8. Feature-specific files (timeline, search, review, **new file here**)
9. responsive.css (always last)

## 4. Add Responsive Rules

Add mobile-specific overrides in `css/responsive.css` under the appropriate breakpoint:

```css
@media (max-width: 768px) {
  .{feature-prefix} {
    padding: var(--space-3);
  }
}
```

## 5. Naming Convention

Follow BEM-like pattern consistent with existing code:
- Block: `.feature-name` or short prefix `.fn`
- Element: `.feature-name-title`, `.fn-title`
- Modifier: `.feature-name--variant`, `.fn--active`

## 6. Consistency Check

Compare the new styles against:
- `css/components.css` — for button, badge, tag, input patterns
- `css/timeline.css` — for card layout patterns
- `css/modal.css` — for overlay patterns

Match padding, gaps, font sizes, and visual hierarchy of similar elements.
