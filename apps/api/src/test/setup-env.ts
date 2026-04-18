const requiredEnv: Record<string, string> = {
  NODE_ENV: "test",
  LOG_LEVEL: "error",
  DATABASE_URL: "postgres://test:test@localhost:5432/o2c_test",
  REDIS_URL: "redis://localhost:6379/0",
  DEFAULT_TENANT_SLUG: "test-tenant",
  JWT_ISSUER: "o2c-test",
  JWT_AUDIENCE: "o2c-test-clients",
  JWT_PUBLIC_KEY: "test-public-key",
  JWT_PRIVATE_KEY: "test-private-key",
};

for (const [key, value] of Object.entries(requiredEnv)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
