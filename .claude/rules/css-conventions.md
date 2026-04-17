---
description: CSS styling rules following shadcn/ui design system with consistent design tokens
globs: ["css/**/*.css"]
---

# CSS Conventions — shadcn/ui Design System

## Design Tokens (MANDATORY)

All styling must use CSS custom properties from `css/variables.css`. Never hardcode values.

### Colors
```css
/* Correct */
color: hsl(var(--foreground));
background: hsl(var(--card));
border-color: hsl(var(--border));

/* WRONG — never hardcode colors */
color: #1a1a1a;
background: white;
border-color: #e5e5e5;
```

### Semantic Color Tokens
| Token                    | Usage                           |
|--------------------------|---------------------------------|
| `--background`           | Page background                 |
| `--foreground`           | Primary text                    |
| `--card` / `--card-foreground` | Card surfaces             |
| `--primary` / `--primary-foreground` | Primary buttons, accents |
| `--secondary`            | Secondary buttons, subtle bg    |
| `--muted` / `--muted-foreground` | Disabled, placeholder    |
| `--accent`               | Hover states, highlights        |
| `--destructive`          | Delete, error, danger           |
| `--border`               | All borders                     |
| `--input`                | Input borders                   |
| `--ring`                 | Focus rings                     |
| `--color-link/note/thought/quote` | Entry type colors       |
| `--color-star`           | Star/favorite accent            |

### Spacing
Use `var(--space-*)` tokens (4px base scale):
```css
padding: var(--space-3) var(--space-4);  /* 12px 16px */
gap: var(--space-2);                      /* 8px */
margin-bottom: var(--space-6);            /* 24px */
```

### Border Radius
```css
border-radius: var(--radius-md);   /* Standard cards, inputs */
border-radius: var(--radius-sm);   /* Small elements, tags */
border-radius: var(--radius-lg);   /* Modals, large cards */
border-radius: var(--radius-full); /* Circular elements */
```

### Shadows
```css
box-shadow: var(--shadow-xs);   /* Subtle elevation */
box-shadow: var(--shadow-sm);   /* Cards */
box-shadow: var(--shadow-md);   /* Dropdowns, popovers */
box-shadow: var(--shadow-lg);   /* Modals */
```

### Transitions
```css
transition: all var(--transition-fast);  /* 150ms — hover, focus */
transition: all var(--transition-base);  /* 200ms — standard */
transition: all var(--transition-slow);  /* 300ms — modals, drawers */
```

### Z-Index Scale
```css
z-index: var(--z-dropdown);        /* 50  */
z-index: var(--z-sticky);          /* 100 */
z-index: var(--z-modal-backdrop);  /* 200 */
z-index: var(--z-modal);           /* 210 */
z-index: var(--z-toast);           /* 300 */
```

## Typography
```css
font-family: var(--font-sans);    /* Inter — UI text */
font-family: var(--font-mono);    /* JetBrains Mono — code */
font-size: var(--text-sm);        /* 0.875rem */
font-weight: var(--font-medium);  /* 500 */
line-height: var(--leading-normal); /* 1.5 */
```

## CSS File Organization

Each file covers one concern. When adding styles:
- **Layout changes** → `layout.css`
- **Buttons, badges, tags, inputs** → `components.css`
- **Form elements** → `forms.css`
- **Modals, dialogs** → `modal.css`
- **Timeline, entry cards** → `timeline.css`
- **Search-specific** → `search.css`
- **Review-specific** → `review.css`
- **Mobile breakpoints** → `responsive.css`
- **New feature** → Create a new `feature-name.css` and import in `index.html`

## Responsive Design

Mobile-first approach. Breakpoints from `responsive.css`:
```css
@media (max-width: 768px)  { /* tablet */ }
@media (max-width: 480px)  { /* phone */ }
```

All new UI must be tested at mobile widths. Use flexible layouts (flexbox/grid) and avoid fixed widths.

## BEM-like Class Naming

```css
.entry-card { }           /* Block */
.entry-card-title { }     /* Element */
.entry-card--link { }     /* Modifier */
```

Short prefixes are acceptable for frequently used blocks: `.ec` (entry card), `.fb` (filter bar).
