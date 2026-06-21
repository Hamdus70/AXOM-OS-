import { Request, Response } from "express";
import { fetchAllProjects } from "../db/connection";

/**
 * Defensive Project Fetch Controller
 * Implements catalog retrieval with cloud database-only queries and strict catch-all safety.
 */
export async function getProjectsCatalog(req: Request, res: Response) {
  try {
    console.log("Vercel Catalog Read: Accessing projects inventory.");
    
    let projects: any[] = [];
    
    // 1. Fetch Cloud Database exclusively
    try {
      const dbPrjs = await fetchAllProjects();
      if (dbPrjs && Array.isArray(dbPrjs)) {
        projects = dbPrjs;
        console.log(`Vercel Catalog Read: Successfully retrieved ${projects.length} portfolios from cloud relational database.`);
      } else {
        console.warn("Vercel Catalog Read: Database returned no records or empty dataset.");
      }
    } catch (dbError: any) {
      // Gracefully catch database exceptions (table not created, connection refused, query timeout) 
      // strictly ensuring no system exception escapes to cause an express 5xx crash.
      console.error("Vercel Catalog Read Error (Cloud database failed/timed out):", dbError.stack || dbError);
    }

    // 2. Clear out any local file reading attempts as per architectural mandate for serverless compat.
    // 3. Strict structural checks and clean HTTP 200 empty array return
    return res.status(200).json(projects);
  } catch (error: any) {
    // 4. Fallback safeguard catch-all to prevent unhandled express route crashes on serverless cold starts
    console.error("Vercel Catalog Read Catch-All Error:", error.stack || error);
    return res.status(200).json([]);
  }
}
