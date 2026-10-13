DROP INDEX IF EXISTS "companies_domain_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "companies_name_unique" ON "companies" ("name");
CREATE INDEX IF NOT EXISTS "companies_domain_idx" ON "companies" ("official_domain");
