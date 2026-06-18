import type { ReactNode } from "react";

// Detects http(s):// URLs in free-form text and turns them into clickable
// links. Used wherever the bandleader pastes a Drive folder, a Dropbox
// link, a Maps pin, an input-list doc, etc. into a notes / update
// message field — without it, the URL renders as plain text and the
// musician has to copy-paste from the gig sheet on their phone.
//
// Pure-text fallback (when no URLs match) is the original string,
// React-rendered, so whitespace-pre-wrap on the parent still respects
// newlines. URLs render as <a target="_blank" rel="noreferrer noopener">
// with break-all so long Drive URLs wrap inside narrow gig-sheet columns
// instead of overflowing.
export function Linkify({ text }: { text: string | null | undefined }) {
  if (!text) return null;

  // Trailing punctuation (. , ; : ! ? ) ]) gets pulled OUT of the URL so
  // "see the doc at https://example.com/foo." doesn't link to a URL with
  // a period at the end.
  const URL_RE = /(https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]])/g;
  const parts: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(
        <span key={key++}>{text.slice(lastIdx, match.index)}</span>,
      );
    }
    const url = match[0];
    parts.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
      >
        {url}
      </a>,
    );
    lastIdx = match.index + url.length;
  }
  if (lastIdx < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIdx)}</span>);
  }
  return <>{parts}</>;
}
