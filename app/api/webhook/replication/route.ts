import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Replication Webhook received:", body);

    // Expected format from n8n: { task_id, status, result_url, error, ... }
    // We passed replication_id to n8n, so we expect it back as task_id or replication_id
    const taskId = body.task_id || body.taskId || body.id || body.replication_id || body.replicationId;
    const status = body.status;
    
    if (!taskId) {
      console.error("Webhook missing task_id", body);
      return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
    }

    const replication = await prisma.replication.findUnique({
      where: { id: taskId },
    });

    if (!replication) {
      console.error(`Replication task not found: ${taskId}`);
      return NextResponse.json({ error: "Replication task not found" }, { status: 404 });
    }

    let updateStatus = "completed";
    // If status is explicitly provided as failed/error, or if there is an error field
    if (status === "failed" || status === "error" || body.error) {
        updateStatus = "failed";
    }

    await prisma.replication.update({
      where: { id: taskId },
      data: {
        status: updateStatus,
        result: JSON.stringify(body), // Store full webhook payload
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
