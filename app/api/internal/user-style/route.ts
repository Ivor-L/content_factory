import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/**
 * GET /api/internal/user-style?user_id={userId}
 * 供 n8n 工作流获取用户写作风格（优先新写作风格模块，其次兼容旧历史文案）
 * 鉴权：x-admin-token header
 */
export async function GET(request: NextRequest) {
  const adminToken = request.headers.get("x-admin-token");
  const expectedToken = process.env.ADMIN_TOKEN;

  if (!expectedToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  if (!userId) {
    return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  }

  // 1) 优先读取新模块：写作风格 + 切片 + 提炼 profile
  const writingStyles = await prisma.writingStyle.findMany({
    where: {
      userId,
      extractionStatus: "READY",
    },
    include: {
      currentProfile: {
        select: {
          id: true,
          profileJson: true,
          sampleGaps: true,
          sampleImprovement: true,
        },
      },
      chunks: {
        where: { status: "ACTIVE" },
        select: {
          id: true,
          content: true,
          cardType: true,
          score: true,
          riskLevel: true,
        },
        orderBy: [{ updatedAt: "desc" }, { chunkIndex: "asc" }],
        take: 80,
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  if (writingStyles.length > 0) {
    const styleSummaries: unknown[] = [];
    const writingBlocks: unknown[] = [];
    const caseBanks: unknown[] = [];
    const rawTextExcerpts: { docTitle: string; text: string }[] = [];

    for (const style of writingStyles) {
      const profileJson = asRecord(style.currentProfile?.profileJson);
      if (Object.keys(profileJson).length > 0) {
        styleSummaries.push({
          docTitle: style.name,
          ...profileJson,
          _meta: {
            sample_gaps: style.currentProfile?.sampleGaps ?? null,
            sample_improvement: style.currentProfile?.sampleImprovement ?? null,
          },
        });
      }

      const structureTemplates = Array.isArray(profileJson?.structure_bank?.templates)
        ? profileJson.structure_bank.templates
        : [];
      if (structureTemplates.length > 0) {
        writingBlocks.push(...structureTemplates);
      }

      for (const chunk of style.chunks) {
        caseBanks.push({
          id: chunk.id,
          type: chunk.cardType || "其他",
          score: chunk.score ?? null,
          risk: chunk.riskLevel || "低",
          raw_text: chunk.content,
        });

        if (typeof chunk.content === "string" && chunk.content.trim().length > 20) {
          rawTextExcerpts.push({
            docTitle: style.name,
            text: chunk.content.trim().slice(0, 400),
          });
        }
      }
    }

    const hasData =
      styleSummaries.length > 0 || writingBlocks.length > 0 || caseBanks.length > 0;
    const isInsufficient = !hasData || caseBanks.length < 2;

    return NextResponse.json({
      data: {
        source: "writing_styles",
        hasData,
        isInsufficient,
        docCount: writingStyles.length,
        caseCount: caseBanks.length,
        styleSummaries,
        writingBlocks,
        caseBanks,
        rawTextExcerpts,
      },
    });
  }

  // 2) 兼容旧模块：历史文案派生
  const docs = await prisma.historyDoc.findMany({
    where: {
      userId,
      status: "READY",
    },
    select: {
      id: true,
      title: true,
      channel: true,
      latestDerivative: {
        select: {
          styleSummary: true,
          writingBlocks: true,
          caseBank: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const styleSummaries: unknown[] = [];
  const writingBlocks: unknown[] = [];
  const caseBanks: unknown[] = [];
  const rawTextExcerpts: { docTitle: string; text: string }[] = [];

  for (const doc of docs) {
    const d = doc.latestDerivative;
    if (!d) continue;
    if (d.styleSummary) {
      styleSummaries.push({ docTitle: doc.title, ...((d.styleSummary as object) ?? {}) });
    }
    if (d.writingBlocks) {
      writingBlocks.push(...(Array.isArray(d.writingBlocks) ? d.writingBlocks : [d.writingBlocks]));
    }

    const cases = d.caseBank
      ? (Array.isArray(d.caseBank) ? d.caseBank : [d.caseBank])
      : [];

    for (const c of cases) {
      caseBanks.push(c);
      const raw =
        (c as any)?.raw_text ||
        (c as any)?.text ||
        (c as any)?.content ||
        (c as any)?.excerpt ||
        "";
      if (raw && typeof raw === "string" && raw.trim().length > 20) {
        rawTextExcerpts.push({ docTitle: doc.title, text: raw.trim().slice(0, 400) });
      }
    }
  }

  const hasData =
    styleSummaries.length > 0 || writingBlocks.length > 0 || caseBanks.length > 0;
  const isInsufficient = !hasData || caseBanks.length < 2;

  return NextResponse.json({
    data: {
      source: "history_docs",
      hasData,
      isInsufficient,
      docCount: docs.length,
      caseCount: caseBanks.length,
      styleSummaries,
      writingBlocks,
      caseBanks,
      rawTextExcerpts,
    },
  });
}
