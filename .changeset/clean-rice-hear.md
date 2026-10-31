---
"@typesql/core": major
---

Leave the table out of `sql.set(values)` and `sql.values(rows)`: the fragment is checked against the target of the `UPDATE` or `INSERT` it is interpolated into, and `sql.values` also checks the statement with only the keys every row always sends, so a required column a row can leave out is still an error. A plugin's `transformInput` context then has `table: null`, so `InputContext["table"]` is now `string | null`.
