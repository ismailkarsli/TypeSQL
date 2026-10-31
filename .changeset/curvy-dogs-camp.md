---
"@typesql/language-server": patch
---

mergeTokens takes the whole semantic tokens legend and a map from each highlight kind to a token type with modifiers, such as "keyword.definition", and highlights add constant, escape, slot and punctuation kinds so every character of a SQL string gets a token.
