export function element<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing comments element: ${selector}`);
  return node;
}

export function cloneTemplate(root: ParentNode, selector: string): HTMLElement {
  const template = element<HTMLTemplateElement>(root, selector);
  const node = template.content.firstElementChild?.cloneNode(true);
  if (!(node instanceof HTMLElement)) throw new Error(`Empty comments template: ${selector}`);
  return node;
}
