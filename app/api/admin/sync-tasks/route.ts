import { NextRequest, NextResponse } from "next/server";
import { syncAllTasks } from "@/lib/taskSummary";

/**
 * 管理员API：同步所有任务到 TaskSummary 表
 *
 * 使用方法:
 * POST /api/admin/sync-tasks
 * Headers: { "x-admin-token": "<ADMIN_TOKEN>" }
 * Body (可选): { "userId": "<user-id>" }
 */
export async function POST(request: NextRequest) {
  // 验证管理员权限
  const adminToken = request.headers.get("x-admin-token");
  const expectedToken = process.env.ADMIN_TOKEN;

  if (!expectedToken) {
    return NextResponse.json(
      { error: "Admin token not configured" },
      { status: 500 }
    );
  }

  if (adminToken !== expectedToken) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  let userId: string | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    userId = typeof body.userId === "string" ? body.userId : undefined;
  } catch {
    // 忽略 JSON 解析错误，使用默认值
  }

  try {
    console.log("开始同步任务到 TaskSummary 表...");
    if (userId) {
      console.log(`仅同步用户 ${userId} 的任务`);
    } else {
      console.log("同步所有用户的任务");
    }

    await syncAllTasks(userId);

    return NextResponse.json({
      success: true,
      message: "任务同步完成",
      userId: userId || "all",
    });
  } catch (error) {
    console.error("任务同步失败:", error);
    return NextResponse.json(
      {
        error: "Failed to sync tasks",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
