# @typesql/cli

The `typesql` command. `typesql introspect` reads a PostgreSQL or SQLite database and writes its [TypeSQL](https://www.npmjs.com/package/@typesql/core) schema to a TypeScript file.

## Install

```sh
npm install -D @typesql/cli
npm install -D pg   # for PostgreSQL
```

## Usage

```sh
npx typesql introspect --url postgres://localhost/app --out src/db/schema.ts
npx typesql introspect --dialect sqlite --db app.db --out src/db/schema.ts
```

`--dialect` is `postgres` (the default) or `sqlite` (the default when `--db` is given). `typesql introspect --dialect <name> --help` lists the options of each dialect.

## Documentation

- [From a live database](https://typesql.karsli.net/guide/introspect): PostgreSQL options
- [SQLite](https://typesql.karsli.net/adapters/sqlite#generate-the-schema): SQLite options

## License

[MIT](LICENSE)
