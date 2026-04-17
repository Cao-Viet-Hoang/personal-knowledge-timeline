/**
 * Minimal, safe Markdown → HTML renderer.
 *
 * Supports the subset that our AI outputs:
 *   - Headings (# .. ######)
 *   - Bold (**text** / __text__) & italic (*text* / _text_)
 *   - Inline code (`code`) & fenced code blocks (``` ... ```)
 *   - Ordered / unordered lists (- * + / 1.)
 *   - Blockquotes (>)
 *   - Horizontal rule (---)
 *   - Links [text](https://...) — http(s) only for safety
 *   - Paragraphs separated by blank lines
 *
 * Output is HTML-safe: all input is escaped first, then markdown tokens
 * are replaced with a small, whitelisted set of tags. There is no raw
 * HTML passthrough, so untrusted AI output is safe to inject via innerHTML.
 */

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(text) {
  // Links first — only http(s) URLs, rel/target locked down
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, label, url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer" class="md-link">${label}</a>`
  );

  // Bold
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");

  // Italic — * and _ (avoid matching inside word for _)
  text = text.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  text = text.replace(/(^|[^\w])_([^_\n]+)_(?=$|[^\w])/g, "$1<em>$2</em>");

  return text;
}

/**
 * Render a Markdown string to safe HTML.
 * @param {string} md
 * @returns {string}
 */
export function renderMarkdown(md) {
  if (!md) return "";

  let text = escapeHtml(md);

  // Protect fenced code blocks so their content is not transformed
  const codeBlocks = [];
  text = text.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre class="md-pre"><code>${code.replace(/\n$/, "")}</code></pre>`);
    return `\u0000CODE${codeBlocks.length - 1}\u0000`;
  });

  // Protect inline code the same way
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    inlineCodes.push(`<code class="md-code">${code}</code>`);
    return `\u0000INLINE${inlineCodes.length - 1}\u0000`;
  });

  const lines = text.split("\n");
  const out = [];
  let i = 0;

  const isBlockStart = (line) =>
    /^#{1,6}\s/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*+]\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^(\*{3,}|-{3,}|_{3,})\s*$/.test(line);

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      out.push(`<hr class="md-hr" />`);
      i++;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level} class="md-h${level}">${renderInline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote class="md-quote">${renderInline(quoteLines.join(" "))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+]\s+/, ""));
        i++;
      }
      out.push(
        `<ul class="md-ul">${items.map((x) => `<li>${renderInline(x)}</li>`).join("")}</ul>`
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      out.push(
        `<ol class="md-ol">${items.map((x) => `<li>${renderInline(x)}</li>`).join("")}</ol>`
      );
      continue;
    }

    // Blank line → paragraph break
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: consume until blank line or next block
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !isBlockStart(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(`<p class="md-p">${renderInline(paraLines.join(" "))}</p>`);
  }

  let html = out.join("");

  // Restore protected tokens
  html = html.replace(/\u0000INLINE(\d+)\u0000/g, (_, idx) => inlineCodes[+idx]);
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeBlocks[+idx]);

  return html;
}
