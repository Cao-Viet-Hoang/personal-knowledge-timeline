/**
 * DOM utility helpers.
 * Provides shorthand functions for common DOM operations.
 */

export function $(selector, parent = document) {
  return parent.querySelector(selector);
}

export function $$(selector, parent = document) {
  return [...parent.querySelectorAll(selector)];
}

export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") {
      el.className = value;
    } else if (key === "dataset") {
      for (const [dataKey, dataVal] of Object.entries(value)) {
        el.dataset[dataKey] = dataVal;
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      const event = key.slice(2).toLowerCase();
      el.addEventListener(event, value);
    } else if (key === "innerHTML") {
      el.innerHTML = value;
    } else if (key === "textContent") {
      el.textContent = value;
    } else {
      el.setAttribute(key, value);
    }
  }

  for (const child of children) {
    if (typeof child === "string") {
      el.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      el.appendChild(child);
    }
  }

  return el;
}

export function html(strings, ...values) {
  const template = document.createElement("template");
  template.innerHTML = String.raw(strings, ...values).trim();
  return template.content.firstChild;
}

export function on(target, event, selector, handler) {
  if (typeof selector === "function") {
    handler = selector;
    target.addEventListener(event, handler);
    return () => target.removeEventListener(event, handler);
  }

  const delegated = (e) => {
    const el = e.target.closest(selector);
    if (el && target.contains(el)) {
      handler.call(el, e, el);
    }
  };

  target.addEventListener(event, delegated);
  return () => target.removeEventListener(event, delegated);
}

export function show(el) {
  el.classList.remove("hidden");
}

export function hide(el) {
  el.classList.add("hidden");
}

export function toggle(el, force) {
  el.classList.toggle("hidden", force !== undefined ? !force : undefined);
}
