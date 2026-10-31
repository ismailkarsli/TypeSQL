---
"typesql": minor
---

SQL in sql() strings is now colored in shades of orange, so it stands out from the TypeScript around it: keywords, types, functions, numbers, $1 and :name parameters and {slot} fragments, and table and column names, with separate shades for themes whose ID contains Dark or Light and for both built-in high contrast themes; strings and comments keep the theme colors, and an editor.tokenColorCustomizations rule under your theme ID, or empty textMateRules under [*Dark*][Default High Contrast] and [*Light*], changes or turns off the colors.
