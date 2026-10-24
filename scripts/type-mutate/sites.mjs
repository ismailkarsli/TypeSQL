export const MUTATORS = ["cond-swap", "cond-true", "cond-false", "never-true", "never-false", "bool-flip", "union-drop", "tuple-swap", "sibling-swap", "infer-bare"];

export function findMutants(sf, SyntaxKind) {
  const K = SyntaxKind;
  const text = sf.text;
  const out = [];
  const seen = new Set();
  let scope = "-";
  const src = (n) => text.slice(n.getStart(), n.end);
  const range = (n) => ({ start: n.getStart(), end: n.end });
  const add = (mutator, start, end, replacement, anchors, description) => {
    const original = text.slice(start, end);
    if (original === replacement) return;
    const key = `${start}:${end}:${replacement}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ mutator, start, end, text: replacement, original, anchors, scope, description });
  };

  const children = (n) => {
    const cs = [];
    n.forEachChild((c) => void cs.push(c));
    return cs;
  };
  const isNever = (n) => n.kind === K.NeverKeyword;
  const literalKind = (n) => (n.kind === K.LiteralType ? n.literal.kind : undefined);

  // `infer` names declared in `n`, not inside a nested conditional's own branches
  const inferNames = (n) => {
    const names = new Set();
    const walk = (x) => {
      if (x.kind === K.InferType) names.add(x.typeParameter.name.text);
      if (x.kind === K.ConditionalType) return walk(x.checkType), walk(x.extendsType);
      x.forEachChild(walk);
    };
    walk(n);
    return names;
  };
  const uses = (n, names) => {
    if (!names.size) return false;
    let hit = false;
    const walk = (x) => {
      if (hit) return;
      if (x.kind === K.Identifier && names.has(x.text)) hit = true;
      else x.forEachChild(walk);
    };
    walk(n);
    return hit;
  };
  const testRange = (c) => ({ start: c.checkType.getStart(), end: c.extendsType.end });
  const leaf = (n) => {
    let x = n;
    while (x.kind === K.ParenthesizedType) x = x.type;
    return x.kind !== K.ConditionalType;
  };
  // `-1` is a PrefixUnaryExpression literal
  const numbers = (n) => {
    const out = [];
    const walk = (x) => {
      if (x.kind === K.LiteralType && (x.literal.kind === K.NumericLiteral || x.literal.kind === K.PrefixUnaryExpression)) out.push(x);
      else x.forEachChild(walk);
    };
    walk(n);
    return out;
  };

  const conditional = (c) => {
    const t = c.trueType;
    const f = c.falseType;
    const at = testRange(c);
    const where = `\`${oneLine(src(c.checkType))} extends ${oneLine(src(c.extendsType))}\``;
    const span = { start: t.getStart(), end: f.end };
    const between = text.slice(t.end, f.getStart());
    const inferred = inferNames(c.extendsType);
    // cond-swap and cond-true would move a true branch that uses an `infer` name out of its scope
    const trueUsesInfer = uses(t, inferred);
    if (src(t) !== src(f)) {
      if (!trueUsesInfer) add("cond-swap", span.start, span.end, src(f) + between + src(t), [at], `swap the branches of ${where}`);
      if (!trueUsesInfer) add("cond-true", f.getStart(), f.end, src(t), [at], `${where} always takes its true branch`);
      add("cond-false", t.getStart(), t.end, src(f), [at], `${where} never takes its true branch`);
    }
    if (!isNever(t)) add("never-true", t.getStart(), t.end, "never", leaf(t) ? [at, range(t)] : [at], `the true branch of ${where} is \`never\``);
    if (!isNever(f)) add("never-false", f.getStart(), f.end, "never", leaf(f) ? [range(f)] : [at], `the false branch of ${where} is \`never\``);
    let next = f;
    while (next.kind === K.ParenthesizedType) next = next.type;
    if (next.kind === K.ConditionalType) {
      const a = numbers(t);
      const b = numbers(next.trueType);
      if (a.length && a.length === b.length && a.some((x, i) => src(x) !== src(b[i]))) {
        const start = a[0].getStart();
        const end = b[b.length - 1].end;
        const edits = [...a.map((x, i) => [x, src(b[i])]), ...b.map((x, i) => [x, src(a[i])])];
        let replaced = "";
        let at2 = start;
        for (const [x, s] of edits) {
          replaced += text.slice(at2, x.getStart()) + s;
          at2 = x.end;
        }
        replaced += text.slice(at2, end);
        const other = `\`${oneLine(src(next.checkType))} extends ${oneLine(src(next.extendsType))}\``;
        add("sibling-swap", start, end, replaced, [...a, ...b].map(range), `swap the numbers of the branches of ${where} (${a.map(src).join(", ")}) and ${other} (${b.map(src).join(", ")})`);
      }
    }
  };

  const visit = (n) => {
    const outer = scope;
    if ((n.kind === K.TypeAliasDeclaration || n.kind === K.InterfaceDeclaration) && n.name?.text) scope = n.name.text;
    // per-property scope keeps ids stable when entries are added to a table such as pg-functions.ts
    else if (n.kind === K.PropertySignature && n.name?.text !== undefined) scope = `${scope}.${n.name.text}`;
    switch (n.kind) {
      case K.ConditionalType:
        conditional(n);
        break;
      case K.LiteralType:
        if (n.literal.kind === K.TrueKeyword) add("bool-flip", n.getStart(), n.end, "false", [range(n)], "`true` → `false`");
        else if (n.literal.kind === K.FalseKeyword) add("bool-flip", n.getStart(), n.end, "true", [range(n)], "`false` → `true`");
        break;
      case K.UnionType: {
        const types = [...n.types];
        if (types.length >= 2 && types.every((m) => literalKind(m) === K.StringLiteral)) {
          types.forEach((m, i) => {
            const start = i === 0 ? n.getStart() : types[i - 1].end;
            const end = i === 0 ? types[1].getStart() : m.end;
            add("union-drop", start, end, "", [range(m)], `drop ${src(m)} from the union`);
          });
        }
        break;
      }
      case K.TupleType: {
        const els = [...n.elements];
        for (let i = 0; i + 1 < els.length; i++) {
          const a = els[i];
          const b = els[i + 1];
          if (a.kind !== b.kind || a.kind === K.NamedTupleMember || src(a) === src(b)) continue;
          add("tuple-swap", a.getStart(), b.end, src(b) + text.slice(a.end, b.getStart()) + src(a), [range(a), range(b)], `swap the tuple members ${oneLine(src(a))} and ${oneLine(src(b))}`);
        }
        break;
      }
      case K.InferType: {
        const p = n.typeParameter;
        if (p.constraint) add("infer-bare", p.name.end, p.constraint.end, "", [range(p.constraint)], `drop the constraint of \`infer ${p.name.text} extends ${oneLine(src(p.constraint))}\``);
        break;
      }
    }
    for (const c of children(n)) visit(c);
    scope = outer;
  };
  visit(sf);
  return out.sort((a, b) => a.anchors[0].start - b.anchors[0].start || MUTATORS.indexOf(a.mutator) - MUTATORS.indexOf(b.mutator) || a.start - b.start);
}

export function oneLine(s, max = 60) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
