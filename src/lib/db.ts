import pkg from 'pg';
const { Pool } = pkg;

let pool: pkg.Pool | null = null;

export const getPool = (): pkg.Pool => {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not defined");
    }
    const isProd = process.env.NODE_ENV === "production";
    const newPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Vercel/serverless environments might need to manage connection limits
      max: 10, 
      connectionTimeoutMillis: 5000,
      ssl: isProd ? { rejectUnauthorized: false } : undefined,
    });

    // Serverless Connection Failure Recovery (Automatic Single-Retry Event Loop)
    const originalConnect = newPool.connect.bind(newPool);
    newPool.connect = (async (...args: any[]) => {
      try {
        return await originalConnect(...args);
      } catch (err) {
        console.warn("Serverless DB Connection: Handshake attempt failed. triggering automatic handshake retry...", err);
        await new Promise((resolve) => setTimeout(resolve, 300));
        return await originalConnect(...args);
      }
    }) as any;

    const originalQuery = newPool.query.bind(newPool);
    newPool.query = (async (...args: any[]) => {
      try {
        return await originalQuery(...args);
      } catch (err) {
        console.warn("Serverless DB Query: Execution attempt failed. triggering automatic query retry...", err);
        await new Promise((resolve) => setTimeout(resolve, 300));
        return await originalQuery(...args);
      }
    }) as any;

    pool = newPool;
  }
  return pool;
};
