import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { resolveUserApiKey } from "@/lib/userApiKey";
import { deductCredits } from "@/lib/credits";
import { getCreditCost } from "@/lib/creditCosts";
import { logCreditUsage } from "@/lib/logCreditUsage";

/**
 * Merge storyboard segments into final video with optional subtitles
 * POST /api/storyboard/[id]/merge
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId, apiKey: contextApiKey } = await getRequestUserContext(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const {
      segmentIds,
      enableSubtitles = true,
      subtitleTemplate = "jianying",
    } = body;

    console.log("[merge-video] Request:", {
      task_id: id,
      segmentIds,
      enableSubtitles,
      subtitleTemplate,
      userId,
    });

    // 1. Verify task exists and belongs to user
    const task = await prisma.storyboardTask.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found or unauthorized" },
        { status: 404 }
      );
    }

    // 2. Get segments with videos ready
    const segments = await prisma.storyboardSegment.findMany({
      where: {
        taskId: id,
        status: "VIDEO_READY",
        ...(segmentIds && segmentIds.length > 0
          ? { id: { in: segmentIds } }
          : {}),
      },
      orderBy: { order: "asc" },
    });

    if (segments.length === 0) {
      return NextResponse.json(
        { error: "No segments with videos ready found" },
        { status: 404 }
      );
    }

    console.log("[merge-video] Merging segments:", {
      count: segments.length,
      enableSubtitles,
    });

    // 3. Prepare segment data for n8n workflow
    const segmentData = segments.map((seg, idx) => {
      let startTime = 0;
      for (let i = 0; i < idx; i++) {
        startTime += segments[i].duration;
      }

      return {
        segment_id: seg.id,
        order: seg.order,
        video_url: seg.generatedVideo,
        script: seg.rewrittenScript || seg.originalScript || "",
        duration: seg.duration,
        start_time: startTime,
        time_range: seg.timeRange,
      };
    });

    // 4. Get webhook URL
    const webhookUrl = process.env.N8N_VIDEO_MERGE_WEBHOOK;
    if (!webhookUrl) {
      console.error("[merge-video] N8N_VIDEO_MERGE_WEBHOOK not configured");
      return NextResponse.json(
        { error: "Video merge service not configured" },
        { status: 500 }
      );
    }

    // 5. Trigger n8n merge workflow
    const callbackUrl = `${process.env.N8N_CALLBACK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL}/api/webhook/storyboard-merge`;
    const payload = {
      task_id: id,
      segments: segmentData,
      enable_subtitles: enableSubtitles,
      subtitle_template: subtitleTemplate,
      callback_url: callbackUrl,
      admin_token: process.env.ADMIN_TOKEN,
      workflow_id: "storyboard_video_merge",
    };

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Merge webhook failed: ${response.status}`);
      }

      // 6. Update task status
      await prisma.storyboardTask.update({
        where: { id },
        data: {
          status: "MERGING",
          progress: 95,
          enableSubtitles,
          subtitleTemplate: enableSubtitles ? subtitleTemplate : null,
        },
      });

      // 7. 扣除积分（拼接 + 字幕各计一次）
      const apiKey = await resolveUserApiKey({ userId, explicitApiKey: contextApiKey, allowDefaultFallback: false });
      if (apiKey) {
        const mergeAmount = await getCreditCost("storyboard_merge", 1);
        deductCredits(apiKey, {
          amount: mergeAmount,
          reason: "storyboard_merge",
          workflowId: "storyboard_video_merge",
          workflowName: "分镜视频拼接",
        }).catch((e) => console.error("[merge-video] deduct merge credits failed:", e));
        logCreditUsage({ featureKey: "storyboard_merge", userId, amount: mergeAmount, success: true });

        if (enableSubtitles) {
          const subtitleAmount = await getCreditCost("storyboard_subtitle", 1);
          deductCredits(apiKey, {
            amount: subtitleAmount,
            reason: "storyboard_subtitle",
            workflowId: "storyboard_video_merge",
            workflowName: "分镜字幕生成",
          }).catch((e) => console.error("[merge-video] deduct subtitle credits failed:", e));
          logCreditUsage({ featureKey: "storyboard_subtitle", userId, amount: subtitleAmount, success: true });
        }
      }

      console.log("[merge-video] Merge workflow triggered:", {
        task_id: id,
        segmentCount: segments.length,
      });

      return NextResponse.json({
        success: true,
        task_id: id,
        segment_count: segments.length,
        enable_subtitles: enableSubtitles,
        message: "Video merge started",
      });
    } catch (error) {
      console.error("[merge-video] Failed to trigger workflow:", error);
      return NextResponse.json(
        {
          error: "Failed to start merge process",
          message: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[merge-video] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
