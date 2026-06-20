import pg from "pg";
import Redis from "ioredis";

const { Pool } = pg;

// Define Typings for Database State
export interface DBResearchProject {
  id: string;
  title: string;
  field: string;
  academicLevel: string;
  methodology: string;
  citationStyle: string;
  wordLimit: number;
  wordCount: number;
  progress: number;
  outline: any[];
  faculty?: string;
  studyDesign?: string;
  sampleSize?: string;
  studySetting?: string;
  stylePreferences?: string;
  objectiveToggle?: string;
  customObjectives?: string;
  blueprintFile?: string | null;
  assetFile?: string | null;
  abstract?: string;
  createdAt: string;
}

export interface DBChapter {
  project_id: string;
  chapter_key: string;
  title: string;
  content: string;
  status: string;
  word_count: number;
  ai_originality_score: number;
  plagiarism_score: number;
  citations_count: number;
  completion_time: string;
  logs: string[];
  is_approved: boolean;
  feedback_logs: any[];
  verification_report: any;
}

// ==========================================
// 1. DATABASE CONNECTIVITY & POOL LIFECYCLE
// ==========================================

const DATABASE_URL = process.env.DATABASE_URL || "";
let pgPool: pg.Pool | null = null;

// Initialize the PostgreSQL connection pool with standard enterprise resilience parameters
export function getPostgresPool(): pg.Pool {
  if (pgPool) return pgPool;

  if (!DATABASE_URL) {
    console.warn("AXOM DB ENGINE: DATABASE_URL is not set. Creating a mock/ephemeral PostgreSQL environment for local development.");
    // We instantiate a minimalist fallback pool that will gracefully fail but capture calls properly
    pgPool = new Pool({
      connectionString: "postgresql://localhost:5432/mock_db",
      max: 1,
      idleTimeoutMillis: 1000,
    });
    return pgPool;
  }

  try {
    const isProd = process.env.NODE_ENV === "production";
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      // Handle high concurrency connection pooling safely
      max: 20, 
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      maxUses: 7500, // Recycle connections to prevent leaks
      // Deployed containers inside GCR generally require SSL handshakes
      ssl: isProd ? { rejectUnauthorized: false } : undefined,
    });

    // Handle idle connection errors to prevent backend node crashes
    pgPool.on("error", (err) => {
      console.error("AXOM DB ENGINE: Unexpected error on idle PostgreSQL client pool", err);
    });

    console.log("AXOM DB ENGINE: Cloud SQL PostgreSQL connection pool provisioned successfully.");
  } catch (err) {
    console.error("AXOM DB ENGINE: Critical failure in database pool creation:", err);
    throw err;
  }

  return pgPool;
}

// ==========================================
// 2. SCHEMA DEFINITION & BOOTSTRAPPING DDL
// ==========================================

export async function bootstrapDatabaseSchema(): Promise<void> {
  const pool = getPostgresPool();
  if (!DATABASE_URL) {
    console.warn("AXOM DB ENGINE: Skipping DDL bootstrapping. No active PostgreSQL configuration detected.");
    return;
  }

  let attempts = 5;
  const delayMs = 3000;

  while (attempts > 0) {
    try {
      console.log(`AXOM DB ENGINE: Authenticating & boot-checking databases (Attempts remaining: ${attempts})...`);
      
      const client = await pool.connect();
      try {
        await client.query("BEGIN;");

        // Projects Master Table Schema
        await client.query(`
          CREATE TABLE IF NOT EXISTS projects (
            id VARCHAR(50) PRIMARY KEY,
            title TEXT NOT NULL,
            field TEXT NOT NULL,
            academic_level VARCHAR(100) NOT NULL DEFAULT 'Undergraduate',
            methodology VARCHAR(100) NOT NULL DEFAULT 'Qualitative',
            citation_style VARCHAR(100) NOT NULL DEFAULT 'APA 7th Edition',
            word_limit INTEGER NOT NULL DEFAULT 8000,
            word_count INTEGER NOT NULL DEFAULT 0,
            progress INTEGER NOT NULL DEFAULT 0,
            outline JSONB NOT NULL DEFAULT '[]'::jsonb,
            faculty VARCHAR(255) DEFAULT '',
            study_design TEXT DEFAULT '',
            sample_size VARCHAR(255) DEFAULT '',
            study_setting TEXT DEFAULT '',
            style_preferences TEXT DEFAULT '',
            objective_toggle TEXT DEFAULT 'generate',
            custom_objectives TEXT DEFAULT '',
            blueprint_file TEXT,
            asset_file TEXT,
            abstract TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);

        // Chapter Decomposition Table Schema
        await client.query(`
          CREATE TABLE IF NOT EXISTS chapters (
            id SERIAL PRIMARY KEY,
            project_id VARCHAR(50) REFERENCES projects(id) ON DELETE CASCADE,
            chapter_key VARCHAR(100) NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            word_count INTEGER NOT NULL DEFAULT 0,
            ai_originality_score NUMERIC(5,2) DEFAULT 100.00,
            plagiarism_score NUMERIC(5,2) DEFAULT 0.00,
            citations_count INTEGER DEFAULT 0,
            completion_time VARCHAR(100) DEFAULT '',
            logs JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_approved BOOLEAN DEFAULT FALSE,
            feedback_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
            verification_report JSONB NOT NULL DEFAULT '{}'::jsonb,
            comments JSONB NOT NULL DEFAULT '[]'::jsonb,
            CONSTRAINT uq_project_chapter UNIQUE(project_id, chapter_key)
          );
        `);

        await client.query(`
          ALTER TABLE chapters ADD COLUMN IF NOT EXISTS comments JSONB NOT NULL DEFAULT '[]'::jsonb;
        `);

        // Create Indices for high throughput project-specific fetches
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_chapters_project_id ON chapters(project_id);
        `);

        // Telemetry Logs Audit Trail Schema
        await client.query(`
          CREATE TABLE IF NOT EXISTS telemetry_audit_logs (
            id SERIAL PRIMARY KEY,
            event_name VARCHAR(100) NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            severity VARCHAR(20) DEFAULT 'INFO',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await client.query("COMMIT;");
        console.log("AXOM DB ENGINE: Enterprise security schema validation completed. 0-errors, all tables ready.");
        break;
      } catch (innerErr) {
        await client.query("ROLLBACK;");
        throw innerErr;
      } finally {
        client.release();
      }
    } catch (err) {
      attempts--;
      console.error(`AXOM DB ENGINE: DDL bootstrapping failed: ${(err as Error).message}. Retrying in ${delayMs / 1000}s...`);
      if (attempts === 0) {
        console.error("AXOM DB ENGINE: Exhausted connection pool retries. Operating in degraded runtime format.");
      } else {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}

// ==========================================
// 3. SECURE REDIS MEMSTORE & CACHE ENGINE
// ==========================================

const REDIS_URL = process.env.REDIS_URL || "";
let redisClient: Redis | null = null;
const memoryCacheStore = new Map<string, { value: string; expiresAt: number }>();

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  if (!REDIS_URL) {
    return null; // Return null to indicate fallback to robust Memory Cache
  }

  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 1000, 15000);
        console.warn(`AXOM REDIS CONNECT: Reconnecting state node. Attempt ${times}. Delay ${delay}ms`);
        return delay;
      },
    });

    redisClient.on("error", (err) => {
      console.error("AXOM REDIS CONNECT: Client connection exception caught:", err);
    });

    console.log("AXOM REDIS CONNECT: Established real-time synchronization link to Redis cluster.");
  } catch (err) {
    console.error("AXOM REDIS CONNECT: Initialization error:", err);
  }

  return redisClient;
}

// Clean API over Redis or Memory Cache for rate limits, session states, and telemetry queues
export const distributedStateCache = {
  async get(key: string): Promise<string | null> {
    const client = getRedisClient();
    if (client) {
      try {
        return await client.get(key);
      } catch (err) {
        console.error(`AXOM STATE CACHE: Failed key retrieval for [${key}]:`, err);
      }
    }

    // Local Memory Cache Fallback (Cloud Run Replica Sandbox Mode)
    const record = memoryCacheStore.get(key);
    if (record) {
      if (Date.now() < record.expiresAt) {
        return record.value;
      }
      memoryCacheStore.delete(key);
    }
    return null;
  },

  async set(key: string, value: string, ttlSeconds: number = 3600): Promise<void> {
    const client = getRedisClient();
    if (client) {
      try {
        await client.set(key, value, "EX", ttlSeconds);
        return;
      } catch (err) {
        console.error(`AXOM STATE CACHE: Failed key set for [${key}]:`, err);
      }
    }

    // Cache Fallback
    memoryCacheStore.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000),
    });
  },

  async del(key: string): Promise<void> {
    const client = getRedisClient();
    if (client) {
      try {
        await client.del(key);
        return;
      } catch (err) {
        console.error(`AXOM STATE CACHE: Failed key flush for [${key}]:`, err);
      }
    }
    memoryCacheStore.delete(key);
  },

  // Distributed Rate Limiter with standard leaky bucket mechanics
  async rateLimitCheck(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const client = getRedisClient();
    const rateKey = `ratelimit:${key}`;

    if (client) {
      try {
        const pipeline = client.pipeline();
        pipeline.incr(rateKey);
        pipeline.pttl(rateKey);
        
        const results = await pipeline.exec();
        if (results && results[0] && results[1]) {
          const hits = results[0][1] as number;
          let pttl = results[1][1] as number;

          if (pttl === -1) {
            // Key has no expiry, set it
            await client.pexpire(rateKey, windowMs);
            pttl = windowMs;
          }

          const allowed = hits <= limit;
          const remaining = Math.max(0, limit - hits);
          const resetAt = Date.now() + pttl;

          return { allowed, remaining, resetAt };
        }
      } catch (err) {
        console.error("AXOM STATE CACHE: Redis rate limiter failure, degraded to passing:", err);
      }
    }

    // High fidelity fallback rate limiter using in-memory keys
    const cacheKey = `ratelimit-mem:${key}`;
    const record = memoryCacheStore.get(cacheKey);
    let hits = 1;
    let expiresAt = Date.now() + windowMs;

    if (record) {
      if (Date.now() < record.expiresAt) {
        hits = parseInt(record.value) + 1;
        expiresAt = record.expiresAt;
      }
    }

    memoryCacheStore.set(cacheKey, {
      value: hits.toString(),
      expiresAt,
    });

    const allowed = hits <= limit;
    const remaining = Math.max(0, limit - hits);
    return { allowed, remaining, resetAt: expiresAt };
  },

  // Telemetry buffer push (Redis LIST, fallback to DB insert)
  async enqueueTelemetryEvent(eventName: string, payload: Record<string, any>, severity: string = "INFO"): Promise<void> {
    const client = getRedisClient();
    const event = { eventName, payload, severity, timestamp: new Date().toISOString() };
    
    if (client) {
      try {
        await client.lpush("telemetry-queue", JSON.stringify(event));
        return;
      } catch (err) {
        console.error("AXOM TELEMETRY: Failed pushing to Redis Queue, direct-writing to PostgreSQL instead:", err);
      }
    }

    // Direct write to PostgreSQL to preserve integrity
    const pool = getPostgresPool();
    if (DATABASE_URL) {
      try {
        await pool.query(
          "INSERT INTO telemetry_audit_logs (event_name, payload, severity) VALUES ($1, $2, $3)",
          [eventName, payload, severity]
        );
      } catch (postgresErr) {
        console.error("AXOM TELEMETRY: Failed writing fallback telemetry log to PostgreSQL database:", postgresErr);
      }
    }
  }
};

// ==========================================
// 4. THE ASYNCHRONOUS DATA SERVICE LAYER
// ==========================================

export async function fetchAllProjects(): Promise<any[]> {
  const pool = getPostgresPool();
  if (!DATABASE_URL) {
    // Return empty array if not initialized or mock
    return [];
  }

  try {
    const prjResult = await pool.query(`
      SELECT 
        id, title, field, academic_level as "academicLevel", 
        methodology, citation_style as "citationStyle", 
        word_limit as "wordLimit", word_count as "wordCount", 
        progress, outline, faculty, study_design as "studyDesign", 
        sample_size as "sampleSize", study_setting as "studySetting", 
        style_preferences as "stylePreferences", objective_toggle as "objectiveToggle", 
        custom_objectives as "customObjectives", blueprint_file as "blueprintFile", 
        asset_file as "assetFile", abstract, created_at as "createdAt"
      FROM projects 
      ORDER BY created_at DESC
    `);

    const projects: any[] = [];

    // For each project, fetch its associated active chapters
    for (const prj of prjResult.rows) {
      const chapResult = await pool.query(`
        SELECT 
          chapter_key, title, content, status, 
          word_count as "wordCount", 
          ai_originality_score as "aiOriginalityScore", 
          plagiarism_score as "plagiarismScore", 
          citations_count as "citationsCount", 
          completion_time as "completionTime", 
          logs, is_approved as "isApproved", 
          feedback_logs as "feedbackLogs", 
          verification_report as "verificationReport",
          comments
        FROM chapters 
        WHERE project_id = $1
      `, [prj.id]);

      const chaptersMap: Record<string, any> = {};
      chapResult.rows.forEach(chap => {
        chaptersMap[chap.chapter_key] = {
          title: chap.title,
          content: chap.content,
          status: chap.status,
          wordCount: chap.wordCount,
          aiOriginalityScore: Number(chap.aiOriginalityScore),
          plagiarismScore: Number(chap.plagiarismScore),
          citationsCount: chap.citationsCount,
          completionTime: chap.completionTime,
          logs: chap.logs,
          isApproved: chap.isApproved,
          feedbackLogs: chap.feedbackLogs,
          verificationReport: chap.verificationReport,
          comments: chap.comments || [],
        };
      });

      projects.push({
        ...prj,
        chapters: chaptersMap
      });
    }

    return projects;
  } catch (err) {
    console.error("AXOM DATA LAYER: Failed to fetch projects from PostgreSQL:", err);
    throw err;
  }
}

export async function fetchProjectById(id: string): Promise<any | null> {
  const pool = getPostgresPool();
  if (!DATABASE_URL) return null;

  try {
    const prjResult = await pool.query(`
      SELECT 
        id, title, field, academic_level as "academicLevel", 
        methodology, citation_style as "citationStyle", 
        word_limit as "wordLimit", word_count as "wordCount", 
        progress, outline, faculty, study_design as "studyDesign", 
        sample_size as "sampleSize", study_setting as "studySetting", 
        style_preferences as "stylePreferences", objective_toggle as "objectiveToggle", 
        custom_objectives as "customObjectives", blueprint_file as "blueprintFile", 
        asset_file as "assetFile", abstract, created_at as "createdAt"
      FROM projects 
      WHERE id = $1
    `, [id]);

    if (prjResult.rowCount === 0) return null;

    const prj = prjResult.rows[0];

     const chapResult = await pool.query(`
      SELECT 
        chapter_key, title, content, status, 
        word_count as "wordCount", 
        ai_originality_score as "aiOriginalityScore", 
        plagiarism_score as "plagiarismScore", 
        citations_count as "citationsCount", 
        completion_time as "completionTime", 
        logs, is_approved as "isApproved", 
        feedback_logs as "feedbackLogs", 
        verification_report as "verificationReport",
        comments
      FROM chapters 
      WHERE project_id = $1
    `, [id]);

    const chaptersMap: Record<string, any> = {};
    chapResult.rows.forEach(chap => {
      chaptersMap[chap.chapter_key] = {
        title: chap.title,
        content: chap.content,
        status: chap.status,
        wordCount: chap.wordCount,
        aiOriginalityScore: Number(chap.aiOriginalityScore),
        plagiarismScore: Number(chap.plagiarismScore),
        citationsCount: chap.citationsCount,
        completionTime: chap.completionTime,
        logs: chap.logs,
        isApproved: chap.isApproved,
        feedbackLogs: chap.feedbackLogs,
        verificationReport: chap.verificationReport,
        comments: chap.comments || [],
      };
    });

    return {
      ...prj,
      chapters: chaptersMap
    };
  } catch (err) {
    console.error(`AXOM DATA LAYER: Failed fetching project [${id}]:`, err);
    throw err;
  }
}

export async function saveOrUpdateProject(project: any): Promise<void> {
  const pool = getPostgresPool();
  if (!DATABASE_URL) return;

  try {
    await pool.query(`
      INSERT INTO projects (
        id, title, field, academic_level, methodology, citation_style, 
        word_limit, word_count, progress, outline, faculty, 
        study_design, sample_size, study_setting, style_preferences, 
        objective_toggle, custom_objectives, blueprint_file, asset_file, abstract
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        field = EXCLUDED.field,
        academic_level = EXCLUDED.academic_level,
        methodology = EXCLUDED.methodology,
        citation_style = EXCLUDED.citation_style,
        word_limit = EXCLUDED.word_limit,
        word_count = EXCLUDED.word_count,
        progress = EXCLUDED.progress,
        outline = EXCLUDED.outline,
        faculty = EXCLUDED.faculty,
        study_design = EXCLUDED.study_design,
        sample_size = EXCLUDED.sample_size,
        study_setting = EXCLUDED.study_setting,
        style_preferences = EXCLUDED.style_preferences,
        objective_toggle = EXCLUDED.objective_toggle,
        custom_objectives = EXCLUDED.custom_objectives,
        blueprint_file = EXCLUDED.blueprint_file,
        asset_file = EXCLUDED.asset_file,
        abstract = EXCLUDED.abstract
    `, [
      project.id,
      project.title,
      project.field,
      project.academicLevel || "Undergraduate",
      project.methodology || "Qualitative",
      project.citationStyle || "APA 7th Edition",
      project.wordLimit || 8000,
      project.wordCount || 0,
      project.progress || 0,
      JSON.stringify(project.outline || []),
      project.faculty || "",
      project.studyDesign || "",
      project.sampleSize || "",
      project.studySetting || "",
      project.stylePreferences || "",
      project.objectiveToggle || "generate",
      project.customObjectives || "",
      project.blueprintFile || null,
      project.assetFile || null,
      project.abstract || null
    ]);

    // Save and align associated Chapters safely
    if (project.chapters) {
      for (const [key, chap] of Object.entries(project.chapters) as [string, any][]) {
        await pool.query(`
          INSERT INTO chapters (
            project_id, chapter_key, title, content, status, word_count, 
            ai_originality_score, plagiarism_score, citations_count, 
            completion_time, logs, is_approved, feedback_logs, verification_report, comments
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (project_id, chapter_key) DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            status = EXCLUDED.status,
            word_count = EXCLUDED.word_count,
            ai_originality_score = EXCLUDED.ai_originality_score,
            plagiarism_score = EXCLUDED.plagiarism_score,
            citations_count = EXCLUDED.citations_count,
            completion_time = EXCLUDED.completion_time,
            logs = EXCLUDED.logs,
            is_approved = EXCLUDED.is_approved,
            feedback_logs = EXCLUDED.feedback_logs,
            verification_report = EXCLUDED.verification_report,
            comments = EXCLUDED.comments
        `, [
          project.id,
          key,
          chap.title,
          chap.content || "",
          chap.status || "pending",
          chap.wordCount || 0,
          chap.aiOriginalityScore || 100,
          chap.plagiarismScore || 0,
          chap.citationsCount || 0,
          chap.completionTime || "",
          JSON.stringify(chap.logs || []),
          chap.isApproved || false,
          JSON.stringify(chap.feedbackLogs || []),
          JSON.stringify(chap.verificationReport || {}),
          JSON.stringify(chap.comments || [])
        ]);
      }
    }

    // Capture state event to distributed state log
    await distributedStateCache.enqueueTelemetryEvent("PROJECT_MUTATION", {
      projectId: project.id,
      progress: project.progress,
      totalChapters: Object.keys(project.chapters || {}).length,
    }, "INFO");

  } catch (err) {
    console.error(`AXOM DATA LAYER: High priority save event failed for project [${project.id}]:`, err);
    throw err;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  const pool = getPostgresPool();
  if (!DATABASE_URL) return false;

  try {
    const result = await pool.query("DELETE FROM projects WHERE id = $1", [id]);
    const success = (result.rowCount ?? 0) > 0;
    
    if (success) {
      await distributedStateCache.enqueueTelemetryEvent("PROJECT_DELETION", { projectId: id }, "WARN");
    }
    return success;
  } catch (err) {
    console.error(`AXOM DATA LAYER: Failed removing project [${id}] from persist db:`, err);
    throw err;
  }
}
