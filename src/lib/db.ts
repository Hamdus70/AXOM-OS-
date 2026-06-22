import pkg from 'pg';
const { Pool } = pkg;

// Singleton pattern for DB connection pool
let pool: pkg.Pool | null = null;

export const getPool = (): pkg.Pool => {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not defined");
    }

    // Serverless-optimized configuration
    const connectionString = (process.env.DATABASE_URL || "").trim();
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not defined");
    }

    pool = new Pool({
      connectionString: connectionString,
      // For Serverless, limit the pool size and manage connections strictly
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000, // Slightly increased from 2000 for slightly better reliability in cold starts
      statement_timeout: 10000,    // KILL queries taking > 10s
      query_timeout: 10000,        // KILL queries taking > 10s
      ssl: { rejectUnauthorized: false }, // Supabase requires SSL
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      // Pool handles resetting itself, but logging is crucial for visibility
    });
  }
  return pool;
};
