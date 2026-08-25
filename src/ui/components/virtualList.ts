import { h } from "../dom";

export interface VirtualListOptions {
  rowHeight: number;
  overscan?: number;
  renderRow: (item: unknown, index: number) => HTMLElement;
  onItemTap?: (item: unknown, index: number) => void;
}

export class VirtualList {
  private items: unknown[] = [];
  private first = 0;
  private last = -1;
  private raf = 0;
  private readonly spacer: HTMLElement;
  private readonly viewport: HTMLElement;
  private readonly rowHeight: number;
  private readonly overscan: number;
  private readonly renderRow: (item: unknown, index: number) => HTMLElement;
  private readonly onItemTap?: (item: unknown, index: number) => void;
  private readonly resizeObserver: ResizeObserver;

  constructor(viewport: HTMLElement, options: VirtualListOptions) {
    this.viewport = viewport;
    this.rowHeight = options.rowHeight;
    this.overscan = options.overscan ?? 6;
    this.renderRow = options.renderRow;
    this.onItemTap = options.onItemTap;

    viewport.classList.add("vl-viewport");
    this.spacer = h("div", { className: "vl-spacer" });
    viewport.appendChild(this.spacer);

    viewport.addEventListener("scroll", this.requestRender, { passive: true });
    this.spacer.addEventListener("click", this.handleTap);
    this.resizeObserver = new ResizeObserver(this.requestRender);
    this.resizeObserver.observe(viewport);
  }

  setItems(items: unknown[]): void {
    this.items = items;
    this.viewport.scrollTop = 0;
    this.first = 0;
    this.last = -1;
    this.render();
  }

  /** Re-render a single row in place (e.g. after its answer state changed). */
  refresh(index: number): void {
    const existing = this.spacer.querySelector(`[data-index="${index}"]`);
    if (!existing) return;
    existing.replaceWith(this.createRow(this.items[index], index));
  }

  destroy(): void {
    this.viewport.removeEventListener("scroll", this.requestRender);
    this.spacer.removeEventListener("click", this.handleTap);
    this.resizeObserver.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.viewport.classList.remove("vl-viewport");
    this.spacer.remove();
  }

  private requestRender = (): void => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.render();
    });
  };

  private handleTap = (event: Event): void => {
    if (!this.onItemTap) return;
    const target = (event.target as HTMLElement).closest("[data-index]") as HTMLElement | null;
    if (!target) return;
    const index = Number(target.getAttribute("data-index"));
    if (Number.isFinite(index)) this.onItemTap(this.items[index], index);
  };

  private createRow(item: unknown, index: number): HTMLElement {
    const row = this.renderRow(item, index);
    row.setAttribute("data-index", String(index));
    row.classList.add("vl-row");
    row.style.height = `${this.rowHeight}px`;
    row.style.transform = `translateY(${index * this.rowHeight}px)`;
    return row;
  }

  private render(): void {
    const total = this.items.length;
    this.spacer.style.height = `${total * this.rowHeight}px`;
    if (total === 0) {
      this.spacer.replaceChildren();
      this.first = 0;
      this.last = -1;
      return;
    }

    const scrollTop = this.viewport.scrollTop;
    const viewportHeight = this.viewport.clientHeight || 1;
    const first = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.overscan);
    const last = Math.min(total - 1, Math.ceil((scrollTop + viewportHeight) / this.rowHeight) + this.overscan);

    if (first === this.first && last === this.last) return;
    this.first = first;
    this.last = last;

    const rows: HTMLElement[] = [];
    for (let i = first; i <= last; i += 1) {
      rows.push(this.createRow(this.items[i], i));
    }
    this.spacer.replaceChildren(...rows);
  }
}
