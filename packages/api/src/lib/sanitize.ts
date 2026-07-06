import sanitizeHtml from "sanitize-html";

// Used for chat/email message bodies: fairly restrictive, no images/iframes.
export function sanitizeMessageHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["b", "i", "em", "strong", "a", "p", "br", "ul", "ol", "li", "blockquote", "code", "pre"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
    allowedSchemes: ["http", "https", "mailto"],
  }).trim();
}

// Used for knowledge base articles authored via the rich text editor: broader allowlist.
export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "h1", "h2", "h3", "h4", "p", "br", "b", "i", "em", "strong", "u", "s",
      "a", "ul", "ol", "li", "blockquote", "code", "pre", "img", "hr", "table",
      "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
  }).trim();
}

export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, " ")
    .trim();
}
