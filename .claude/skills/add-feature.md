---
description: End-to-end guide for adding a new feature to the PKT app (store, component, CSS, wiring)
user_invocable: true
---

# Add New Feature (End-to-End)

Follow these steps in order when adding a complete new feature:

## Step 1: Plan the Data Model

Define what data the feature needs in `js/store/store.js`:
- What fields does the new data have?
- Does it extend existing entries or need a new collection?
- What CRUD operations are needed?

## Step 2: Add Store Functions

In `js/store/store.js`:

```js
/**
 * Description of the new function.
 * @param {type} param - description
 * @returns {type}
 */
export function newFeatureAction(param) {
  // 1. Validate / find data
  // 2. Mutate _db
  // 3. persist()
  // 4. emit(Events.RELEVANT_EVENT, data)
  // 5. emit(Events.ENTRIES_CHANGED) // if entries changed
  return result;
}
```

If new events are needed, add them to `js/store/event-bus.js`:
```js
export const Events = {
  // ... existing events
  NEW_EVENT: "NEW_EVENT",
};
```

## Step 3: Create the Component

Create `js/components/{feature-name}.js`:
- Export `render{FeatureName}(container, data, callbacks)`
- Use HTML template literals with `container.innerHTML`
- Use `data-action` attributes for interactivity
- Use `esc()` for user text, `icon()` for SVGs
- All code in English

## Step 4: Add Styles

Add CSS to appropriate file or create `css/{feature-name}.css`:
- Use ONLY design tokens from `css/variables.css`
- Follow BEM-like naming (`.fn`, `.fn-element`, `.fn--modifier`)
- Add responsive rules in `css/responsive.css`
- If new file: add `<link>` to `index.html` before `responsive.css`

## Step 5: Wire Up in app.js

```js
// 1. Import the component
import { renderFeatureName } from "./components/{feature-name}.js";

// 2. Add to navigation if it's a new view
const VIEW_TITLES = {
  // ...existing
  "feature-name": "Feature Name",
};

// 3. Add render branch in render() function
if (currentView === "feature-name") {
  renderFeatureName(pageContent, getData(), callbacks);
}

// 4. Add event delegation for actions
on(document, "click", "[data-action='feature-action']", (e, el) => {
  handleFeatureAction(el.dataset.entryId);
});
```

## Step 6: Update Sidebar (if new view)

In `js/components/sidebar.js`, add the navigation item:
```js
{ view: "feature-name", label: "Feature Name", icon: "icon-name" }
```

## Step 7: Verification Checklist

- [ ] All variable/function names are in English
- [ ] All CSS uses design tokens (zero hardcoded values)
- [ ] Store functions follow persist + emit pattern
- [ ] Event delegation used (not direct listeners on dynamic elements)
- [ ] `esc()` used for all user-provided text in templates
- [ ] Works on mobile (test at 375px width)
- [ ] Visual style matches existing components (spacing, colors, radius)
- [ ] Dev mode works with localStorage
- [ ] No external dependencies introduced
