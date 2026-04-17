/**
 * Lightweight publish/subscribe event bus.
 * Components subscribe to store events to re-render on data changes.
 */

const listeners = new Map();

export function on(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(callback);
  return () => listeners.get(event).delete(callback);
}

export function emit(event, payload) {
  const callbacks = listeners.get(event);
  if (!callbacks) return;
  for (const cb of callbacks) {
    try {
      cb(payload);
    } catch (err) {
      console.error(`[EventBus] Error in listener for "${event}":`, err);
    }
  }
}

export function off(event, callback) {
  const callbacks = listeners.get(event);
  if (callbacks) callbacks.delete(callback);
}

/** All event names used by the store. */
export const Events = {
  ENTRIES_CHANGED: "entries:changed",
  ENTRY_CREATED: "entry:created",
  ENTRY_UPDATED: "entry:updated",
  ENTRY_DELETED: "entry:deleted",
  REFLECTIONS_CHANGED: "reflections:changed",
  FILTERS_CHANGED: "filters:changed",
  VIEW_CHANGED: "view:changed",
};
