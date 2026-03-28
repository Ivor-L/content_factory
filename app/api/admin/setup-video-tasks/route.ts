import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-setup-secret");
  if (secret !== process.env.SETUP_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.canvas_video_tasks (
        task_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        video_url TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pool.query(`
      ALTER TABLE public.canvas_video_tasks ENABLE ROW LEVEL SECURITY;
    `);

    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = 'canvas_video_tasks'
        ) THEN
          ALTER PUBLICATION supabase_realtime ADD TABLE public.canvas_video_tasks;
        END IF;
      END $$;
    `);

    return NextResponse.json({ ok: true, message: "canvas_video_tasks 表已创建，Realtime 已启用" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "执行失败" },
      { status: 500 },
    );
  } finally {
    await pool.end();
  }
}
