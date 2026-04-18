import { loadEnv } from "@o2c/config";

export type DatabaseClientConfig = {
  connectionString: string;
  maxConnections: number;
};

export const createDatabaseClientConfig = (): DatabaseClientConfig => {
  const env = loadEnv();

  return {
    connectionString: env.DATABASE_URL,
    maxConnections: 10
  };
};

