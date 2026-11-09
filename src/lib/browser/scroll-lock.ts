const owners = new Set<symbol>();
let restoreOverflow: Array<() => void> = [];

function lockOverflow(style: CSSStyleDeclaration): () => void {
  const properties = ['overflow', 'overflow-x', 'overflow-y'];
  if (typeof style.getPropertyValue === 'function') {
    const previous = properties.map((property) => ({
      property,
      value: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property),
    }));
    style.setProperty('overflow', 'hidden', 'important');
    return () => {
      for (const property of properties) style.removeProperty(property);
      for (const { property, value, priority } of previous) {
        if (value) style.setProperty(property, value, priority);
      }
    };
  }
  const previous = style.overflow;
  style.overflow = 'hidden';
  return () => { style.overflow = previous; };
}

/** Each caller releases only its own lock, regardless of teardown order. */
export function acquireScrollLock(): () => void {
  if (typeof document === 'undefined') return () => {};
  const owner = Symbol();
  if (!owners.size) {
    restoreOverflow = [document.body, document.documentElement]
      .filter((element): element is HTMLElement => Boolean(element))
      .map((element) => lockOverflow(element.style));
  }
  owners.add(owner);
  return () => {
    if (!owners.delete(owner)) return;
    if (!owners.size) {
      for (const restore of restoreOverflow) restore();
      restoreOverflow = [];
    }
  };
}
