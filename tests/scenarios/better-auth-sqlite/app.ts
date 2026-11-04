import { DatabaseSync } from "node:sqlite";
import { typesqlAdapter } from "@typesql/better-auth";
import { createSql } from "@typesql/sqlite";
import { betterAuth } from "better-auth";
import type { DB } from "./schema.js";

const db = new DatabaseSync(process.env.SQLITE_PATH!);
const sql = createSql<DB>(db);
const resetTokens: string[] = [];

const auth = betterAuth({
	baseURL: "http://localhost:3000",
	secret: "better-auth-sqlite-scenario-secret",
	telemetry: { enabled: false },
	logger: { level: "error" },
	database: typesqlAdapter(sql, { transaction: true }),
	emailAndPassword: {
		enabled: true,
		sendResetPassword: async ({ token }) => {
			resetTokens.push(token);
		},
	},
	rateLimit: {
		enabled: true,
		storage: "database",
		customRules: { "/sign-in/email": { window: 60, max: 3 } },
	},
	advanced: { database: { joins: true } },
});

const email = "ada@example.com";
const signIn = (password: string) =>
	auth.handler(
		new Request("http://localhost:3000/api/auth/sign-in/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:3000",
				"x-forwarded-for": "203.0.113.7",
			},
			body: JSON.stringify({ email, password }),
		}),
	);

const signUp = await auth.api.signUpEmail({
	body: { name: "Ada", email, password: "first-password" },
});
console.log("sign up:", signUp.user.email);

const signedIn = await signIn("first-password");
console.log("sign in:", signedIn.status);
const cookie = signedIn.headers
	.getSetCookie()
	.map((c) => c.split(";")[0])
	.join("; ");
const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
console.log("session user:", session?.user.name, session?.user.email);

await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset" } });
const [token = ""] = resetTokens;
await auth.api.resetPassword({
	body: { token, newPassword: "second-password" },
});
const reused = await auth.api
	.resetPassword({ body: { token, newPassword: "third-password" } })
	.then(
		() => "accepted",
		(error: { body?: { code?: string } }) => error.body?.code,
	);
console.log("reset token reused:", reused);

console.log("old password:", (await signIn("first-password")).status);
console.log("new password:", (await signIn("second-password")).status);
console.log("over the limit:", (await signIn("second-password")).status);

export const users = await sql(
	'SELECT name, email, "emailVerified", image FROM "user"',
).execute();
console.log(users);
db.close();
