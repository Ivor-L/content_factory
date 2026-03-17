import prisma from "@/lib/prisma";

const SOURCE_REPO = "https://github.com/manwithshit/xhs-images";

type StyleSpec = Record<string, any>;

type Metadata = Record<string, any> | undefined;

export type SystemStylePreset = {
  id: string;
  slug: string;
  name: string;
  type: string;
  description: string;
  spec: StyleSpec;
  metadata?: Metadata;
  previewUrl?: string;
};

export const systemStylePresets: SystemStylePreset[] = [
  {
    id: "cd5d7c57-dc40-46f5-9db8-bb0534b9b056",
    slug: "cute",
    name: "Cute Visual",
    type: "xhs-visual",
    description: "Sweet, adorable, girly - classic Xiaohongshu aesthetic.",
    spec: {
      kind: "visual-style",
      slug: "cute",
      tone: "Sweet, adorable, girly",
      bestFor: ["Lifestyle", "Beauty", "Fashion", "Daily tips"],
      palette: [
        { name: "Pink", hex: "#FED7E2" },
        { name: "Peach", hex: "#FEEBC8" },
        { name: "Mint", hex: "#C6F6D5" },
        { name: "Lavender", hex: "#E9D8FD" }
      ],
      background: [
        { name: "Cream", hex: "#FFFAF0" },
        { name: "Soft pink", hex: "#FFF5F7" }
      ],
      accents: ["Hot pink", "Coral"],
      elements: [
        "Hearts",
        "Stars",
        "Sparkles",
        "Cute faces",
        "Ribbon decorations",
        "Sticker overlays"
      ],
      typography: {
        primary: "Rounded bubbly hand lettering",
        notes: "Playful headers with friendly subheads"
      },
      promptKit: {
        adjectives: ["sweet", "adorable", "sparkly", "girly"],
        instructions: "Use sticker-style layers, sparkles and soft gradients anchored by candy colors."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "girly"]
    },
    previewUrl: "/system-style-previews/cute.png"
  },
  {
    id: "ddf9c1d2-17c2-4782-a788-6f84453331cb",
    slug: "fresh",
    name: "Fresh Visual",
    type: "xhs-visual",
    description: "Clean, refreshing, natural palette for wellness and calm stories.",
    spec: {
      kind: "visual-style",
      slug: "fresh",
      tone: "Clean, refreshing, natural",
      bestFor: ["Health", "Wellness", "Minimalist lifestyle", "Self-care"],
      palette: [
        { name: "Mint", hex: "#9AE6B4" },
        { name: "Sky blue", hex: "#90CDF4" },
        { name: "Light yellow", hex: "#FAF089" }
      ],
      background: [
        { name: "Pure white", hex: "#FFFFFF" },
        { name: "Soft mint", hex: "#F0FFF4" }
      ],
      accents: ["Leaf green", "Water blue"],
      elements: ["Plant leaves", "Clouds", "Water drops", "Simple geometric shapes"],
      typography: {
        primary: "Clean light hand lettering",
        notes: "Give copy breathing room and airy spacing"
      },
      promptKit: {
        adjectives: ["fresh", "natural", "organic", "airy"],
        instructions: "Layer botanical doodles, soft gradients, and translucent bubbles to emphasize clarity."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "wellness"]
    },
    previewUrl: "/system-style-previews/fresh.png"
  },
  {
    id: "c78fc51a-74a3-44c8-ae56-5923ab674188",
    slug: "tech",
    name: "Tech Visual",
    type: "xhs-visual",
    description: "Modern, smart, digital aesthetic for AI and productivity breakdowns.",
    spec: {
      kind: "visual-style",
      slug: "tech",
      tone: "Modern, smart, digital",
      bestFor: ["Tech tutorials", "AI content", "Digital tools", "Productivity"],
      palette: [
        { name: "Deep blue", hex: "#1A365D" },
        { name: "Purple", hex: "#6B46C1" },
        { name: "Cyan", hex: "#00D4FF" }
      ],
      background: [
        { name: "Dark gray", hex: "#1A202C" },
        { name: "Near-black", hex: "#0D1117" }
      ],
      accents: ["Neon green #00FF88", "Electric blue"],
      elements: ["Circuit patterns", "Data icons", "Geometric grids", "Glowing effects"],
      typography: {
        primary: "Monospace-style hand lettering",
        notes: "Add subtle glow and high contrast captions"
      },
      promptKit: {
        adjectives: ["futuristic", "neon", "grid", "glow"],
        instructions: "Use dark-mode panels, HUD elements, and luminous strokes for premium tech energy."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "tech"]
    },
    previewUrl: "/system-style-previews/tech.png"
  },
  {
    id: "6461ba8a-1bc2-4ae9-b4b1-4aa063b5786c",
    slug: "warm",
    name: "Warm Visual",
    type: "xhs-visual",
    description: "Cozy, friendly palette for personal stories and heartfelt lessons.",
    spec: {
      kind: "visual-style",
      slug: "warm",
      tone: "Cozy, friendly, approachable",
      bestFor: ["Personal stories", "Life lessons", "Emotional content"],
      palette: [
        { name: "Warm orange", hex: "#ED8936" },
        { name: "Golden yellow", hex: "#F6AD55" },
        { name: "Terracotta", hex: "#C05621" }
      ],
      background: [
        { name: "Cream", hex: "#FFFAF0" },
        { name: "Soft peach", hex: "#FED7AA" }
      ],
      accents: ["Deep brown #744210", "Soft red"],
      elements: ["Sun rays", "Coffee cups", "Cozy props", "Warm light swashes"],
      typography: {
        primary: "Friendly rounded hand lettering",
        notes: "Pair with handwritten annotations"
      },
      promptKit: {
        adjectives: ["cozy", "friendly", "sunny", "approachable"],
        instructions: "Use warm gradients, doodled sunbursts, and personal objects to create intimacy."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "warm"]
    },
    previewUrl: "/system-style-previews/warm.png"
  },
  {
    id: "f4223b3d-e12a-4c60-8556-ae8bc5ba9cf6",
    slug: "bold",
    name: "Bold Visual",
    type: "xhs-visual",
    description: "High impact warning-board look for urgent messages and announcements.",
    spec: {
      kind: "visual-style",
      slug: "bold",
      tone: "High impact, attention-grabbing",
      bestFor: ["Important tips", "Warnings", "Must-know content"],
      palette: [
        { name: "Vibrant red", hex: "#E53E3E" },
        { name: "Orange", hex: "#DD6B20" },
        { name: "Yellow", hex: "#F6E05E" }
      ],
      background: [
        { name: "Deep black", hex: "#000000" },
        { name: "Dark charcoal", hex: "#18181B" }
      ],
      accents: ["White", "Neon yellow"],
      elements: ["Exclamation icons", "Heavy arrows", "Caution tape", "Strong blocks"],
      typography: {
        primary: "Bold impactful hand lettering",
        notes: "Use drop shadows and outlined keywords"
      },
      promptKit: {
        adjectives: ["alert", "urgent", "high-contrast"],
        instructions: "Contrast neon accents on black, add caution frames, and emphasize hierarchy with large numerals."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "alert"]
    },
    previewUrl: "/system-style-previews/bold.png"
  },
  {
    id: "a3455f92-ca95-45dd-9cdd-6d2172fb0e8f",
    slug: "minimal",
    name: "Minimal Visual",
    type: "xhs-visual",
    description: "Ultra-clean, sophisticated white-space heavy layout.",
    spec: {
      kind: "visual-style",
      slug: "minimal",
      tone: "Ultra-clean, sophisticated",
      bestFor: ["Professional content", "Serious topics", "Elegant presentations"],
      palette: [
        { name: "Black", hex: "#000000" },
        { name: "White", hex: "#FFFFFF" }
      ],
      background: [
        { name: "Off-white", hex: "#FAFAFA" },
        { name: "Pure white", hex: "#FFFFFF" }
      ],
      accents: ["Brand accent color"],
      elements: ["Single focal point", "Thin lines", "Maximum whitespace"],
      typography: {
        primary: "Clean simple lettering",
        notes: "Use thin sans serif strokes and generous margins"
      },
      promptKit: {
        adjectives: ["minimal", "sophisticated", "gallery", "white space"],
        instructions: "Leave 60%+ whitespace, highlight a single hero element, and keep decorations extremely restrained."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "minimal"]
    },
    previewUrl: "/system-style-previews/minimal.png"
  },
  {
    id: "518dc6a3-c5d1-4873-9af8-682d7c577fe7",
    slug: "retro",
    name: "Retro Visual",
    type: "xhs-visual",
    description: "Vintage, nostalgic treatment with muted film colors.",
    spec: {
      kind: "visual-style",
      slug: "retro",
      tone: "Vintage, nostalgic, trendy",
      bestFor: ["Throwback content", "Classic tips", "Timeless advice"],
      palette: [
        { name: "Muted orange", hex: "#E4A672" },
        { name: "Dusty pink", hex: "#E8B4C9" },
        { name: "Faded teal", hex: "#6FA7A7" }
      ],
      background: [
        { name: "Aged paper", hex: "#F5E6D3" },
        { name: "Sepia", hex: "#E0C9A6" }
      ],
      accents: ["Faded red", "Vintage gold"],
      elements: ["Halftone dots", "Vintage badges", "Tape effects", "Retro icons"],
      typography: {
        primary: "Vintage-style hand lettering",
        notes: "Add subtle texture and offset shadows"
      },
      promptKit: {
        adjectives: ["vintage", "nostalgic", "film"],
        instructions: "Blend halftone backgrounds with off-white papers, rounded rectangles, and analog ephemera."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "retro"]
    },
    previewUrl: "/system-style-previews/retro.png"
  },
  {
    id: "92766c97-3dcb-4da4-897a-5f586e147a79",
    slug: "pop",
    name: "Pop Visual",
    type: "xhs-visual",
    description: "Vibrant, energetic comic-inspired panels for exciting drops.",
    spec: {
      kind: "visual-style",
      slug: "pop",
      tone: "Vibrant, energetic, eye-catching",
      bestFor: ["Announcements", "Fun facts", "Engaging tutorials"],
      palette: [
        { name: "Bright red", hex: "#F56565" },
        { name: "Yellow", hex: "#ECC94B" },
        { name: "Blue", hex: "#4299E1" },
        { name: "Green", hex: "#48BB78" }
      ],
      background: [{ name: "White", hex: "#FFFFFF" }],
      accents: ["Neon pink", "Electric purple"],
      elements: ["Bold shapes", "Speech bubbles", "Comic starburst", "Sticker strokes"],
      typography: {
        primary: "Dynamic energetic lettering",
        notes: "Outline and shadow type for depth"
      },
      promptKit: {
        adjectives: ["comic", "energetic", "burst", "bold"],
        instructions: "Use halftone overlays, sticker badges, and diagonal grids for kinetic energy."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "pop"]
    },
    previewUrl: "/system-style-previews/pop.png"
  },
  {
    id: "3a8f6ca1-661d-4b21-acf7-49f25aa520e5",
    slug: "notion",
    name: "Notion Visual",
    type: "xhs-visual",
    description: "Minimalist hand-drawn line art, intellectual productivity vibe.",
    spec: {
      kind: "visual-style",
      slug: "notion",
      tone: "Minimalist hand-drawn line art",
      bestFor: ["Knowledge sharing", "Concept explanations", "SaaS content", "Productivity tips"],
      palette: [
        { name: "Black", hex: "#1A1A1A" },
        { name: "Dark gray", hex: "#4A4A4A" }
      ],
      accents: [
        { name: "Pastel blue", hex: "#A8D4F0" },
        { name: "Pastel yellow", hex: "#F9E79F" },
        { name: "Pastel pink", hex: "#FADBD8" }
      ],
      background: [
        { name: "Pure white", hex: "#FFFFFF" },
        { name: "Off-white", hex: "#FAFAFA" }
      ],
      elements: ["Simple line doodles", "Hand-drawn wobble effect", "Geometric shapes", "Stick figures"],
      typography: {
        primary: "Clean hand-drawn lettering",
        notes: "Pair with simple sans-serif labels"
      },
      promptKit: {
        adjectives: ["notion", "line art", "diagram", "hand-drawn"],
        instructions: "Use monochrome strokes, notebook margin grids, and airy annotations like a Notion template."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "notion"]
    },
    previewUrl: "/system-style-previews/notion.png"
  },
  {
    id: "3448ae11-5238-4b80-b683-50447ad1cd8d",
    slug: "productivity",
    name: "Productivity Visual",
    type: "xhs-visual",
    description: "Structured, clean light-mode system optimized for workflows and SOPs.",
    spec: {
      kind: "visual-style",
      slug: "productivity",
      tone: "Structured, clean, light mode",
      bestFor: ["How-to tutorials", "Tool recommendations", "SOPs", "Workflows"],
      palette: [
        { name: "White", hex: "#FFFFFF" },
        { name: "Very light gray", hex: "#F5F5F7" },
        { name: "Accent blue", hex: "#2979FF" }
      ],
      background: [
        { name: "Clean white", hex: "#FFFFFF" },
        { name: "Subtle grid", hex: "#F7F7FB" }
      ],
      accents: ["Soft shadow rgba(0,0,0,0.1)", "UI stroke #E0E0E0"],
      elements: ["Modern UI cards", "Rounded corners 16px", "3D floating mockups", "Step badges", "Emoji callouts"],
      typography: {
        primary: "Modern sans-serif (Inter/Roboto)",
        notes: "Bold headings with readable body copy"
      },
      promptKit: {
        adjectives: ["saas", "ui", "clean", "workflow"],
        reference: "60_Published/xiaohongshu/260115.../xhs-images/01-cover_good.png",
        instructions: "Lay out cards like a Notion dashboard, add floating UI windows and numbered badges."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "productivity"]
    },
    previewUrl: "/system-style-previews/productivity.png"
  },
  {
    id: "97fa1496-1dec-4165-9362-631fa3e434eb",
    slug: "insight",
    name: "Insight Visual",
    type: "xhs-visual",
    description: "High clarity dark-mode presentation for deep thoughts and mental models.",
    spec: {
      kind: "visual-style",
      slug: "insight",
      tone: "High clarity, premium dark mode",
      bestFor: ["Mental models", "Cognitive awakenings", "Strong opinions", "Quotes"],
      palette: [
        { name: "Pure black", hex: "#000000" },
        { name: "Dark charcoal", hex: "#121212" },
        { name: "High contrast white", hex: "#FFFFFF" }
      ],
      background: [{ name: "Solid black", hex: "#000000" }],
      accents: ["Subtle metallic silver", "Muted gold"],
      elements: ["High-contrast B&W photography", "Minimalist symbols", "Heavy typographic blocks"],
      typography: {
        primary: "Bold sans-serif or elegant serif",
        notes: "Use oversized quotes and tight tracking"
      },
      promptKit: {
        adjectives: ["premium", "dark mode", "philosophy"],
        reference: "60_Published/xiaohongshu/260118.../xhs-images/cover.png",
        instructions: "Frame content like a Dan Koe slide: stark contrast, spotlight typography, minimal icons."
      },
      source: SOURCE_REPO
    },
    metadata: {
      category: "visual-style",
      tags: ["visual-style", "xiaohongshu", "insight"]
    },
    previewUrl: "/system-style-previews/insight.png"
  },
  {
    id: "98c3f88b-1088-4993-bf00-3757ac405617",
    slug: "sparse",
    name: "Sparse Layout",
    type: "xhs-layout",
    description: "Minimal information, maximum impact layout for covers and quotes.",
    spec: {
      kind: "info-layout",
      slug: "sparse",
      density: "Very low (1-2 points)",
      whitespace: "60-70%",
      structure: "Single centered focal point",
      textElements: "Title only, or title plus one subtitle/tagline",
      visualBalance: "Centered and symmetrical with breathing room",
      bestFor: ["Covers", "Quotes", "Impactful statements", "Emotional content"],
      bestPairings: ["cute", "bold", "minimal", "notion"],
      arrangement: "Place hero line in center, keep everything spacious.",
      instructions: "Use one statement or quote with abundant breathing room and a small supporting mark.",
      source: SOURCE_REPO
    },
    metadata: {
      category: "info-layout",
      tags: ["layout", "xiaohongshu"]
    },
    previewUrl: "/system-style-previews/sparse.png"
  },
  {
    id: "9c435c84-042e-4e03-9752-9136ec8eb6ec",
    slug: "balanced",
    name: "Balanced Layout",
    type: "xhs-layout",
    description: "Standard Xiaohongshu density for 3-4 key points below a hero title.",
    spec: {
      kind: "info-layout",
      slug: "balanced",
      density: "Medium (3-4 points)",
      whitespace: "40-50%",
      structure: "Title at top, content sections below",
      textElements: "Title plus 3-4 bullet points or key messages",
      visualBalance: "Top-weighted title with evenly distributed blocks",
      bestFor: ["Regular posts", "Tutorials", "Explanations"],
      bestPairings: ["all"],
      arrangement: "Stack sections vertically with consistent spacing.",
      instructions: "Anchor a bold title bar and split remaining content into 3-4 equal modules.",
      source: SOURCE_REPO
    },
    metadata: {
      category: "info-layout",
      tags: ["layout", "xiaohongshu"]
    },
    previewUrl: "/system-style-previews/balanced.png"
  },
  {
    id: "d6b10cd7-d97a-4abd-98e4-24c82adaaf9e",
    slug: "dense",
    name: "Dense Layout",
    type: "xhs-layout",
    description: "High information density cheat-sheet style grid.",
    spec: {
      kind: "info-layout",
      slug: "dense",
      density: "High (5-8 points)",
      whitespace: "20-30%",
      structure: "Multi-section grid or stacked blocks",
      textElements: "Title plus multiple section headers with bullets",
      visualBalance: "Organized chaos with clear section boundaries",
      bestFor: ["Summary cards", "Cheat sheets", "Comprehensive guides"],
      bestPairings: ["tech", "notion", "minimal"],
      arrangement: "Create a grid with dividers and keep typography compact but readable.",
      instructions: "Use card tiles or 2x3 grids, align sections precisely, and keep consistent iconography.",
      source: SOURCE_REPO
    },
    metadata: {
      category: "info-layout",
      tags: ["layout", "xiaohongshu"]
    },
    previewUrl: "/system-style-previews/dense.png"
  },
  {
    id: "1f9ebf48-f39b-477b-8058-536507892bf6",
    slug: "list",
    name: "List Layout",
    type: "xhs-layout",
    description: "Enumeration/ ranking format with clear numbered hierarchy.",
    spec: {
      kind: "info-layout",
      slug: "list",
      density: "Medium-high (4-7 items)",
      whitespace: "30-40%",
      structure: "Vertical enumeration with numbers or bullets",
      textElements: "Title plus numbered/bulleted items",
      visualBalance: "Left-aligned list with bold numerals",
      bestFor: ["Top N lists", "Checklists", "Step-by-step guides", "Rankings"],
      bestPairings: ["all", "cute", "bold"],
      arrangement: "Use large numerals or badges on left, keep text blocks aligned.",
      instructions: "Design as a vertical ladder with equal spacing, highlight each number with color chips.",
      source: SOURCE_REPO
    },
    metadata: {
      category: "info-layout",
      tags: ["layout", "xiaohongshu"]
    },
    previewUrl: "/system-style-previews/list.png"
  },
  {
    id: "b0468f08-528d-43dd-a466-35ab63cbd85d",
    slug: "comparison",
    name: "Comparison Layout",
    type: "xhs-layout",
    description: "Side-by-side contrast view for before/after or decision helpers.",
    spec: {
      kind: "info-layout",
      slug: "comparison",
      density: "Medium (2x2-4 points)",
      whitespace: "30-40%",
      structure: "Two-column split with center divider",
      textElements: "Title plus left/right labels and mirrored points",
      visualBalance: "Symmetrical left/right with clear divider",
      bestFor: ["Comparisons", "Transformations", "Decision helpers"],
      bestPairings: ["bold", "tech", "warm"],
      arrangement: "Split canvas exactly in half, mirror bullet count, emphasize contrast colors.",
      instructions: "Add labels at top of each column, connect sections with icons, highlight differences.",
      source: SOURCE_REPO
    },
    metadata: {
      category: "info-layout",
      tags: ["layout", "xiaohongshu"]
    },
    previewUrl: "/system-style-previews/comparison.png"
  },
  {
    id: "0b09efe2-edb7-4209-8313-43657df52571",
    slug: "flow",
    name: "Flow Layout",
    type: "xhs-layout",
    description: "Process / timeline arrangement with arrows and connected nodes.",
    spec: {
      kind: "info-layout",
      slug: "flow",
      density: "Medium (3-6 steps)",
      whitespace: "30-40%",
      structure: "Connected nodes with directional arrows",
      textElements: "Title plus step labels and optional descriptions",
      visualBalance: "Directional flow (top-bottom or left-right)",
      bestFor: ["Processes", "Timelines", "Cause-effect chains", "Workflows"],
      bestPairings: ["tech", "notion", "fresh"],
      arrangement: "Use arrows or connectors between steps, optionally number each stage.",
      instructions: "Lay out steps along a path, include icons per node, ensure arrow direction is obvious.",
      source: SOURCE_REPO
    },
    metadata: {
      category: "info-layout",
      tags: ["layout", "xiaohongshu"]
    },
    previewUrl: "/system-style-previews/flow.png"
  }
];

let seedPromise: Promise<void> | null = null;

export async function ensureSystemStylePresetsSeeded() {
  if (!seedPromise) {
    seedPromise = seedSystemStylePresets();
  }
  return seedPromise;
}

async function seedSystemStylePresets() {
  for (const preset of systemStylePresets) {
    await prisma.stylePreset.upsert({
      where: { id: preset.id },
      create: {
        id: preset.id,
        userId: null,
        name: preset.name,
        type: preset.type,
        description: preset.description,
        spec: preset.spec,
        previewUrl: preset.previewUrl,
        metadata: buildMetadata(preset),
      },
      update: {
        name: preset.name,
        type: preset.type,
        description: preset.description,
        spec: preset.spec,
        previewUrl: preset.previewUrl,
        metadata: buildMetadata(preset),
      },
    });
  }
}

function buildMetadata(preset: SystemStylePreset) {
  return {
    slug: preset.slug,
    source: SOURCE_REPO,
    processingStatus: "COMPLETED",
    ...preset.metadata,
  };
}
