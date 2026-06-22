import { Request, Response } from "express";
import { getPool } from "../lib/db.js";

/**
 * Upserts a chapter into the database using an upsert logic.
 */
export async function upsertChapter(req: Request, res: Response) {
  try {
    const { projectId, chapterKey, title, content, verificationReport, comments, status, wordCount } = req.body;

    if (!projectId || !chapterKey) {
      return res.status(400).json({ error: "projectId and chapterKey are required" });
    }

    const pool = getPool();
    
    // UPSERT Query
    await pool.query(`
      INSERT INTO chapters (
        project_id, chapter_key, title, content, status, word_count,
        verification_report, comments
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (project_id, chapter_key) DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        status = EXCLUDED.status,
        word_count = EXCLUDED.word_count,
        verification_report = EXCLUDED.verification_report,
        comments = EXCLUDED.comments
    `, [
      projectId,
      chapterKey,
      title || "Untitled Chapter",
      content || "",
      status || "pending",
      wordCount || 0,
      JSON.stringify(verificationReport || {}),
      JSON.stringify(comments || [])
    ]);

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Chapter Upsert Error:", error);
    return res.status(500).json({ error: "Failed to save chapter" });
  }
}
