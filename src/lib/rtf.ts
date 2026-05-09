/**
 * Word-compatible RTF generation.
 *
 * Word, LibreOffice, and Pages all open Rich Text Format natively. We
 * emit a minimal RTF 1.0 document (UTF-16 escapes via \uN) so authors
 * can hand a properly-formatted contract / akt to a client without us
 * pulling in the 800kb `docx` dependency.
 */

function escapeRtf(text: string): string {
  // RFC 1.0: backslash, braces, and unicode > 127 escape via \uN?
  // The `?` is a fallback char Word renders if it can't find the unicode glyph.
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code === 0x5c) {
      out += '\\\\';
    } else if (code === 0x7b) {
      out += '\\{';
    } else if (code === 0x7d) {
      out += '\\}';
    } else if (code === 0x0a) {
      out += '\\par\n';
    } else if (code === 0x0d) {
      // ignore — \par handles paragraph breaks
    } else if (code < 128) {
      out += ch;
    } else if (code <= 0xffff) {
      // Signed 16-bit: Word reads negative as wrap-around
      const signed = code > 32767 ? code - 65536 : code;
      out += `\\u${signed}?`;
    } else {
      // Surrogate pair for code points > U+FFFF
      const high = 0xd800 + ((code - 0x10000) >> 10);
      const low = 0xdc00 + ((code - 0x10000) & 0x3ff);
      out += `\\u${high - 65536}?\\u${low - 65536}?`;
    }
  }
  return out;
}

export function buildRtf(opts: { title: string; body: string; firmName?: string }): string {
  const header =
    '{\\rtf1\\ansi\\ansicpg65001\\deff0' +
    '{\\fonttbl{\\f0\\fnil\\fcharset0 Helvetica;}{\\f1\\fnil\\fcharset0 Arial;}}' +
    '\\f0\\fs22\\sa120 ';
  const titleBlock =
    `{\\b\\fs32 ${escapeRtf(opts.title)}\\par}` +
    (opts.firmName ? `{\\fs18\\i ${escapeRtf(opts.firmName)}\\par}` : '') +
    '\\par';
  const bodyBlock = escapeRtf(opts.body);
  return header + titleBlock + bodyBlock + '}';
}

export function downloadRtf(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/rtf;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.rtf') ? filename : `${filename}.rtf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
