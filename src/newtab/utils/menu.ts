const menuListeners = new Set<() => void>();

export function subscribeToMenuClose(listener: () => void): () => void {
  menuListeners.add(listener);
  return () => menuListeners.delete(listener);
}

export function notifyMenuOpened(): void {
  menuListeners.forEach((listener) => listener());
}
