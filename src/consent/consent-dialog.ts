import { Logger } from "../utils/logger";

/**
 * A self-contained, TV-remote-navigable consent modal.
 *
 * Built with plain DOM so it has zero dependencies and works on old WebKit.
 * Two focusable buttons; LEFT/RIGHT move focus, ENTER activates, BACK/RETURN
 * (Tizen remote key 10009) declines. Big text + high contrast for 10-foot UI.
 *
 * Resolves true (accepted) / false (declined). The caller persists the choice.
 */

export interface ConsentDialogOptions {
  /** App-specific incentive line, e.g. "Support this app by sharing unused bandwidth." */
  incentive?: string;
  acceptText?: string;
  declineText?: string;
  title?: string;
}

const RETURN_KEYCODES = [10009, 27]; // Tizen BACK / RETURN, plus Esc on emulator

export function showConsentDialog(
  options: ConsentDialogOptions = {}
): Promise<boolean> {
  const incentive =
    options.incentive ||
    "Help support this app by sharing a small amount of your unused internet bandwidth. We never collect personal data, and you can change this anytime.";
  const title = options.title || "Support this app";
  const acceptText = options.acceptText || "Yes, I'll help";
  const declineText = options.declineText || "Not now";

  return new Promise<boolean>((resolve) => {
    if (typeof document === "undefined" || !document.body) {
      Logger.warn("[ConsentDialog] no DOM available; defaulting to declined");
      resolve(false);
      return;
    }

    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "left:0;top:0;right:0;bottom:0",
      "background:rgba(0,0,0,0.75)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "z-index:2147483647",
      "font-family:Arial,Helvetica,sans-serif",
    ].join(";");

    const card = document.createElement("div");
    card.style.cssText = [
      "background:#1c1c1e",
      "color:#fff",
      "max-width:60%",
      "padding:48px",
      "border-radius:16px",
      "text-align:center",
      "box-shadow:0 8px 40px rgba(0,0,0,0.6)",
    ].join(";");

    const h = document.createElement("h1");
    h.textContent = title;
    h.style.cssText = "font-size:42px;margin:0 0 24px 0;";

    const p = document.createElement("p");
    p.textContent = incentive;
    p.style.cssText = "font-size:26px;line-height:1.5;margin:0 0 40px 0;color:#d0d0d2;";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:24px;justify-content:center;";

    const buttons: HTMLButtonElement[] = [];
    let focusIndex = 0;

    function makeButton(label: string, primary: boolean): HTMLButtonElement {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = [
        "font-size:28px",
        "padding:18px 40px",
        "border:3px solid transparent",
        "border-radius:12px",
        "cursor:pointer",
        primary ? "background:#0a84ff;color:#fff" : "background:#3a3a3c;color:#fff",
        "outline:none",
        "min-width:220px",
      ].join(";");
      return b;
    }

    const declineBtn = makeButton(declineText, false);
    const acceptBtn = makeButton(acceptText, true);
    buttons.push(declineBtn, acceptBtn);
    focusIndex = 1; // default focus on accept

    function paintFocus(): void {
      buttons.forEach((b, i) => {
        b.style.borderColor = i === focusIndex ? "#ffffff" : "transparent";
        b.style.transform = i === focusIndex ? "scale(1.06)" : "scale(1.0)";
      });
    }

    let settled = false;
    function cleanup(): void {
      document.removeEventListener("keydown", onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function finish(result: boolean): void {
      if (settled) return;
      settled = true;
      cleanup();
      Logger.info("[ConsentDialog] result:", result);
      resolve(result);
    }

    function onKey(e: KeyboardEvent): void {
      const code = e.keyCode;
      if (RETURN_KEYCODES.indexOf(code) !== -1) {
        e.preventDefault();
        finish(false);
        return;
      }
      switch (code) {
        case 37: // LEFT
          focusIndex = Math.max(0, focusIndex - 1);
          paintFocus();
          e.preventDefault();
          break;
        case 39: // RIGHT
          focusIndex = Math.min(buttons.length - 1, focusIndex + 1);
          paintFocus();
          e.preventDefault();
          break;
        case 13: // ENTER / OK
          e.preventDefault();
          finish(focusIndex === 1);
          break;
        default:
          break;
      }
    }

    acceptBtn.addEventListener("click", () => finish(true));
    declineBtn.addEventListener("click", () => finish(false));

    row.appendChild(declineBtn);
    row.appendChild(acceptBtn);
    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(row);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.addEventListener("keydown", onKey, true);
    paintFocus();
  });
}
