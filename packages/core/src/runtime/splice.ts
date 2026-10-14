/**
 * Runtime side of fragment composition.
 *
 * `{name}` slots in a query text are replaced by the fragment's text; the fragment's
 * `$n` placeholders are renumbered to follow the parameters already present, and its
 * values are appended. Renumbering skips string literals, quoted identifiers,
 * dollar-quoted strings and comments so `'$1'` inside a literal is left alone.
 */

export interface Spliceable {
  readonly text: string;
  readonly values: readonly unknown[];
}

export type SlotValues = { readonly [name: string]: Spliceable };

const SLOT = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Highest `$n` in `text` (0 if none), skipping literals and comments. */
export function maxParam(text: string): number {
  let max = 0;
  scan(text, (n) => {
    if (n > max) max = n;
    return null;
  });
  return max;
}

/** Add `offset` to every `$n` outside literals/comments. */
export function renumberParams(text: string, offset: number): string {
  if (offset === 0) return text;
  return scan(text, (n) => `$${n + offset}`);
}

/**
 * Walk `text`; for every `$n` placeholder call `onParam(n)`. If it returns a string,
 * that string replaces the placeholder in the returned text.
 */
function scan(text: string, onParam: (n: number) => string | null): string {
  let out = "";
  let i = 0;
  const len = text.length;
  while (i < len) {
    const c = text[i]!;
    if (c === "'" || c === '"') {
      // quoted string / identifier with doubled-quote escapes
      let j = i + 1;
      while (j < len) {
        if (text[j] === c) {
          if (text[j + 1] === c) { j += 2; continue; }
          break;
        }
        j++;
      }
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "-" && text[i + 1] === "-") {
      const j = text.indexOf("\n", i);
      const end = j === -1 ? len : j;
      out += text.slice(i, end);
      i = end;
    } else if (c === "/" && text[i + 1] === "*") {
      const j = text.indexOf("*/", i + 2);
      const end = j === -1 ? len : j + 2;
      out += text.slice(i, end);
      i = end;
    } else if (c === "$") {
      const m = /^\$(\d+)/.exec(text.slice(i));
      if (m) {
        const n = Number(m[1]);
        const rep = onParam(n);
        out += rep ?? m[0];
        i += m[0].length;
      } else {
        // dollar-quoted string: $tag$ ... $tag$
        const dq = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i));
        if (dq) {
          const close = text.indexOf(dq[0], i + dq[0].length);
          const end = close === -1 ? len : close + dq[0].length;
          out += text.slice(i, end);
          i = end;
        } else {
          out += c;
          i++;
        }
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * Replace `{name}` slots with the fragments' texts (renumbered) and return the combined
 * text and values. Outer `values` come first; fragment values follow in order of
 * appearance. Unknown slots throw.
 */
export function splice(text: string, slots: SlotValues, values: readonly unknown[]): { text: string; values: unknown[] } {
  let offset = Math.max(maxParam(text), values.length);
  const allValues: unknown[] = [...values];
  const out = text.replace(SLOT, (_m, name: string) => {
    const frag = slots[name];
    if (frag === undefined) throw new Error(`typesql: unknown fragment slot {${name}}`);
    const renumbered = renumberParams(frag.text, offset);
    offset += frag.values.length;
    allValues.push(...frag.values);
    return renumbered;
  });
  return { text: out, values: allValues };
}

/**
 * Rewrite `:name` parameters to `$k` (first-appearance order) outside literals/comments,
 * skipping `::` casts and `:=`. Returns the new text and the ordered names.
 */
export function rewriteNamed(text: string): { text: string; names: string[] } {
  const names: string[] = [];
  let out = "";
  let i = 0;
  const len = text.length;
  const skipLiteral = (): boolean => {
    const c = text[i]!;
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < len) {
        if (text[j] === c) { if (text[j + 1] === c) { j += 2; continue; } break; }
        j++;
      }
      out += text.slice(i, j + 1); i = j + 1; return true;
    }
    if (c === "-" && text[i + 1] === "-") { const j = text.indexOf("\n", i); const end = j === -1 ? len : j; out += text.slice(i, end); i = end; return true; }
    if (c === "/" && text[i + 1] === "*") { const j = text.indexOf("*/", i + 2); const end = j === -1 ? len : j + 2; out += text.slice(i, end); i = end; return true; }
    if (c === "$") {
      const dq = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i));
      if (dq) { const close = text.indexOf(dq[0], i + dq[0].length); const end = close === -1 ? len : close + dq[0].length; out += text.slice(i, end); i = end; return true; }
    }
    return false;
  };
  while (i < len) {
    if (skipLiteral()) continue;
    const c = text[i]!;
    if (c === ":") {
      if (text[i + 1] === ":" ) { out += "::"; i += 2; continue; }
      if (text[i - 1] === ":") { out += c; i++; continue; }
      const m = /^:([A-Za-z_][A-Za-z0-9_]*)/.exec(text.slice(i));
      if (m) {
        const name = m[1]!;
        let k = names.indexOf(name);
        if (k === -1) { names.push(name); k = names.length - 1; }
        out += `$${k + 1}`;
        i += m[0].length;
        continue;
      }
    }
    out += c; i++;
  }
  return { text: out, names };
}

/** Does the text contain at least one `{name}` slot? */
export function hasSlots(text: string): boolean {
  SLOT.lastIndex = 0;
  return SLOT.test(text);
}

/** Quote an identifier (or dotted path) the Postgres way: `"a"."b"`, doubling embedded quotes. */
export function quoteIdent(...parts: readonly string[]): string {
  return parts.map((p) => `"${p.replace(/"/g, '""')}"`).join(".");
}

/** Join fragments with a separator, renumbering parameters left to right. */
export function joinFragments(items: readonly Spliceable[], separator: string): { text: string; values: unknown[] } {
  let text = "";
  const values: unknown[] = [];
  items.forEach((f, idx) => {
    if (idx > 0) text += separator;
    text += renumberParams(f.text, values.length);
    values.push(...f.values);
  });
  return { text, values };
}
