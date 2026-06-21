import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fetchAllProjects } from "../db/connection";

const STORAGE_PATH = path.join(process.cwd(), "projects_db.json");

/**
 * Defensive Project Fetch Controller
 * Implements catalog retrieval with strict defensive validation and try/catch error shielding.
 */
export async function getProjectsCatalog(req: Request, res: Response) {
  try {
    console.log("Vercel Catalog Read: Accessing projects inventory.");
    
    let projects: any[] = [];
    
    // 1. Attempt Cloud Database fetch with connection timeout safety gates
    if (process.env.DATABASE_URL) {
      try {
        const dbPrjs = await fetchAllProjects();
        if (dbPrjs && Array.isArray(dbPrjs) && dbPrjs.length > 0) {
          projects = dbPrjs;
          console.log(`Vercel Catalog Read: Successfully retrieved ${projects.length} portfolios from cloud relational database.`);
        } else {
          console.warn("Vercel Catalog Read: Database returned no records or empty dataset.");
        }
      } catch (dbError: any) {
        // Failover to file system or seed database to keep service live during db outage
        console.error("Vercel Catalog Read Error (PostgreSQL connection bypassed/failed):", dbError.stack || dbError);
      }
    }

    // 2. If database fetch yielded nothing (empty or errored), perform local JSON/Seed recovery
    if (projects.length === 0) {
      if (fs.existsSync(STORAGE_PATH)) {
        try {
          const fileData = fs.readFileSync(STORAGE_PATH, "utf-8");
          const parsed = JSON.parse(fileData);
          if (Array.isArray(parsed)) {
            projects = parsed;
            console.log(`Vercel Catalog Read: Recovered ${projects.length} portfolios from backup JSON store.`);
          }
        } catch (fileErr: any) {
          console.error("Vercel Catalog Read Error (Local storage unreadable):", fileErr);
        }
      }
    }

    // 3. Strict structural array check validation block
    if (!projects || !Array.isArray(projects)) {
      console.warn("Vercel Catalog Read Error: Catalog array structure violated. Defaulting to empty array.");
      return res.status(200).json([]);
    }

    return res.status(200).json(projects);
  } catch (error: any) {
    // 4. Fallback safeguard catch-all to prevent unhandled express route crashes on serverless cold starts
    console.error("Vercel Catalog Read Error:", error.stack || error);
    return res.status(200).json([]);
  }
}
