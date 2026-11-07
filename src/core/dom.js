const PROPERTIES = new Set(['value', 'checked', 'selected']);

const kebab = (name) => (name.startsWith('--') ? name : name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));


function appendChildren(el, children) {
  for (const child of children) {
    if (child == null || typeof child === 'boolean') continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else el.append(typeof child === 'object' ? child : String(child));
  }
}

export function h(tag, attrs = {}, ...children) {
  const el = globalThis.document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (name.startsWith('on') && typeof value === 'function') {
      el.addEventListener(name.slice(2).toLowerCase(), value);
    } else if (name === 'class') {
      el.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
    } else if (name === 'style') {
      if (typeof value === 'string') el.style.cssText = value;
      else for (const [prop, v] of Object.entries(value)) if (v != null) el.style.setProperty(kebab(prop), String(v));
    } else if (PROPERTIES.has(name)) {
      (el)[name] = value;
    } else {
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }
  appendChildren(el, children);
  return el;
}
