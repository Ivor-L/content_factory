const ERROR_MAP: Record<string, string> = {
  api_key_invalid: '接口凭证无效',
  insufficient_credits: '积分不足',
  missing_title_or_text_or_style_profile_json: '缺少必要输入',
  image_generate_or_upload_failed: '生图或上传失败，请重试',
};

const DEFAULT_ERROR_MESSAGE = '生成失败，请稍后重试';

function extractRequiredCredits(input: string): number | null {
  const match = input.match(/required\s*=\s*(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function mapTaskErrorMessage(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (lower.startsWith('insufficient_credits')) {
    const required = extractRequiredCredits(trimmed);
    return required != null ? `积分不足，至少需要 ${required} 积分` : ERROR_MAP.insufficient_credits;
  }

  if (ERROR_MAP[lower]) {
    return ERROR_MAP[lower];
  }

  return DEFAULT_ERROR_MESSAGE;
}
