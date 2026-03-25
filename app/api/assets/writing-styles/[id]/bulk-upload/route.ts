import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import prisma from "@/lib/prisma";
import { getRequestUserContext } from "@/lib/authServer";
import { getAssetBucket, writingStyleAssetPath } from "@/lib/storagePaths";
import { uploadToStorage } from "@/lib/storageUpload";
import { chunkWritingStyleText } from "@/lib/writingStyleChunker";

type Params = {
  params: Promise<{ id: string }>;
};

type RawRow = Record<string, unknown>;

type PreparedRow = {
  rowNumber: number;
  title: string;
  content: string;
  chunks: ReturnType<typeof chunkWritingStyleText>;
};

function normalizeSourceText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeKey(value: string) {
  return value
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-—–:：*（）()【】\[\]]+/g, "");
}

function asText(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function pickField(row: RawRow, aliases: string[]) {
  const keyMap = new Map<string, string>();
  for (const key of Object.keys(row)) {
    keyMap.set(normalizeKey(key), key);
  }
  for (const alias of aliases) {
    const found = keyMap.get(normalizeKey(alias));
    if (!found) continue;
    const text = asText(row[found]);
    if (text) return text;
  }
  return "";
}

function pickFieldByIndex(row: RawRow, indexes: number[]) {
  const entries = Object.entries(row);
  for (const index of indexes) {
    const entry = entries[index];
    if (!entry) continue;
    const text = asText(entry[1]);
    if (text) return text;
  }
  return "";
}

function parseRowsFromWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<RawRow>(worksheet, {
    defval: "",
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { userId, token } = await getRequestUserContext(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const style = await prisma.writingStyle.findFirst({
      where: { id, userId },
      select: { id: true, name: true, metadata: true },
    });
    if (!style) {
      return NextResponse.json({ error: "写作风格不存在" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const fileLike = file as Blob & { name?: string; type?: string };
    const filename =
      (typeof fileLike.name === "string" && fileLike.name.trim()) ||
      `writing-style-bulk-${Date.now()}.xlsx`;
    const extension = filename.split(".").pop()?.toLowerCase() || "";
    if (!["xlsx", "xls", "csv"].includes(extension)) {
      return NextResponse.json(
        { error: "仅支持 xlsx/xls/csv 批量上传" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) {
      return NextResponse.json({ error: "上传文件为空" }, { status: 400 });
    }

    let rows: RawRow[] = [];
    try {
      rows = parseRowsFromWorkbook(buffer);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? `Excel 解析失败：${error.message}`
              : "Excel 解析失败，请检查文件格式",
        },
        { status: 400 }
      );
    }
    if (!rows.length) {
      return NextResponse.json(
        { error: "Excel 没有有效数据，请先下载模版填写后再上传" },
        { status: 400 }
      );
    }

    if (rows.length > 300) {
      return NextResponse.json(
        { error: "单次最多上传 300 行，请拆分后重试" },
        { status: 400 }
      );
    }

    const preparedRows: PreparedRow[] = [];
    const failedRows: Array<{ rowNumber: number; reason: string }> = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const title =
        pickField(row, ["标题", "title", "名称", "name"]) ||
        pickFieldByIndex(row, [0]) ||
        `批量内容-${index + 1}`;
      const rawContent =
        pickField(row, ["内容", "正文", "文案", "content", "text"]) ||
        pickFieldByIndex(row, [1, 0]);
      const content = normalizeSourceText(rawContent);

      if (!content) {
        failedRows.push({ rowNumber, reason: "内容为空" });
        return;
      }

      const chunks = chunkWritingStyleText(content);
      if (!chunks.length) {
        failedRows.push({ rowNumber, reason: "内容有效长度不足 40 字，无法切片" });
        return;
      }

      preparedRows.push({
        rowNumber,
        title: title.trim() || `批量内容-${index + 1}`,
        content,
        chunks,
      });
    });

    if (!preparedRows.length) {
      return NextResponse.json(
        {
          error: "没有可入库的有效内容",
          data: { failedRows },
        },
        { status: 400 }
      );
    }

    const path = writingStyleAssetPath(userId, filename);
    let uploadedPath = path;
    let uploadedPublicUrl: string | null = null;
    let uploadWarning: string | null = null;
    try {
      const uploadResult = await uploadToStorage({
        bucket: getAssetBucket(),
        path,
        body: buffer,
        contentType:
          fileLike.type ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        accessToken: token,
      });
      uploadedPath = uploadResult.path;
      uploadedPublicUrl = uploadResult.publicUrl;
    } catch (error) {
      uploadWarning =
        error instanceof Error
          ? `原始文件存储失败，已跳过存储继续入库：${error.message}`
          : "原始文件存储失败，已跳过存储继续入库";
    }

    const now = new Date().toISOString();

    const created = await prisma.$transaction(async (tx) => {
      let createdDocuments = 0;
      let createdChunks = 0;
      let lastDocumentId: string | null = null;

      for (const row of preparedRows) {
        const document = await tx.writingStyleDocument.create({
          data: {
            styleId: style.id,
            userId,
            title: row.title,
            channel: null,
            sourceType: "bulk_excel",
            originalPath: uploadedPath,
            status: "READY",
            metadata: {
              sourceRow: row.rowNumber,
              sourceLength: row.content.length,
              chunkCount: row.chunks.length,
              originalFilename: filename,
              contentType: fileLike.type || null,
              publicUrl: uploadedPublicUrl,
              uploadedAt: now,
              uploadWarning,
            },
          },
        });

        await tx.writingStyleChunk.createMany({
          data: row.chunks.map((chunk) => ({
            styleId: style.id,
            documentId: document.id,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            contentLength: chunk.contentLength,
            cardType: "其他",
            riskLevel: "低",
            tags: [],
            status: "ACTIVE",
            metadata: {
              sourceType: "bulk_excel",
              sourceRow: row.rowNumber,
              title: row.title,
            },
          })),
        });

        createdDocuments += 1;
        createdChunks += row.chunks.length;
        lastDocumentId = document.id;
      }

      const totalChunks = await tx.writingStyleChunk.count({
        where: { styleId: style.id },
      });

      await tx.writingStyle.update({
        where: { id: style.id },
        data: {
          extractionStatus: "IDLE",
          metadata: {
            ...(style.metadata &&
            typeof style.metadata === "object" &&
            !Array.isArray(style.metadata)
              ? (style.metadata as Record<string, any>)
              : {}),
            lastUploadAt: now,
            lastDocumentId,
            totalChunks,
            lastBulkUpload: {
              filename,
              uploadedAt: now,
              rowCount: rows.length,
              createdDocuments,
              createdChunks,
              failedCount: failedRows.length,
            },
          },
        },
      });

      return {
        createdDocuments,
        createdChunks,
        totalChunks,
      };
    }, {
      // 批量上传会包含多次 document/chunk 写入，默认 5s 容易超时
      maxWait: 10_000,
      timeout: 120_000,
    });

    return NextResponse.json({
      data: {
        styleId: style.id,
        filename,
        rowCount: rows.length,
        createdDocuments: created.createdDocuments,
        createdChunks: created.createdChunks,
        totalChunks: created.totalChunks,
        failedRows,
        contentUrl: uploadedPublicUrl,
        uploadWarning,
      },
    });
  } catch (error) {
    console.error("[writing-styles/bulk-upload] failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `批量上传失败：${error.message}`
            : "批量上传失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}
