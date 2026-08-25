import { h } from "../dom";

/**
 * The LCARS framework ships its own `.accordion` / `.accordion-content` rules
 * (display:flex on the wrapper, max-height:0 on the body). Using those class
 * names here collapsed our panels to a sliver, so this component owns the
 * `disc-*` namespace instead and reproduces the framework's pill styling in
 * app.css.
 */
export interface Accordion {
  root: HTMLElement;
  headerEl: HTMLButtonElement;
  contentEl: HTMLElement;
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

export function createAccordion(options: {
  header: string | HTMLElement;
  initiallyOpen?: boolean;
  panelClass?: string;
  onToggle?: (open: boolean) => void;
}): Accordion {
  const root = h("div", { className: "disc" });
  const headerBtn = h(
    "button",
    { className: "disc-header", type: "button", "aria-expanded": "false" },
    typeof options.header === "string" ? document.createTextNode(options.header) : options.header,
  );
  const contentEl = h("div", {
    className: options.panelClass ? `disc-panel ${options.panelClass}` : "disc-panel",
  });
  root.appendChild(headerBtn);
  root.appendChild(contentEl);

  let open = options.initiallyOpen ?? false;

  function applyState(): void {
    root.classList.toggle("disc--open", open);
    headerBtn.setAttribute("aria-expanded", String(open));
  }

  function setOpen(value: boolean): void {
    if (open === value) return;
    open = value;
    applyState();
    options.onToggle?.(open);
  }

  headerBtn.addEventListener("click", () => {
    setOpen(!open);
  });

  applyState();

  return {
    root,
    headerEl: headerBtn,
    contentEl,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
  };
}
