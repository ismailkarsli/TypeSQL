import type { Col } from "@typesql/core/postgres";
import { createSql } from "@typesql/pg";
import { Pool } from "pg";

interface DB {
	categories: {
		id: Col<"int4">;
		parent_id: Col<"int4", { nullable: true }>;
		name: Col<"text">;
	};
	customers: {
		id: Col<"int4">;
		name: Col<"text">;
		email: Col<"text", { nullable: true }>;
		created_at: Col<"timestamptz">;
	};
	products: {
		id: Col<"int4">;
		category_id: Col<"int4">;
		name: Col<"text">;
		price: Col<"numeric">;
		discontinued: Col<"bool">;
	};
	orders: {
		id: Col<"int4">;
		customer_id: Col<"int4">;
		status: Col<"text">;
		placed_at: Col<"timestamptz">;
		shipped_at: Col<"timestamptz", { nullable: true }>;
	};
	order_items: {
		order_id: Col<"int4">;
		product_id: Col<"int4">;
		quantity: Col<"int4">;
		unit_price: Col<"numeric">;
		discount: Col<"numeric", { nullable: true }>;
	};
	reviews: {
		id: Col<"int4">;
		product_id: Col<"int4">;
		customer_id: Col<"int4">;
		rating: Col<"int4">;
		body: Col<"text", { nullable: true }>;
	};
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = createSql<DB>(pool);
await pool.query(`CREATE TABLE categories (id int PRIMARY KEY, parent_id int REFERENCES categories, name text NOT NULL);
  CREATE TABLE customers (id int PRIMARY KEY, name text NOT NULL, email text, created_at timestamptz NOT NULL);
  CREATE TABLE products (id int PRIMARY KEY, category_id int NOT NULL REFERENCES categories, name text NOT NULL,
    price numeric NOT NULL, discontinued bool NOT NULL);
  CREATE TABLE orders (id int PRIMARY KEY, customer_id int NOT NULL REFERENCES customers, status text NOT NULL,
    placed_at timestamptz NOT NULL, shipped_at timestamptz);
  CREATE TABLE order_items (order_id int NOT NULL REFERENCES orders, product_id int NOT NULL REFERENCES products,
    quantity int NOT NULL, unit_price numeric NOT NULL, discount numeric);
  CREATE TABLE reviews (id int PRIMARY KEY, product_id int NOT NULL REFERENCES products,
    customer_id int NOT NULL REFERENCES customers, rating int NOT NULL, body text);
  INSERT INTO categories VALUES (1, NULL, 'Books'), (2, 1, 'Databases'), (3, 2, 'PostgreSQL'), (4, NULL, 'Games');
  INSERT INTO customers VALUES (1, 'Ada', 'ada@example.com', '2024-01-01Z'), (2, 'Grace', NULL, '2024-02-01Z'),
    (3, 'Edsger', NULL, '2024-03-01Z');
  INSERT INTO products VALUES (1, 3, 'Internals', 40.00, false), (2, 2, 'Design', 25.50, false),
    (3, 4, 'Chess', 15.00, true), (4, 1, 'Poems', 9.99, false);
  INSERT INTO orders VALUES (1, 1, 'shipped', '2024-04-01Z', '2024-04-03Z'), (2, 1, 'open', '2024-05-01Z', NULL),
    (3, 2, 'shipped', '2024-04-10Z', '2024-04-11Z'), (4, 2, 'cancelled', '2024-04-12Z', NULL);
  INSERT INTO order_items VALUES (1, 1, 2, 40.00, NULL), (1, 2, 1, 25.50, 5.00), (2, 3, 3, 15.00, NULL),
    (3, 1, 1, 38.00, 2.00), (3, 4, 4, 9.99, NULL), (4, 2, 1, 25.50, NULL);
  INSERT INTO reviews VALUES (1, 1, 1, 5, 'Deep'), (2, 1, 2, 4, NULL), (3, 2, 1, 3, 'Fine'), (4, 4, 2, 2, NULL);`);

// Each statement is the largest of its shape that TypeScript's budgets let
// TypeSQL check: one more term, level, join or branch is TS5114 or TS5115.
export const chain =
	await sql(`SELECT p.price + p.price + p.price + p.price + p.price + p.price + p.price + p.price +
    p.price + p.price + p.price + p.price + p.price + p.price + p.price + p.price +
    p.price + p.price + p.price + p.price + p.price + p.price + p.price + p.price +
    p.price + p.price + p.price + p.price + p.price + p.price + p.price + p.price +
    p.price + p.price + p.price + p.price + p.price + p.price + p.price + p.price +
    p.price
  AS total FROM products p WHERE p.id = 1`).exec();
export const nestedSubqueries = await sql(
	`SELECT (SELECT (SELECT (SELECT (SELECT (SELECT (SELECT (SELECT (SELECT (SELECT (SELECT max(p.price) FROM products p)))))))))) AS top_price`,
).exec();
export const nestedFrom =
	await sql(`SELECT x.id, x.name FROM (SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT * FROM (SELECT * FROM products) x) x) x) x) x) x) x) x) x) x) x
  ORDER BY x.id`).exec();
export const nestedCalls =
	await sql(`SELECT c.id, coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(coalesce(c.email, 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none'), 'none')
  AS contact FROM customers c ORDER BY c.id`).exec();
export const joins = await sql(`SELECT p0.id, p43.name FROM products p0
  JOIN products p1 ON p1.id = p0.id
  JOIN products p2 ON p2.id = p1.id
  JOIN products p3 ON p3.id = p2.id
  JOIN products p4 ON p4.id = p3.id
  JOIN products p5 ON p5.id = p4.id
  JOIN products p6 ON p6.id = p5.id
  JOIN products p7 ON p7.id = p6.id
  JOIN products p8 ON p8.id = p7.id
  JOIN products p9 ON p9.id = p8.id
  JOIN products p10 ON p10.id = p9.id
  JOIN products p11 ON p11.id = p10.id
  JOIN products p12 ON p12.id = p11.id
  JOIN products p13 ON p13.id = p12.id
  JOIN products p14 ON p14.id = p13.id
  JOIN products p15 ON p15.id = p14.id
  JOIN products p16 ON p16.id = p15.id
  JOIN products p17 ON p17.id = p16.id
  JOIN products p18 ON p18.id = p17.id
  JOIN products p19 ON p19.id = p18.id
  JOIN products p20 ON p20.id = p19.id
  JOIN products p21 ON p21.id = p20.id
  JOIN products p22 ON p22.id = p21.id
  JOIN products p23 ON p23.id = p22.id
  JOIN products p24 ON p24.id = p23.id
  JOIN products p25 ON p25.id = p24.id
  JOIN products p26 ON p26.id = p25.id
  JOIN products p27 ON p27.id = p26.id
  JOIN products p28 ON p28.id = p27.id
  JOIN products p29 ON p29.id = p28.id
  JOIN products p30 ON p30.id = p29.id
  JOIN products p31 ON p31.id = p30.id
  JOIN products p32 ON p32.id = p31.id
  JOIN products p33 ON p33.id = p32.id
  JOIN products p34 ON p34.id = p33.id
  JOIN products p35 ON p35.id = p34.id
  JOIN products p36 ON p36.id = p35.id
  JOIN products p37 ON p37.id = p36.id
  JOIN products p38 ON p38.id = p37.id
  JOIN products p39 ON p39.id = p38.id
  JOIN products p40 ON p40.id = p39.id
  JOIN products p41 ON p41.id = p40.id
  JOIN products p42 ON p42.id = p41.id
  JOIN products p43 ON p43.id = p42.id
  ORDER BY p0.id`).exec();
export const unions =
	await sql(`SELECT p.id, p.name FROM products p WHERE p.id = 1
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 2
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 3
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 4
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 5
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 6
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 7
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 8
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 9
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 10
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 11
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 12
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 13
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 14
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 15
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 16
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 17
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 18
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 19
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 20
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 21
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 22
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 23
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 24
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 25
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 26
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 27
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 28
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 29
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 30
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 31
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 32
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 33
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 34
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 35
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 36
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 37
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 38
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 39
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 40
  UNION ALL SELECT p.id, p.name FROM products p WHERE p.id = 41
  ORDER BY id`).exec();

// A report of exactly 4096 tokens, the most TypeSQL checks in one statement:
// a recursive CTE, chained CTEs, joins, LATERAL, window functions, FILTER,
// grouping, scalar and EXISTS subqueries, CASE, JSON and parameters, with one
// branch per customer id. One more token is a size error.
const branch = `  SELECT cu.id, cu.name, coalesce(cu.email, 'unknown') AS contact, r.position, r.spent, r.orders,
    round(100 * r.spent / r.grand_total, 1) AS share,
    CASE WHEN r.open_lines > 0 THEN 'open' WHEN r.orders > 1 THEN 'repeat' ELSE 'single' END AS segment,
    fav.path AS favourite_category,
    (SELECT avg(rv.rating) FROM reviews rv WHERE rv.customer_id = cu.id) AS average_rating,
    EXISTS (SELECT 1 FROM orders o2 WHERE o2.customer_id = cu.id AND o2.shipped_at IS NULL) AS waiting,
    json_build_object('biggest', r.biggest, 'last', last.placed_at) AS detail
  FROM ranked r
  JOIN customers cu ON cu.id = r.customer_id
  LEFT JOIN LATERAL (
    SELECT l.path FROM lines l WHERE l.customer_id = cu.id
    GROUP BY l.path ORDER BY sum(l.amount) DESC, l.path LIMIT 1
  ) fav ON true
  LEFT JOIN LATERAL (
    SELECT o3.placed_at FROM orders o3 WHERE o3.customer_id = cu.id ORDER BY o3.placed_at DESC LIMIT 1
  ) last ON true`;
export const report = await sql(
	`WITH RECURSIVE tree AS (
    SELECT c.id, c.id AS root_id, c.name::text AS path FROM categories c WHERE c.parent_id IS NULL
    UNION ALL
    SELECT c.id, t.root_id, t.path || ' / ' || c.name FROM categories c JOIN tree t ON c.parent_id = t.id
  ), lines AS (
    SELECT o.id AS order_id, o.customer_id, o.status, p.id AS product_id, t.root_id, t.path,
      oi.quantity * oi.unit_price - coalesce(oi.discount, 0) AS amount
    FROM orders o
    INNER JOIN order_items oi ON oi.order_id = o.id
    JOIN products p ON p.id = oi.product_id
    JOIN tree t ON t.id = p.category_id
    WHERE o.status <> $1
  ), totals AS (
    SELECT l.customer_id, sum(l.amount) AS spent, count(DISTINCT l.order_id) AS orders,
      count(*) FILTER (WHERE l.status = 'open') AS open_lines,
      max(l.amount) AS biggest
    FROM lines l GROUP BY l.customer_id HAVING sum(l.amount) > $2
  ), ranked AS (
    SELECT tt.customer_id, tt.spent, tt.orders, tt.open_lines, tt.biggest,
      rank() OVER (ORDER BY tt.spent DESC) AS position,
      sum(tt.spent) OVER () AS grand_total
    FROM totals tt
  )
  ${branch} WHERE cu.id = 1
  UNION ALL ${branch} WHERE cu.id = 2
  UNION ALL ${branch} WHERE cu.id = 3
  UNION ALL ${branch} WHERE cu.id = 4
  UNION ALL ${branch} WHERE cu.id = 5
  UNION ALL ${branch} WHERE cu.id = 6
  UNION ALL ${branch} WHERE cu.id = 7
  UNION ALL ${branch} WHERE cu.id = 8
  UNION ALL ${branch} WHERE cu.id = 9
  UNION ALL ${branch} WHERE cu.id = 10
  UNION ALL ${branch} WHERE cu.id = 11
  UNION ALL ${branch} WHERE cu.id = 12
  UNION ALL ${branch} WHERE cu.id = 13
  UNION ALL ${branch} WHERE cu.id = 14
  UNION ALL ${branch} WHERE cu.id = 15
  UNION ALL ${branch} WHERE cu.id = 16
  ORDER BY id`,
	"cancelled",
	0,
).exec();

console.dir(
	{ chain, nestedSubqueries, nestedFrom, nestedCalls, joins, unions, report },
	{ depth: null },
);
await pool.end();
