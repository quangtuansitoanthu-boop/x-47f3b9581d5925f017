/** Handle Escape inside a reader panel before the outer reader closes. */
export function readerPanelKeyboard(node: HTMLElement, close: () => void | boolean) {
  const keydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (close() === false) return;
    event.preventDefault();
    event.stopPropagation();
  };
  node.addEventListener('keydown', keydown);
  return { destroy: () => node.removeEventListener('keydown', keydown) };
}
