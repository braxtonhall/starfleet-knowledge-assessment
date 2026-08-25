import { h } from "./dom";

/**
 * Section header (plan §6.4). A full-width `.lcars-text-bar` rather than an
 * `h1` — the banner already carries the program name, and the bar costs a
 * fraction of the vertical space a second giant heading would.
 */
export function screenHeading(text: string): HTMLElement {
  return h("div", { className: "lcars-text-bar screen-heading" }, h("h2", { textContent: text }));
}

const DEFAULT_BANNER = document.getElementById("banner")?.textContent ?? "";

/**
 * The banner is the largest text on screen and the only element visible from
 * every scroll position, which makes it the one place a player's designation
 * can live "at all times". On a player device it therefore carries the name
 * instead of the program title — the title is on the host's screen anyway, and
 * a player who has forgotten which name is theirs cannot read the roster.
 *
 * Passing `null` restores the program title.
 */
export function setBanner(name: string | null): void {
  const banner = document.getElementById("banner");
  if (!banner) return;
  banner.textContent = name && name !== "" ? name : DEFAULT_BANNER;
  banner.classList.toggle("banner--designation", Boolean(name));
}

/**
 * Pull the content row (`#gap`) up to the top of the viewport. Everything above
 * it — banner, data cascade, status readouts — is ornament, so parking there
 * wastes a screenful. The row's top margin stays visible because that gap is
 * part of the LCARS frame.
 *
 * Only ever scrolls *up*: if the viewport already sits at or above the content
 * row, the header is left on screen rather than being yanked out of view.
 */
export function scrollToContentTop(): void {
  const gap = document.getElementById("gap");
  if (!gap) return;

  const marginTop = Number.parseFloat(getComputedStyle(gap).marginTop) || 0;
  const target = Math.max(0, gap.getBoundingClientRect().top + window.scrollY - marginTop);
  if (window.scrollY > target) {
    // `auto` defers to classic.css's global `scroll-behavior: smooth`, so the
    // jump animates. Intentional — don't force instant here.
    window.scrollTo({ top: target, behavior: "auto" });
  }
}

let enabled = true;

export function setSoundEnabled(value: boolean): void {
  enabled = value;
}

function play(audioId: string): void {
  if (!enabled) return;
  const element = document.getElementById(audioId);
  if (element instanceof HTMLAudioElement) {
    element.currentTime = 0;
    void element.play().catch(() => {});
  }
}

export function beepTap(): void {
  play("audio2");
}

export function beepCorrect(): void {
  play("audio3");
}

export function beepIncorrect(): void {
  play("audio4");
}
