/**
 * Subtitle style templates for video generation
 * ASS (Advanced SubStation Alpha) format configurations
 *
 * Color format in ASS: &HAABBGGRR (alpha, blue, green, red in hex)
 * Examples:
 * - &H00FFFFFF = white
 * - &H00000000 = black
 * - &H0000FFFF = yellow
 * - &H00FF0000 = blue
 */

export interface SubtitleStyle {
  name: string;
  description: string;
  fontname: string;
  fontsize: number;
  primaryColor: string;  // Main text color
  secondaryColor: string;
  outlineColor: string;  // Border color
  backColor: string;     // Shadow color
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeOut: boolean;
  scaleX: number;        // Horizontal scale %
  scaleY: number;        // Vertical scale %
  spacing: number;       // Letter spacing
  angle: number;         // Rotation angle
  borderStyle: number;   // 1 = outline + shadow, 3 = box
  outline: number;       // Border thickness
  shadow: number;        // Shadow depth
  alignment: number;     // 1-9 numpad style (2=bottom center, 5=center, 8=top center)
  marginL: number;
  marginR: number;
  marginV: number;
}

export const SUBTITLE_TEMPLATES: Record<string, SubtitleStyle> = {
  jianying: {
    name: "剪映风格",
    description: "类似剪映的经典字幕样式，白色字体配黑色描边",
    fontname: "苹方-简",
    fontsize: 68,
    primaryColor: "&H00FFFFFF",   // White
    secondaryColor: "&H000000FF",
    outlineColor: "&H00000000",   // Black outline
    backColor: "&H80000000",      // Semi-transparent black shadow
    bold: true,
    italic: false,
    underline: false,
    strikeOut: false,
    scaleX: 100,
    scaleY: 100,
    spacing: 0,
    angle: 0,
    borderStyle: 1,
    outline: 3,
    shadow: 2,
    alignment: 2,  // Bottom center
    marginL: 30,
    marginR: 30,
    marginV: 60,   // 60px from bottom
  },

  minimal: {
    name: "简约风格",
    description: "简洁现代的字幕样式，适合专业内容",
    fontname: "Arial",
    fontsize: 48,
    primaryColor: "&H00FFFFFF",   // White
    secondaryColor: "&H000000FF",
    outlineColor: "&H00000000",   // Black outline
    backColor: "&H00000000",      // Black shadow
    bold: false,
    italic: false,
    underline: false,
    strikeOut: false,
    scaleX: 100,
    scaleY: 100,
    spacing: 0,
    angle: 0,
    borderStyle: 1,
    outline: 2,
    shadow: 0,
    alignment: 2,
    marginL: 40,
    marginR: 40,
    marginV: 50,
  },

  dramatic: {
    name: "戏剧风格",
    description: "醒目的黄色字体配红色描边，适合强调重点",
    fontname: "造字工房悦黑",
    fontsize: 80,
    primaryColor: "&H0000FFFF",   // Yellow
    secondaryColor: "&H000000FF",
    outlineColor: "&H000000FF",   // Blue outline
    backColor: "&H80000000",      // Semi-transparent black shadow
    bold: true,
    italic: false,
    underline: false,
    strikeOut: false,
    scaleX: 100,
    scaleY: 100,
    spacing: 2,
    angle: 0,
    borderStyle: 1,
    outline: 4,
    shadow: 3,
    alignment: 2,
    marginL: 20,
    marginR: 20,
    marginV: 70,
  },

  modern: {
    name: "现代风格",
    description: "清新的浅蓝色字体，适合科技类内容",
    fontname: "微软雅黑",
    fontsize: 56,
    primaryColor: "&H00FFFFFF",   // White
    secondaryColor: "&H000000FF",
    outlineColor: "&H00FF6600",   // Orange outline
    backColor: "&H80000000",
    bold: true,
    italic: false,
    underline: false,
    strikeOut: false,
    scaleX: 100,
    scaleY: 100,
    spacing: 1,
    angle: 0,
    borderStyle: 1,
    outline: 3,
    shadow: 2,
    alignment: 2,
    marginL: 30,
    marginR: 30,
    marginV: 55,
  },

  elegant: {
    name: "优雅风格",
    description: "细致的衬线字体，适合文艺类内容",
    fontname: "宋体",
    fontsize: 52,
    primaryColor: "&H00F0F0F0",   // Off-white
    secondaryColor: "&H000000FF",
    outlineColor: "&H00303030",   // Dark gray outline
    backColor: "&H80000000",
    bold: false,
    italic: false,
    underline: false,
    strikeOut: false,
    scaleX: 100,
    scaleY: 100,
    spacing: 3,
    angle: 0,
    borderStyle: 1,
    outline: 2,
    shadow: 1,
    alignment: 2,
    marginL: 50,
    marginR: 50,
    marginV: 45,
  },
};

/**
 * Generate ASS subtitle file header with specified style
 */
export function generateASSHeader(
  style: SubtitleStyle,
  videoWidth = 1080,
  videoHeight = 1920
): string {
  return `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontname},${style.fontsize},${style.primaryColor},${style.secondaryColor},${style.outlineColor},${style.backColor},${style.bold ? -1 : 0},${style.italic ? -1 : 0},${style.underline ? -1 : 0},${style.strikeOut ? -1 : 0},${style.scaleX},${style.scaleY},${style.spacing},${style.angle},${style.borderStyle},${style.outline},${style.shadow},${style.alignment},${style.marginL},${style.marginR},${style.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

/**
 * Format time in ASS format (H:MM:SS.CS)
 */
export function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100); // centiseconds

  return `${h}:${pad(m)}:${pad(s)}.${pad(cs, 2)}`;
}

function pad(num: number, size = 2): string {
  return String(num).padStart(size, '0');
}

/**
 * Generate a dialogue line for ASS subtitle
 */
export function generateDialogue(
  startTime: number,
  endTime: number,
  text: string,
  layer = 0
): string {
  const formattedStart = formatASSTime(startTime);
  const formattedEnd = formatASSTime(endTime);

  // Split long text into multiple lines (max 15 characters per line)
  const words = text.split('');
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += 15) {
    lines.push(words.slice(i, i + 15).join(''));
  }

  // Join with ASS line break (\\N)
  const formattedText = lines.join('\\N');

  return `Dialogue: ${layer},${formattedStart},${formattedEnd},Default,,0,0,0,,${formattedText}`;
}

/**
 * Generate complete ASS subtitle file content
 */
export interface SubtitleSegment {
  startTime: number;
  endTime: number;
  text: string;
}

export function generateASSSubtitle(
  segments: SubtitleSegment[],
  templateName: keyof typeof SUBTITLE_TEMPLATES = 'jianying',
  videoWidth = 1080,
  videoHeight = 1920
): string {
  const style = SUBTITLE_TEMPLATES[templateName];
  if (!style) {
    throw new Error(`Unknown subtitle template: ${templateName}`);
  }

  const header = generateASSHeader(style, videoWidth, videoHeight);
  const dialogues = segments
    .map((seg) => generateDialogue(seg.startTime, seg.endTime, seg.text))
    .join('\n');

  return header + dialogues + '\n';
}
