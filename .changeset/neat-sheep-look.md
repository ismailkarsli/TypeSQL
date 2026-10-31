---
"typesql": patch
---

With the TypeScript 7 extension, types decide what is SQL: strings of TypeSQL calls are highlighted under any name, such as camel("…") from createSql or users("INSERT …") in a migration, and other functions' strings that look like SQL, such as your own sql("…"), stay plain; set typesql.semanticHighlighting.enable to false to keep highlighting by name only.
