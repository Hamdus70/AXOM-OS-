import pkg from 'pg';
const { Pool } = pkg;

let pool: pkg.Pool | null = null;

export const getPool = (): pkg.Pool => {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not defined");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Vercel/serverless environments might need to manage connection limits
      max: 10, 
    });
  }
  return pool;
};
