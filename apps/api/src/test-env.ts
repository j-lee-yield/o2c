const defaults: Record<string, string> = {
  NODE_ENV: "test",
  LOG_LEVEL: "error",
  DATABASE_URL: "postgres://o2c:o2c@localhost:5432/o2c_test",
  REDIS_URL: "redis://localhost:6379/1",
  DEFAULT_TENANT_SLUG: "pilot-test",
  JWT_ISSUER: "o2c-test",
  JWT_AUDIENCE: "o2c-test-clients",
  JWT_PUBLIC_KEY: "test-public-key",
  JWT_PRIVATE_KEY: "test-private-key",
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
