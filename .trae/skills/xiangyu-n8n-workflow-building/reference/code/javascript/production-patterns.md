# Production Code Patterns

Battle-tested Code node patterns extracted from real n8n production workflows. Each pattern solves a specific, recurring problem in data processing pipelines.

**Use Case**: When standard node configurations fall short and you need custom JavaScript logic for data cleaning, text processing, aggregation, or output formatting.

---

## Pattern 1: URL Normalization

**Use Case**: Cleaning URLs from e-commerce scraping, ad tracking, or multi-source data collection

**When to use:**
- Input URLs contain tracking parameters (utm_source, fbclid, gclid)
- Protocol inconsistency (mixed http/https)
- Trailing slashes causing duplicate detection failures
- URL-encoded characters breaking downstream matching

**Key Techniques**: URL API, parameter stripping, protocol enforcement, defensive parsing

### Complete Example

```javascript
// Mode: Run Once for All Items
// Clean and normalize URLs from scraped data
const items = $input.all();
const results = [];

// 追踪参数黑名单（按业务场景扩展）
const trackingParams = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'tag', 'fbclid', 'gclid', 'msclkid', 'dclid',
  'mc_cid', 'mc_eid', '_ga', '_gl'
];

for (const item of items) {
  let url = item.json.url || '';

  try {
    const urlObj = new URL(url);

    // 移除追踪参数
    trackingParams.forEach(p => urlObj.searchParams.delete(p));

    // 统一协议为 https
    urlObj.protocol = 'https:';

    // 移除尾部斜杠（保留根路径）
    url = urlObj.toString().replace(/\/$/, '');
  } catch (e) {
    // URL 格式异常，保留原值并标记
  }

  results.push({
    json: {
      ...item.json,
      url_clean: url,
      url_original: item.json.url
    }
  });
}

return results;
```

### Notes

- `new URL()` 对非法 URL 抛异常，必须 try-catch 包裹
- 追踪参数列表根据业务场景调整，电商场景需额外加入 `aff`、`clickid`
- 保留原始 `url` 字段，清洗后写入 `url_clean`，便于调试回溯
- 如需去重，可在下游用 `Remove Duplicates` 节点基于 `url_clean` 执行

---

## Pattern 2: HTML Cleanup + Entity Decode

**Use Case**: Cleaning HTML tags and encoded entities from scraped web content

**When to use:**
- Firecrawl / HTTP Request 返回的内容包含残留 HTML 标签
- 文本中混有 `&amp;` `&lt;` `&#39;` 等转义实体
- 需要纯文本用于 LLM 输入或数据库存储
- 多余空白字符影响下游文本分析

**Key Techniques**: Regex tag stripping, entity mapping, numeric entity decoding, whitespace normalization

### Complete Example

```javascript
// 通用 HTML 清理函数
function cleanHtml(text) {
  if (!text) return '';

  // 移除 HTML 标签
  let clean = text.replace(/<[^>]*>/g, '');

  // 解码命名实体
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>',
    '&quot;': '"', '&#39;': "'", '&apos;': "'",
    '&#x27;': "'", '&#x2F;': '/', '&nbsp;': ' '
  };

  for (const [entity, replacement] of Object.entries(entities)) {
    clean = clean.replace(new RegExp(entity, 'g'), replacement);
  }

  // 处理十进制数字实体 &#123;
  clean = clean.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));

  // 处理十六进制数字实体 &#x1F;
  clean = clean.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

  // 压缩连续空白为单个空格
  clean = clean.replace(/\s+/g, ' ').trim();

  return clean;
}

// 对指定字段执行清理
const items = $input.all();

return items.map(item => ({
  json: {
    ...item.json,
    title_clean: cleanHtml(item.json.title),
    description_clean: cleanHtml(item.json.description)
  }
}));
```

### Notes

- 命名实体表覆盖了 90% 的常见场景，极端情况可引入完整 HTML entities 列表
- 正则 `/<[^>]*>/g` 对嵌套标签有效，但对畸形 HTML（无闭合 `>`）可能误判
- 清理后的字段追加 `_clean` 后缀，保留原始字段用于调试
- 如果输入是完整 HTML 页面，建议先用 Firecrawl 的 markdown 模式，再用此 Pattern 做二次清理

---

## Pattern 3: N-gram Generation + Frequency Stats

**Use Case**: SEO keyword analysis, content frequency statistics, hot phrase discovery

**When to use:**
- 需要从大量文本中提取高频关键词
- SEO 分析中发现热门短语组合
- 竞品内容分析和关键词覆盖评估
- 中英文混合内容的词频统计

**Key Techniques**: Tokenization, sliding window, frequency counting, sorting with limit

### Complete Example

```javascript
// N-gram 生成器（支持中英文混合）
function generateNgrams(text, n) {
  const words = text.toLowerCase()
    .replace(/[^\w\s\u4e00-\u9fff]/g, '')  // 保留英文、数字、中文
    .split(/\s+/)
    .filter(w => w.length > 1);  // 过滤单字符噪音

  const ngrams = [];
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

// 频率统计（返回 Top N）
function countFrequency(arr, topN = 50) {
  const freq = {};
  arr.forEach(item => { freq[item] = (freq[item] || 0) + 1; });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, count]) => ({ term, count }));
}

// 合并所有输入文本
const items = $input.all();
const allText = items.map(i => i.json.content || '').join(' ');

// 生成 1/2/3-gram 频率
const unigrams = countFrequency(generateNgrams(allText, 1));
const bigrams = countFrequency(generateNgrams(allText, 2));
const trigrams = countFrequency(generateNgrams(allText, 3));

return [{
  json: {
    unigrams,
    bigrams,
    trigrams,
    total_words: allText.split(/\s+/).filter(Boolean).length
  }
}];
```

### Notes

- `filter(w => w.length > 1)` 过滤掉英文单字母和中文单字，减少噪音
- 中文分词此方案基于空格切分，精准分词需借助外部 API（如百度 NLP）
- `topN` 默认 50，SEO 场景建议 20-30，避免输出过长影响 LLM token 消耗
- 输出为单条聚合结果（Run Once for All Items），下游可直接传给 LLM 分析

---

## Pattern 4: XML Aggregate Builder

**Use Case**: Aggregating multiple items into XML structure for LLM context injection

**When to use:**
- 多条数据需要拼成结构化格式传给 LLM
- LLM System Prompt 中需要注入批量数据上下文
- XML 格式比 JSON 更适合 LLM 解析嵌套层级
- SEO 报告、竞品分析等需要多页面数据对比

**Key Techniques**: Template literals, XML construction, attribute injection, batch aggregation

### Complete Example

```javascript
// 将多条数据聚合为 XML 块
const items = $input.all();

const xmlParts = items.map((item, index) => {
  const d = item.json;
  return `<item index="${index + 1}">
  <title>${escapeXml(d.title || '')}</title>
  <url>${escapeXml(d.url || '')}</url>
  <description>${escapeXml(d.description || '')}</description>
  <metrics>
    <clicks>${d.clicks || 0}</clicks>
    <impressions>${d.impressions || 0}</impressions>
  </metrics>
</item>`;
});

// XML 转义函数
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const xmlBlock = `<data count="${items.length}">
${xmlParts.join('\n')}
</data>`;

return [{ json: { xml_content: xmlBlock, item_count: items.length } }];
```

### LLM Integration

```
System Prompt 中说明 XML 结构：
  "以下 <data> 包含 N 个页面的 SEO 数据，每个 <item> 包含标题、URL、描述和指标。"

User Message 引用：
  {{ $json.xml_content }}
```

### Notes

- 必须对内容做 XML 转义（`&` `<` `>` `"`），否则特殊字符会破坏 XML 结构
- XML 比 JSON 更适合 LLM 解析嵌套数据：标签名即语义，无需额外说明
- `escapeXml` 函数放在 `xmlParts.map` 之前声明，JavaScript 函数声明会提升
- 输出单条 `xml_content` 字符串，下游节点直接引用 `{{ $json.xml_content }}`

---

## Pattern 5: Parameterized Configuration

**Use Case**: Centralizing magic numbers and filter criteria in Code node top section

**When to use:**
- Code 节点内部有多个硬编码值需要统一管理
- 不想为简单配置额外创建 Set 节点
- 团队协作时需要快速定位可调参数
- 同一 Code 节点在不同工作流中复用，仅改配置

**Key Techniques**: Config object pattern, comment-based separation, declarative filtering

### Complete Example

```javascript
// ========== CONFIG（修改这里即可调整行为）==========
const CONFIG = {
  MAX_ITEMS: 100,             // 最大处理条数
  TIMEOUT_MS: 5000,           // 超时阈值（毫秒）
  RETRY_COUNT: 3,             // 重试次数
  OUTPUT_FORMAT: 'json',      // 输出格式：'json' | 'csv' | 'xml'
  FIELDS: ['title', 'url', 'description', 'price'],
  FILTERS: {
    minPrice: 0,              // 最低价格
    maxPrice: 10000,          // 最高价格
    excludeOutOfStock: true   // 排除缺货商品
  }
};
// ========== CONFIG END ==========

const items = $input.all().slice(0, CONFIG.MAX_ITEMS);

// 应用过滤规则
const filtered = items.filter(item => {
  const price = item.json.price || 0;
  if (price < CONFIG.FILTERS.minPrice || price > CONFIG.FILTERS.maxPrice) return false;
  if (CONFIG.FILTERS.excludeOutOfStock && !item.json.in_stock) return false;
  return true;
});

// 按配置字段提取
const mapped = filtered.map(item => {
  const result = {};
  CONFIG.FIELDS.forEach(f => { result[f] = item.json[f] || ''; });
  return { json: result };
});

return mapped;
```

### Best Practices

- CONFIG 对象放在文件最顶部，用 `==========` 注释分隔线标记边界
- 所有魔数（阈值、上限、格式）都收入 CONFIG，逻辑代码中零硬编码
- 每个配置项用行内注释说明可选值和单位
- 复用时只需复制 Code 节点并修改 CONFIG 区域，逻辑部分无需改动

---

## Pattern 6: Reduce with Validation

**Use Case**: Aggregating multiple items into a single result with upfront data integrity checks

**When to use:**
- 将多条数据聚合为单个汇总结果
- 聚合前需要校验数据完整性（缺失字段、类型错误）
- 需要分类统计和衍生计算（平均值、占比）
- 校验失败时需要返回详细错误信息而非静默忽略

**Key Techniques**: Pre-validation, reduce accumulator, derived metrics, early return on error

### Complete Example

```javascript
const items = $input.all();

// ---- 阶段一：校验 ----
const errors = [];

items.forEach((item, i) => {
  if (!item.json.id) errors.push(`Item ${i}: missing id`);
  if (!item.json.url) errors.push(`Item ${i}: missing url`);
  if (typeof item.json.duration !== 'number') errors.push(`Item ${i}: invalid duration`);
});

// 校验失败，立即返回错误报告
if (errors.length > 0) {
  return [{ json: { success: false, errors, error_count: errors.length } }];
}

// ---- 阶段二：聚合 ----
const result = items.reduce((acc, item) => {
  acc.total_duration += item.json.duration || 0;
  acc.ids.push(item.json.id);
  acc.urls.push(item.json.url);
  acc.count++;

  // 分类统计
  const type = item.json.type || 'unknown';
  acc.by_type[type] = (acc.by_type[type] || 0) + 1;

  return acc;
}, {
  total_duration: 0,
  ids: [],
  urls: [],
  count: 0,
  by_type: {},
  success: true
});

// ---- 阶段三：衍生计算 ----
result.avg_duration = result.count > 0
  ? Math.round(result.total_duration / result.count)
  : 0;

return [{ json: result }];
```

### Notes

- 先校验再聚合，校验失败直接 early return，避免脏数据进入 reduce
- reduce 初始值必须包含所有输出字段，确保空数据场景下结构完整
- 衍生计算（平均值、占比）放在 reduce 之后，避免累加器逻辑过于复杂
- `success: true/false` 字段便于下游 IF 节点做分支判断

---

## Choosing the Right Pattern

| Your Goal | Use Pattern |
|-----------|-------------|
| 清洗抓取的 URL | Pattern 1 (URL Normalization) |
| 去除 HTML 标签和转义 | Pattern 2 (HTML Cleanup) |
| 关键词频率和热门短语 | Pattern 3 (N-gram Stats) |
| 批量数据传给 LLM | Pattern 4 (XML Aggregate) |
| 集中管理配置参数 | Pattern 5 (Parameterized Config) |
| 校验后聚合为单条结果 | Pattern 6 (Reduce with Validation) |

**See Also**:
- [common-patterns.md](common-patterns.md) - 10 common Code node patterns
- [error-patterns.md](error-patterns.md) - Top 5 errors to avoid
- [data-access.md](data-access.md) - Data access methods
- [builtin-functions.md](builtin-functions.md) - Built-in helpers
