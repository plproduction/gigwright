// Bulletproof copy-to-clipboard with a legacy fallback. The modern
// navigator.clipboard.writeText() API works in most modern browsers
// over HTTPS, but silently fails in a handful of environments (Safari
// with strict site permissions, in-app browsers, iframes without
// clipboard-write permission, etc.). When that happens we fall back
// to the old document.execCommand("copy") pattern — which works
// synchronously off a user gesture in every browser that ships.
//
// Returns true if the copy succeeded, false if BOTH paths failed.
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    // Off-screen but focusable — needed for execCommand("copy") to
    // find selected text on iOS Safari + some Android browsers.
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    ta.setAttribute("readonly", "");
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
