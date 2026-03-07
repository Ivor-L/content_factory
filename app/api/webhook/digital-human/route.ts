import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Digital Human Webhook received:", body);

    // Expected format from n8n: { task_id, status, video_url, error, ... }
    const taskId = body.task_id || body.taskId || body.id;
    const status = body.status;
    const videoUrl = body.video_url || body.videoUrl || body.result_url || body.resultUrl;
    
    if (!taskId) {
      console.error("Webhook missing task_id", body);
      return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
    }

    const task = await prisma.digitalHumanVideo.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      console.error(`Digital Human task not found: ${taskId}`);
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    let updateStatus = "COMPLETED";
    // If status is explicitly provided as failed/error, or if there is an error field
    if (status === "failed" || status === "error" || body.error) {
        updateStatus = "FAILED";
    }

    await prisma.digitalHumanVideo.update({
      where: { id: taskId },
      data: {
        status: updateStatus,
        resultUrl: videoUrl || task.resultUrl, // Update if provided
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
