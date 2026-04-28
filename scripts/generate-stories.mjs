// scripts/generate-stories.mjs
// Run: ANTHROPIC_API_KEY=sk-ant-... node scripts/generate-stories.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORIES_DIR = path.join(__dirname, '../stories');
const INDEX_PATH = path.join(STORIES_DIR, 'index.json');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error('Missing ANTHROPIC_API_KEY'); process.exit(1); }

const CHAR_RANGES = { P1:'40–60', P2:'60–90', P3:'90–130', P4:'120–170', P5:'160–220', P6:'200–280' };

const PLAN = [
  { level:'P1', theme:'家人',     slug:'jiaren'     },
  { level:'P1', theme:'动物',     slug:'dongwu'     },
  { level:'P1', theme:'学校',     slug:'xuexiao'    },
  { level:'P1', theme:'节日',     slug:'jieri'      },
  { level:'P2', theme:'友谊',     slug:'youyi'      },
  { level:'P2', theme:'自然',     slug:'ziran'      },
  { level:'P2', theme:'帮助别人', slug:'bangzhu'    },
  { level:'P2', theme:'好习惯',   slug:'xiguan'     },
  { level:'P3', theme:'环境保护', slug:'huanjing'   },
  { level:'P3', theme:'社区助人', slug:'shequ'      },
  { level:'P3', theme:'运动健康', slug:'yundong'    },
  { level:'P3', theme:'节约用水', slug:'jieyue'     },
  { level:'P4', theme:'坚持不懈', slug:'jianchi'    },
  { level:'P4', theme:'传统文化', slug:'chuantong'  },
  { level:'P4', theme:'科技生活', slug:'keji'       },
  { level:'P4', theme:'爱心服务', slug:'aixin'      },
  { level:'P5', theme:'历史故事', slug:'lishi'      },
  { level:'P5', theme:'品德修养', slug:'pinde'      },
  { level:'P5', theme:'坚强意志', slug:'yizhi'      },
  { level:'P5', theme:'环球视野', slug:'huanqiu'    },
  { level:'P6', theme:'民族和谐', slug:'minzu'      },
  { level:'P6', theme:'社会责任', slug:'zeren'      },
  { level:'P6', theme:'科学探索', slug:'kexue'      },
  { level:'P6', theme:'生命价值', slug:'shengming'  },
];

async function generate(level, theme, id) {
  const levelNum = level.slice(1);
  const prompt = `Generate a short Chinese reading story for Singapore Primary ${levelNum} (${level}) students following MOE PSLE Chinese curriculum standards.

Theme: ${theme}
Length: approximately ${CHAR_RANGES[level]} Chinese characters (not counting punctuation).

Return ONLY valid JSON — no markdown, no code fences:
{
  "id": "${id}",
  "title": "[Chinese title, 2–6 characters]",
  "level": "${level}",
  "estMinutes": 3,
  "tags": ["tag1", "tag2"],
  "tokens": [{"char": "每", "pinyin": "měi"}, {"char": "，", "pinyin": ""}]
}

RULES:
1. Each token is ONE Chinese character OR one punctuation mark.
2. Pinyin uses Unicode diacritics (ā á ǎ à, ē é ě è, etc.).
3. Punctuation (。！？，：；""''—…《》) has empty pinyin "".
4. Particles: 的→"de" 地→"de" 得→"de" 了→"le" 着→"zhe" 过→"guo" 吗→"ma" 呢→"ne" 吧→"ba"
5. Age-appropriate, positive, aligned with Singapore PSLE ${level} vocabulary.
6. End with 。`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `API ${res.status}`); }

  const data = await res.json();
  let text = data.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const story = JSON.parse(text);
  if (!story.tokens?.length || !story.title) throw new Error('Invalid format');

  const cjk = story.tokens.filter(t => /[\u4e00-\u9fff]/.test(t.char));
  const withPinyin = cjk.filter(t => t.pinyin);
  if (withPinyin.length / cjk.length < 0.8) throw new Error(`Low pinyin: ${withPinyin.length}/${cjk.length}`);
  return story;
}

async function main() {
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const existingIds = new Set(index.map(s => s.id));
  let generated = 0;

  for (const { level, theme, slug } of PLAN) {
    const id = `${level.toLowerCase()}-${slug}`;
    if (existingIds.has(id)) { console.log(`  SKIP  ${id}`); continue; }

    process.stdout.write(`  GEN   ${level} ${theme} ... `);
    try {
      const story = await generate(level, theme, id);
      story.id = id;
      fs.writeFileSync(path.join(STORIES_DIR, `${id}.json`), JSON.stringify(story, null, 2), 'utf8');
      index.push({ id: story.id, title: story.title, level: story.level, estMinutes: story.estMinutes, tags: story.tags });
      existingIds.add(id);
      generated++;
      console.log(`✓ "${story.title}" (${story.tokens.filter(t => t.pinyin).length} chars)`);
    } catch (err) {
      console.log(`✗ ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  const LEVEL_ORDER = ['P1','P2','P3','P4','P5','P6'];
  index.sort((a, b) => (LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)) || a.id.localeCompare(b.id));
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n', 'utf8');
  console.log(`\nDone. ${generated} new stories. Total: ${index.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
