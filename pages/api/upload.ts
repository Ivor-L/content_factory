import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { promises as fs } from 'node:fs';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const BUCKET_NAME = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? 'uploads';
const SIZE_LIMIT = process.env.NEXT_UPLOAD_SIZE_LIMIT ?? '150mb';
const HAS_SERVICE_ROLE_KEY = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const IMAGE_FALLBACK_ENDPOINT =
  process.env.IMAGE_PROXY_UPLOAD_URL ??
  'https://imageproxy.zhongzhuan.chat/api/upload';
const IMAGE_FALLBACK_MAX_SIZE = parseSize(
  process.env.IMAGE_PROXY_MAX_SIZE ?? '50mb'
);

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseSize(limit: string): number {
  const match = limit.trim().match(/^(\d+(?:\.\d+)?)(kb|mb|gb)?$/i);
  if (!match) return 150 * 1024 * 1024;
  const value = parseFloat(match[1]);
  const unit = match[2]?.toLowerCase() ?? 'b';
  switch (unit) {
    case 'kb':
      return value * 1024;
    case 'mb':
      return value * 1024 * 1024;
    case 'gb':
      return value * 1024 * 1024 * 1024;
    default:
      return value;
  }
}

async function ensureBucket() {
  if (!HAS_SERVICE_ROLE_KEY) {
    // Without a service role key we assume the bucket already exists and skip admin calls.
    return;
  }
  const { error } = await supabaseAdmin.storage.getBucket(BUCKET_NAME);
  if (!error) return;
  const missing = error.status === 404 || /not\s+found/i.test(error.message ?? '');
  if (!missing) throw error;
  const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
    public: true,
  });
  if (createError && !/already exists/i.test(createError.message ?? '')) {
    throw createError;
  }
}

interface UploadError extends Error {
  status?: number;
}

function isImage(mime?: string | null) {
  return Boolean(mime?.startsWith('image/'));
}

async function uploadToSupabase(
  buffer: Buffer,
  filename: string,
  contentType: string
) {
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(filename, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    const err = new Error(
      error.message || 'Failed to upload file to Supabase'
    ) as UploadError;
    err.status = error.status;
    throw err;
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(BUCKET_NAME)
    .getPublicUrl(filename);

  return publicUrlData.publicUrl;
}

async function uploadViaImageProxy(
  buffer: Buffer,
  file: formidable.File
): Promise<string> {
  const formData = new FormData();
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], {
    type: file.mimetype ?? 'application/octet-stream',
  });

  formData.append('file', blob, file.originalFilename ?? 'upload');

  const response = await fetch(IMAGE_FALLBACK_ENDPOINT, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      `Image proxy upload failed with status ${response.status}`
    );
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Image proxy returned non-JSON payload');
  }

  const fallbackUrl =
    payload?.url ??
    payload?.data?.url ??
    payload?.result?.url ??
    null;

  if (!fallbackUrl) {
    throw new Error('Image proxy response missing url');
  }

  return fallbackUrl;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    await ensureBucket();
  } catch (error) {
    console.error('[upload] bucket check failed', error);
    return res.status(500).json({
      error: 'Failed to prepare storage bucket',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const form = formidable({
    multiples: false,
    keepExtensions: true,
    maxFileSize: parseSize(SIZE_LIMIT),
  });

  let file: formidable.File | undefined;
  try {
    file = await new Promise<formidable.File>((resolve, reject) => {
      form.parse(req, (err, _fields, files) => {
        if (err) {
          reject(err);
          return;
        }
        const received = Array.isArray(files.file) ? files.file[0] : (files.file as formidable.File | undefined);
        if (!received) {
          reject(new Error('No file uploaded'));
          return;
        }
        resolve(received);
      });
    });
  } catch (error) {
    console.error('[upload] form parse failed', error);
    return res.status(400).json({
      error: 'Invalid upload payload',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    const buffer = await fs.readFile(file.filepath);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const sanitizedName = (file.originalFilename ?? 'upload').replace(/[^a-zA-Z0-9.-]/g, '');
    const filename = `${uniqueSuffix}-${sanitizedName || 'file'}`;
    const contentType = file.mimetype ?? 'application/octet-stream';

    try {
      const url = await uploadToSupabase(buffer, filename, contentType);
      return res.status(200).json({ url });
    } catch (error) {
      const status = (error as UploadError).status;
      const canFallback =
        status === 413 &&
        isImage(contentType) &&
        buffer.length <= IMAGE_FALLBACK_MAX_SIZE;

      if (canFallback) {
        try {
          const url = await uploadViaImageProxy(buffer, file);
          return res.status(200).json({ url });
        } catch (fallbackError) {
          console.error('[upload] image proxy fallback failed', fallbackError);
          return res.status(500).json({
            error: 'Failed to upload image via fallback service',
            detail:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          });
        }
      }

      if (status === 413) {
        return res.status(413).json({
          error: 'File too large for Supabase Storage',
          detail:
            'Upstream storage rejected the upload. Please keep files within the configured limit.',
        });
      }

      throw error;
    }
  } catch (error) {
    console.error('[upload] storage error', error);
    return res.status(500).json({
      error: 'Failed to upload file',
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (file?.filepath) {
      await fs.unlink(file.filepath).catch(() => {});
    }
  }
}
