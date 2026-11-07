import { typesqlAdapter } from "@typesql/better-auth";
import { createSql } from "@typesql/pg";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
await pool.query(`
CREATE TABLE "user" (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean NOT NULL, image text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, two_factor_enabled boolean, preferred_name text);
CREATE TABLE session (id text PRIMARY KEY, expires_at timestamptz NOT NULL, token text NOT NULL UNIQUE, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, ip_address text, user_agent text, user_id text NOT NULL REFERENCES "user" (id), device_name text);
CREATE TABLE account (id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL, user_id text NOT NULL REFERENCES "user" (id), access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, scope text, password text, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE verification (id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE rate_limit (id text PRIMARY KEY, key text NOT NULL UNIQUE, count int NOT NULL, last_request bigint NOT NULL);
CREATE TABLE two_factor (id text PRIMARY KEY, secret text NOT NULL, backup_codes text NOT NULL, user_id text NOT NULL REFERENCES "user" (id), verified boolean, failed_verification_count int, locked_until timestamptz);
CREATE TABLE oauth_client (id text PRIMARY KEY, client_id text NOT NULL, require_pkce boolean NOT NULL);
`);

const oauthClients = {
	id: "oauth-clients",
	schema: {
		oauthClient: {
			fields: {
				clientId: { type: "string", required: true },
				requirePKCE: { type: "boolean", required: true },
			},
		},
	},
} satisfies BetterAuthPlugin;

const auth = betterAuth({
	baseURL: "http://localhost:3000",
	secret: "better-auth-casing-scenario-secret",
	telemetry: { enabled: false },
	logger: { level: "error" },
	database: typesqlAdapter(createSql<{}>(pool), {
		transaction: true,
		casing: "snake_case",
	}),
	emailAndPassword: { enabled: true },
	user: {
		additionalFields: { preferredName: { type: "string", required: false } },
	},
	session: {
		additionalFields: { deviceName: { type: "string", required: false } },
	},
	rateLimit: { enabled: true, storage: "database" },
	advanced: { database: { joins: true } },
	plugins: [twoFactor(), oauthClients],
});

const headers = {
	"content-type": "application/json",
	origin: "http://localhost:3000",
	"x-forwarded-for": "203.0.113.7",
};
const signUp = await auth.api.signUpEmail({
	body: {
		name: "Ada",
		email: "ada@example.com",
		password: "first-password",
		preferredName: "Countess",
	},
});
console.log("sign up:", signUp.user.email, signUp.user.preferredName);

const signIn = await auth.handler(
	new Request("http://localhost:3000/api/auth/sign-in/email", {
		method: "POST",
		headers,
		body: JSON.stringify({
			email: "ada@example.com",
			password: "first-password",
		}),
	}),
);
console.log("sign in:", signIn.status);
const cookie = signIn.headers
	.getSetCookie()
	.map((c) => c.split(";")[0])
	.join("; ");
const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
console.log("session:", session?.user.name, session?.user.preferredName);

// The application keeps Better Auth's names; only the database's change.
const { adapter } = await auth.$context;
await adapter.create({
	model: "twoFactor",
	data: {
		secret: "secret",
		backupCodes: "codes",
		userId: signUp.user.id,
	},
});
const factor = await adapter.findOne<{ backupCodes: string; userId: string }>({
	model: "twoFactor",
	where: [{ field: "userId", value: signUp.user.id }],
});
console.log(
	"two factor:",
	factor?.backupCodes,
	factor?.userId === signUp.user.id,
);
await adapter.create({
	model: "oauthClient",
	data: { clientId: "app", requirePKCE: true },
});
const client = await adapter.findOne<{ requirePKCE: boolean }>({
	model: "oauthClient",
	where: [{ field: "requirePKCE", value: true }],
});
console.log("oauth client:", client?.requirePKCE);

const count = async (table: string) => {
	const { rows } = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
	return rows[0].n;
};
const stored = await pool.query(
	`SELECT u.preferred_name, u.email_verified, s.user_id = u.id AS session_user_id, s.expires_at > now() AS session_active,
		a.provider_id, f.backup_codes, c.client_id, c.require_pkce
	FROM "user" u
	JOIN session s ON s.user_id = u.id
	JOIN account a ON a.user_id = u.id
	JOIN two_factor f ON f.user_id = u.id
	CROSS JOIN oauth_client c
	LIMIT 1`,
);
console.log("stored:", stored.rows[0]);
console.log("rate_limit rows:", (await count("rate_limit")) > 0);
await pool.end();
