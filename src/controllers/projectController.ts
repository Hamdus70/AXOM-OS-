import { Request, Response } from "express";
import { getPool } from "../lib/db.js";

export async function getProjectsCatalog(req: Request, res: Response) {
  const pool = getPool();
  let client;
  try {
    // Acquire a dedicated client for this request to ensure proper release
    client = await pool.connect();
    
    // Using SELECT * to ensure all columns (including chapters, outline, etc.) are fetched
    const result = await client.query(`
      SELECT *
      FROM projects 
      ORDER BY created_at DESC
    `);
    
    // Ensure we always return an array, even if result.rows is nullish
    return res.status(200).json(result.rows || []);
  } catch (error: any) {
    console.error("Vercel Catalog Read Error (Silent Fallback):", error);
    // Explicitly return an empty array on any failure to prevent UI crashes
    return res.status(200).json([]);
  } finally {
    // Crucial: Release the client back to the pool immediately after execution or on error
    if (client) {
      client.release();
    }
  }
}
