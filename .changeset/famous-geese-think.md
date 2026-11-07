---
"@typesql/core": minor
---

`CasePlugin` treats a run of capitals as one word when converting a key to snake_case, and the first character takes no underscore; a capital ending a run before a lower case letter starts the next word: `userID` is `user_id`, `Id` is `id`, and `HTTPCode` is `http_code`. A column of single-letter words, such as `point_x_y`, still reads as `pointXY` but must now be written by its own name, because `pointXY` converts to `point_xy`.
