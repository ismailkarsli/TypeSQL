---
"@typesql/core": patch
---

Number the parameters right in the text, row and parameter types of a statement or fragment with several union fragments, such as two conditional pieces that each carry a value: the later piece's parameters were numbered as if every earlier piece were present and absent at once, while the statement itself was checked correctly.
