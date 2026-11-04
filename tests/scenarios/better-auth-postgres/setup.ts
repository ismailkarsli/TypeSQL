import { Pool } from "pg";

// Better Auth's tables for email and password sign-in and database rate limits.
const db = new Pool({ connectionString: process.env.DATABASE_URL });
await db.query(`
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expiresAt" timestamptz NOT NULL,
	"token" text NOT NULL UNIQUE,
	"createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" timestamptz NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamptz,
	"refreshTokenExpiresAt" timestamptz,
	"scope" text,
	"password" text,
	"createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" timestamptz NOT NULL
);
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamptz NOT NULL,
	"createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"lastRequest" bigint NOT NULL
);
CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
`);
await db.end();
