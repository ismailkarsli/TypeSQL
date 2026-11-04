import { DatabaseSync } from "node:sqlite";

// Better Auth's tables for email and password sign-in and database rate limits.
const db = new DatabaseSync(process.env.SQLITE_PATH!);
db.exec(`
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"emailVerified" integer NOT NULL,
	"image" text,
	"createdAt" date NOT NULL,
	"updatedAt" date NOT NULL
);
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" date NOT NULL,
	"token" text NOT NULL UNIQUE,
	"createdAt" date NOT NULL,
	"updatedAt" date NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" date,
	"refreshTokenExpiresAt" date,
	"scope" text,
	"password" text,
	"createdAt" date NOT NULL,
	"updatedAt" date NOT NULL
);
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" date NOT NULL,
	"createdAt" date NOT NULL,
	"updatedAt" date NOT NULL
);
CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"lastRequest" bigint NOT NULL
);
CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
`);
db.close();
