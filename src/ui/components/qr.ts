import { h } from "../dom";

/**
 * The transport coordinates (voice plan §3.3): a QR code carrying the join
 * link. Nothing in this app reads a QR code — the player points their phone's
 * own camera at the host's screen and the link opens in their browser, room
 * code already in the query string.
 *
 * The encoding comes from `qrcode-generator`; only the painting is ours, so the
 * code can wear the LCARS palette without any of the geometry being guesswork.
 *
 * Deliberately *not* inverted. LCARS wants light-on-black, but decoders expect
 * dark modules on a light field and many refuse the inverse — so the code sits
 * on an almond-creme LCARS panel instead, which reads as in-world and still
 * scans off a projector.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Four modules of quiet zone is the minimum the QR spec allows. */
const QUIET_ZONE = 4;

/** Level Q survives a phone photographing a projected screen at an angle. */
const ERROR_CORRECTION = "Q";

/**
 * Most of `qrcode-generator`'s weight is a Shift-JIS table for Kanji mode that a
 * plain ASCII URL never touches — and only the host lobby ever draws a code, so
 * it loads on demand rather than riding along in the main bundle.
 */
type QrFactory = typeof import("qrcode-generator");

let encoder: Promise<QrFactory> | null = null;

function loadEncoder(): Promise<QrFactory> {
  // The package declares `export =` but ships an ESM build with a default
  // export, so the runtime shape is one level deeper than the types say.
  encoder ??= import("qrcode-generator").then(
    (module) => (module as unknown as { default: QrFactory }).default,
  );
  return encoder;
}

export function createQrCode(qrcode: QrFactory, text: string): SVGSVGElement {
  const qr = qrcode(0, ERROR_CORRECTION);
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const span = count + QUIET_ZONE * 2;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${span} ${span}`);
  svg.setAttribute("class", "qr-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Join code");
  svg.setAttribute("shape-rendering", "crispEdges");

  svg.appendChild(rect(0, 0, span, span, 0, "qr-field"));

  const origins: Array<[number, number]> = [
    [0, 0],
    [0, count - 7],
    [count - 7, 0],
  ];

  for (const [row, col] of origins) {
    // The real finder geometry: a one-module ring around a 3×3 core. Drawing it
    // as its own shape is what lets the body modules be rounded without the
    // decoder losing its alignment targets.
    const ring = rect(col + QUIET_ZONE + 0.5, row + QUIET_ZONE + 0.5, 6, 6, 1.4, "qr-finder");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke-width", "1");
    svg.appendChild(ring);
    svg.appendChild(rect(col + QUIET_ZONE + 2, row + QUIET_ZONE + 2, 3, 3, 0.7, "qr-finder-core"));
  }

  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col) || isFinder(row, col, count)) continue;
      svg.appendChild(rect(col + QUIET_ZONE, row + QUIET_ZONE, 1, 1, 0.28, "qr-module"));
    }
  }

  return svg;
}

/**
 * The framed panel the code sits in. Callers cap it themselves and supply their
 * own caption, since on the host screen that caption doubles as the room-name
 * editor.
 */
export function createQrFrame(url: string): HTMLElement {
  const frame = h("div", { className: "qr-frame" });

  void loadEncoder()
    .then((qrcode) => frame.appendChild(createQrCode(qrcode, url)))
    .catch(() => {
      // The caption still carries the designation, so a failed encoder leaves
      // the room joinable by typing the code in by hand.
      frame.hidden = true;
    });

  return frame;
}

function isFinder(row: number, col: number, count: number): boolean {
  const near = (value: number) => value < 7;
  const far = (value: number) => value >= count - 7;
  return (
    (near(row) && near(col)) || (near(row) && far(col)) || (far(row) && near(col))
  );
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  className: string,
): SVGRectElement {
  const element = document.createElementNS(SVG_NS, "rect");
  element.setAttribute("x", String(x));
  element.setAttribute("y", String(y));
  element.setAttribute("width", String(width));
  element.setAttribute("height", String(height));
  if (radius > 0) {
    element.setAttribute("rx", String(radius));
    element.setAttribute("ry", String(radius));
  }
  element.setAttribute("class", className);
  return element;
}
