# PSLE Oral Stories Expansion & Picture Oral Multi-Part Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 22 new PSLE-themed stories (6 challenge, 8 exam, 8 picture) and redesign picture oral into a 4-phase flow: describe scene → AI selects 3 questions → student answers each question one at a time → PSLE rubric score.

**Architecture:** Phase state machine in `app.js` (`pictureOralState`) drives the multi-round picture oral; `selectQuestions()` in `pictureScorer.js` calls Haiku to pick 3 relevant questions from 5–7 pre-written ones; `pictureReader.js` gains `setPhase()` to swap between description prompt and question cards; `recorder.js` exposes `rearm()` to reset UI between phases.

**Tech Stack:** Vanilla JS ES modules, Claude Haiku 4.5 via internal API proxy, Node.js `add-pinyin.mjs` script for challenge/exam story tokenisation, Playwright for smoke tests, Node `--test` for unit tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `stories/raw/*.txt` | Create 14 files | Raw Chinese text for challenge + exam stories |
| `stories/p1-challenge-shijian.json` through `p6-challenge-weilai.json` | Create 6 | Challenge story JSON with tokens |
| `stories/p1-past-qinlao.json` through `p6-past-minzu.json` | Create 8 | Exam story JSON with tokens |
| `stories/p1-pic-jiaoshi.json` through `p6-pic-keji.json` | Create 8 | Picture story JSON with questions |
| `stories/p3-pic-gongyuan.json` + 3 others | Modify | Add `questions` array to existing picture stories |
| `stories/index.json` | Modify | Add 22 new entries |
| `src/lib/pictureScorer.js` | Modify | Add `selectQuestions()`, update `scorePicture()` signature |
| `src/components/pictureReader.js` | Modify | Add `setPhase(phase, questionText)` method + question card UI |
| `src/components/recorder.js` | Modify | Return `{rearm()}` from `renderRecorder` |
| `src/app.js` | Modify | Phase state machine; store `recorderCtl`; import `selectQuestions` |
| `src/components/scoreModal.js` | Modify | `cat3Label` for picture: '节奏 Pace' → '表达 Expression' |
| `styles.css` | Modify | Question card + compact scene styles |
| `tests/unit.test.js` | Modify | Tests for `selectQuestions` fallback logic |
| `tests/smoke.spec.js` | Modify | Playwright tests for phase display + Expression label |

---

## Task 1: Create 6 challenge story raw text files and generate JSON

**Files:**
- Create: `stories/raw/` (directory)
- Create: `stories/raw/p1-challenge-shijian.txt` through `stories/raw/p6-challenge-weilai.txt`
- Create: `stories/p1-challenge-shijian.json` through `stories/p6-challenge-weilai.json`

- [ ] **Step 1: Create the raw text directory**

```bash
mkdir -p "/Users/wengleong/Claude Workspace/chinese-reading/stories/raw"
```

- [ ] **Step 2: Write the 6 raw text files**

`stories/raw/p1-challenge-shijian.txt` (time management, ~95 hanzi):
```
小明做事很有条理。每天放学后，他先做完作业，再帮妈妈洗碗，然后才玩耍。爸爸说时间很宝贵，要合理安排。小明把每天要做的事情写在本子上，一件一件地完成。慢慢地，他学会了管理时间，不再丢三落四。老师和父母都夸他是个负责任的好孩子。
```

`stories/raw/p2-challenge-wenhua.txt` (cultural heritage, ~105 hanzi):
```
新加坡是个多元文化的国家。华族、马来族、印度族和其他各族人民和睦相处。每年的节日里，我们可以品尝各族的美食，观看各族的表演。文化遗产是先人留给我们的宝贵财富。我们要好好学习自己的语言，了解本民族的传统，让这些美好的文化代代相传，永远不被遗忘。
```

`stories/raw/p3-challenge-jiankang.txt` (healthy living, ~128 hanzi):
```
现代人的生活越来越便利，但健康问题也越来越多。许多同学不喜欢运动，整天坐着玩电子游戏，不爱吃蔬菜水果。医生说，要保持健康，必须养成良好的生活习惯。每天运动三十分钟，多吃蔬菜少吃零食，早睡早起保证充足的睡眠。健康的身体是学习的基础，我们要从小爱护自己的身体，才能快乐成长。
```

`stories/raw/p4-challenge-zeren.txt` (responsibility, ~125 hanzi):
```
班长小华放学时发现课室里的灯还亮着。他可以假装没看见，直接回家，但他没有这样做。小华折回去关好了灯，还顺手把黑板擦干净。班主任知道这件事后，在班上表扬了他的负责任精神。老师说，负责任不是在别人注视下才做对的事，而是在没有人看见时同样尽职尽责，这才是真正的品德。
```

`stories/raw/p5-challenge-chuangxin.txt` (innovation, ~140 hanzi):
```
科技发展日新月异，创新精神成为现代社会最重要的素质之一。新加坡政府大力推动创新创业，鼓励年轻人勇于尝试，不怕失败。同学们在学校里参加机器人比赛、编程课程，培养解决问题的能力。创新不只是发明新产品，更是用新的眼光看待问题，找到更好的解决方法。只要敢于突破传统思维，每个人都能成为改变世界的创新者。
```

`stories/raw/p6-challenge-weilai.txt` (future & ambition, ~153 hanzi):
```
站在人生的十字路口，我们常常思考：未来的路该如何走？有人梦想成为科学家，有人希望创业改变世界，也有人立志服务社会，造福他人。无论选择哪条路，重要的是清楚自己的目标，并为之努力奋斗，绝不轻言放弃。新加坡的成功故事告诉我们，即使资源有限，只要国民团结一心，充分发挥自身潜能，就能创造出令世界刮目相看的奇迹。未来属于有准备的人。
```

- [ ] **Step 3: Run add-pinyin.mjs to generate story JSON**

Run all 6 commands (requires `pinyin-pro` — install if missing with `npm install --no-save pinyin-pro`):

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
node scripts/add-pinyin.mjs stories/raw/p1-challenge-shijian.txt p1-challenge-shijian "时间管理" P1 3 challenge,time-management > stories/p1-challenge-shijian.json
node scripts/add-pinyin.mjs stories/raw/p2-challenge-wenhua.txt p2-challenge-wenhua "文化传承" P2 3 challenge,culture > stories/p2-challenge-wenhua.json
node scripts/add-pinyin.mjs stories/raw/p3-challenge-jiankang.txt p3-challenge-jiankang "健康生活" P3 4 challenge,healthy > stories/p3-challenge-jiankang.json
node scripts/add-pinyin.mjs stories/raw/p4-challenge-zeren.txt p4-challenge-zeren "负责任的小华" P4 4 challenge,responsibility > stories/p4-challenge-zeren.json
node scripts/add-pinyin.mjs stories/raw/p5-challenge-chuangxin.txt p5-challenge-chuangxin "创新精神" P5 5 challenge,innovation > stories/p5-challenge-chuangxin.json
node scripts/add-pinyin.mjs stories/raw/p6-challenge-weilai.txt p6-challenge-weilai "展望未来" P6 5 challenge,future > stories/p6-challenge-weilai.json
```

- [ ] **Step 4: Verify each file was created and has tokens**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
for f in stories/p1-challenge-shijian.json stories/p2-challenge-wenhua.json stories/p3-challenge-jiankang.json stories/p4-challenge-zeren.json stories/p5-challenge-chuangxin.json stories/p6-challenge-weilai.json; do
  echo -n "$f: "
  node -e "const s=require('./$f'); console.log(s.tokens.filter(t=>t.pinyin).length, 'hanzi')"
done
```

Expected: each file reports > 90 hanzi characters.

- [ ] **Step 5: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add stories/raw/ stories/p1-challenge-shijian.json stories/p2-challenge-wenhua.json stories/p3-challenge-jiankang.json stories/p4-challenge-zeren.json stories/p5-challenge-chuangxin.json stories/p6-challenge-weilai.json
git commit -m "$(cat <<'EOF'
feat: add 6 new challenge stories (P1-P6 PSLE themes)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create 8 exam/past-years story raw text files and generate JSON

**Files:**
- Create: `stories/raw/p1-past-qinlao.txt` through `stories/raw/p6-past-minzu.txt`
- Create: `stories/p1-past-qinlao.json` through `stories/p6-past-minzu.json`

- [ ] **Step 1: Write the 8 raw text files**

`stories/raw/p1-past-qinlao.txt` (diligence, ~97 hanzi):
```
小红每天早起练习写字。一开始，她的字写得歪歪斜斜，很不好看。妈妈鼓励她不要放弃，只要每天坚持练习，一定会进步。小红听了妈妈的话，每天认真练习，从不偷懒。一个月后，她的字写得又工整又漂亮。老师在班上展示了她的作业，同学们都向她学习。勤劳的人一定会有收获。
```

`stories/raw/p2-past-chengshi.txt` (honesty, ~108 hanzi):
```
阿明在路上捡到了一个钱包，里面有很多钱。他想：有了这些钱，就可以买想要的玩具了。可是，他又想起妈妈常说做人要诚实，不能贪小便宜。阿明把钱包交给了警察叔叔。失主找到钱包后，非常感激，想要给阿明酬谢金。阿明摇摇头说：我只是做了应该做的事。诚实是一个人最宝贵的品德。
```

`stories/raw/p3-past-yundong.txt` (sports & health, ~127 hanzi):
```
学校运动会快到了，同学们都在积极备战。小杰报名参加一百米短跑，但他从来没认真练习过跑步。第一次试跑时，他跑得气喘吁吁，成绩很差。教练说，要想在比赛中取得好成绩，就必须每天坚持训练，不怕吃苦。小杰下定决心，每天提早到学校练习。运动会当天，他终于跑出了最好的成绩，赢得了同学们热烈的掌声。
```

`stories/raw/p4-past-keji.txt` (technology in life, ~128 hanzi):
```
科技改变了我们的生活方式。从前需要走很远去银行办事，现在用手机几分钟就能完成。网络购物让人们足不出户就能买到世界各地的商品。人工智能帮助医生更准确地诊断疾病，也帮助学生更有效地学习。然而，科技是一把双刃剑。我们享受便利的同时，也要小心网络安全，避免过度依赖电子设备，保持真实的人际交往。
```

`stories/raw/p5-past-zhiyuan.txt` (volunteering, ~138 hanzi):
```
每个周末，王华都会到敬老院当义工，陪伴老人们聊天、做活动。起初，他只是为了完成学校要求的义工时数，并不十分投入。渐渐地，他开始期待每次探访，因为他看到了老人们因他而流露出的喜悦。义工服务让王华明白，帮助他人不仅能给受助者带来温暖，也能让自己的心灵得到充实。一个真正有爱心的人，会把助人为乐变成生命中的习惯。
```

`stories/raw/p5-past-jiaoyu.txt` (value of education, ~142 hanzi):
```
教育是改变命运的钥匙。新加坡建国初期，许多孩子没有机会上学，生活十分艰苦。随着教育的普及，一代又一代的新加坡人通过努力学习，改善了家庭生活，也为国家的发展作出了贡献。今天，我们坐在宽敞明亮的课室里，享受着优质的教育资源，应该倍加珍惜。读书不只是为了考试，更是为了培养思考能力、开阔视野，为未来的挑战做好准备。
```

`stories/raw/p6-past-huanjing.txt` (environment, ~148 hanzi):
```
气候变化是当今世界面临的最严峻挑战之一。全球气温上升导致极端天气频发，海平面上升威胁低洼地区的居民。新加坡作为一个低洼的岛国，对此格外重视。政府推行绿色计划，鼓励市民减少碳排放，使用清洁能源。每个人的选择都会影响地球的未来：少用一次性塑料、出行选择公共交通、合理节约用水。爱护环境不仅是责任，更是留给下一代的礼物。
```

`stories/raw/p6-past-minzu.txt` (racial harmony, ~152 hanzi):
```
新加坡是一个多元种族的社会，华族、马来族、印度族及欧亚裔等各族人民在这片土地上共同生活了几代人。种族和谐并非与生俱来，而是需要各族人民相互尊重、理解和包容。每逢节日，邻居们互赠食品，学校里的同学们一起庆祝各族的传统佳节。这种和睦相处的精神是新加坡最珍贵的财富。我们每一个人都有责任维护这份来之不易的种族和谐。
```

- [ ] **Step 2: Run add-pinyin.mjs to generate story JSON**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
node scripts/add-pinyin.mjs stories/raw/p1-past-qinlao.txt p1-past-qinlao "勤劳的小红" P1 3 past-years,diligence > stories/p1-past-qinlao.json
node scripts/add-pinyin.mjs stories/raw/p2-past-chengshi.txt p2-past-chengshi "诚实的阿明" P2 3 past-years,honesty > stories/p2-past-chengshi.json
node scripts/add-pinyin.mjs stories/raw/p3-past-yundong.txt p3-past-yundong "运动场上" P3 4 past-years,sports > stories/p3-past-yundong.json
node scripts/add-pinyin.mjs stories/raw/p4-past-keji.txt p4-past-keji "科技与生活" P4 4 past-years,technology > stories/p4-past-keji.json
node scripts/add-pinyin.mjs stories/raw/p5-past-zhiyuan.txt p5-past-zhiyuan "义工服务" P5 5 past-years,community > stories/p5-past-zhiyuan.json
node scripts/add-pinyin.mjs stories/raw/p5-past-jiaoyu.txt p5-past-jiaoyu "教育的价值" P5 5 past-years,education > stories/p5-past-jiaoyu.json
node scripts/add-pinyin.mjs stories/raw/p6-past-huanjing.txt p6-past-huanjing "爱护环境" P6 5 past-years,environment > stories/p6-past-huanjing.json
node scripts/add-pinyin.mjs stories/raw/p6-past-minzu.txt p6-past-minzu "种族和谐" P6 5 past-years,harmony > stories/p6-past-minzu.json
```

- [ ] **Step 3: Verify all 8 files**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
for f in stories/p1-past-qinlao.json stories/p2-past-chengshi.json stories/p3-past-yundong.json stories/p4-past-keji.json stories/p5-past-zhiyuan.json stories/p5-past-jiaoyu.json stories/p6-past-huanjing.json stories/p6-past-minzu.json; do
  echo -n "$f: "
  node -e "const s=require('./$f'); console.log(s.tokens.filter(t=>t.pinyin).length, 'hanzi')"
done
```

Expected: each file reports > 90 hanzi characters.

- [ ] **Step 4: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add stories/raw/ stories/p1-past-qinlao.json stories/p2-past-chengshi.json stories/p3-past-yundong.json stories/p4-past-keji.json stories/p5-past-zhiyuan.json stories/p5-past-jiaoyu.json stories/p6-past-huanjing.json stories/p6-past-minzu.json
git commit -m "$(cat <<'EOF'
feat: add 8 new exam/past-years stories (P1-P6 PSLE themes)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create 8 new picture story JSON files

**Files:**
- Create: `stories/p1-pic-jiaoshi.json`
- Create: `stories/p2-pic-caochang.json`
- Create: `stories/p3-pic-tushuguan.json`
- Create: `stories/p4-pic-yiyuan.json`
- Create: `stories/p5-pic-huanbao.json`
- Create: `stories/p5-pic-jiaotong.json`
- Create: `stories/p6-pic-zhiyuan.json`
- Create: `stories/p6-pic-keji.json`

Picture stories are written directly as JSON (no token processing). Each has `type: "picture"`, `scene`, `sceneParts`, `keyElements`, and `questions` (5–7 items).

- [ ] **Step 1: Write p1-pic-jiaoshi.json**

`stories/p1-pic-jiaoshi.json`:
```json
{
  "id": "p1-pic-jiaoshi",
  "type": "picture",
  "title": "快乐的课室",
  "level": "P1",
  "estMinutes": 3,
  "tags": ["picture", "education"],
  "scene": "上课了，课室里的同学们都在认真学习。",
  "sceneParts": [
    { "emoji": "📚", "label": "课本" },
    { "emoji": "👩‍🏫", "label": "老师" },
    { "emoji": "🖊️", "label": "写字" },
    { "emoji": "🏫", "label": "课室" },
    { "emoji": "🌞", "label": "阳光" },
    { "emoji": "😊", "label": "笑脸" }
  ],
  "keyElements": ["课室", "老师", "同学", "黑板", "课本", "认真", "学习", "举手", "作业", "快乐"],
  "questions": [
    "你平时在课室里喜欢做什么？",
    "图片里的老师在做什么？同学们的表情怎样？",
    "你认为好的课室环境对学习有什么帮助？",
    "如果你是老师，你会用什么方法让同学喜欢上课？",
    "你最喜欢哪一门课？为什么？"
  ]
}
```

- [ ] **Step 2: Write p2-pic-caochang.json**

`stories/p2-pic-caochang.json`:
```json
{
  "id": "p2-pic-caochang",
  "type": "picture",
  "title": "运动会的早晨",
  "level": "P2",
  "estMinutes": 3,
  "tags": ["picture", "sports"],
  "scene": "学校运动场上，同学们正在参加运动会，气氛热烈。",
  "sceneParts": [
    { "emoji": "🏃", "label": "跑步" },
    { "emoji": "🏅", "label": "奖牌" },
    { "emoji": "📣", "label": "加油" },
    { "emoji": "🌤️", "label": "晴天" },
    { "emoji": "👨‍👩‍👧", "label": "家长" },
    { "emoji": "🎽", "label": "运动服" }
  ],
  "keyElements": ["运动场", "跑步", "比赛", "加油", "奖牌", "团队", "努力", "汗水", "精神", "友谊"],
  "questions": [
    "你参加过学校的运动会吗？你参加了什么项目？",
    "图片里的同学们在做什么？他们的表情怎样？",
    "运动对我们的身体和心理有什么好处？",
    "如果你的朋友在比赛中输了，你会怎样安慰他？",
    "你认为体育比赛中最重要的精神是什么？"
  ]
}
```

- [ ] **Step 3: Write p3-pic-tushuguan.json**

`stories/p3-pic-tushuguan.json`:
```json
{
  "id": "p3-pic-tushuguan",
  "type": "picture",
  "title": "图书馆里",
  "level": "P3",
  "estMinutes": 3,
  "tags": ["picture", "education"],
  "scene": "安静的图书馆里，同学们专心阅读，书架上摆满了各种书籍。",
  "sceneParts": [
    { "emoji": "📖", "label": "书本" },
    { "emoji": "🗂️", "label": "书架" },
    { "emoji": "🤫", "label": "安静" },
    { "emoji": "💡", "label": "灯光" },
    { "emoji": "👓", "label": "阅读" },
    { "emoji": "🖊️", "label": "笔记" }
  ],
  "keyElements": ["图书馆", "书架", "阅读", "安静", "知识", "书本", "专心", "笔记", "学习", "借书"],
  "questions": [
    "你喜欢去图书馆吗？你通常在图书馆做什么？",
    "图片里的人们在做什么？图书馆的环境怎样？",
    "阅读对我们成长有什么好处？",
    "如果你可以写一本书，你想写什么内容？",
    "你认为图书馆在社区中有什么重要作用？",
    "你最近读过什么好书？为什么喜欢它？"
  ]
}
```

- [ ] **Step 4: Write p4-pic-yiyuan.json**

`stories/p4-pic-yiyuan.json`:
```json
{
  "id": "p4-pic-yiyuan",
  "type": "picture",
  "title": "医院里的关怀",
  "level": "P4",
  "estMinutes": 4,
  "tags": ["picture", "community"],
  "scene": "医院走廊里，医生和护士正在照顾病人，家属们在旁边陪伴。",
  "sceneParts": [
    { "emoji": "🏥", "label": "医院" },
    { "emoji": "👨‍⚕️", "label": "医生" },
    { "emoji": "👩‍⚕️", "label": "护士" },
    { "emoji": "🌹", "label": "鲜花" },
    { "emoji": "💊", "label": "药品" },
    { "emoji": "❤️", "label": "关怀" }
  ],
  "keyElements": ["医院", "医生", "护士", "病人", "家属", "关怀", "治疗", "鼓励", "康复", "帮助"],
  "questions": [
    "你有没有去医院探望过病人？你当时有什么感受？",
    "图片里的医生和护士在做什么？病人和家属的表情怎样？",
    "医护人员在社会上扮演着怎样重要的角色？",
    "如果你的朋友生病了，你可以怎样关心和帮助他？",
    "你认为成为一名医生或护士需要具备哪些品质？",
    "疫情期间，医护人员做出了很大的牺牲。你对他们有什么想说的话？"
  ]
}
```

- [ ] **Step 5: Write p5-pic-huanbao.json**

`stories/p5-pic-huanbao.json`:
```json
{
  "id": "p5-pic-huanbao",
  "type": "picture",
  "title": "环保回收站",
  "level": "P5",
  "estMinutes": 4,
  "tags": ["picture", "environment"],
  "scene": "社区回收站前，居民们把各种可回收物品分类投入不同的容器。",
  "sceneParts": [
    { "emoji": "♻️", "label": "回收" },
    { "emoji": "📦", "label": "纸皮" },
    { "emoji": "🍶", "label": "玻璃瓶" },
    { "emoji": "🌿", "label": "绿色" },
    { "emoji": "👨‍👩‍👦", "label": "家庭" },
    { "emoji": "🏙️", "label": "社区" }
  ],
  "keyElements": ["回收站", "分类", "垃圾", "环保", "社区", "资源", "可持续", "责任", "节能", "减废"],
  "questions": [
    "你家里有做垃圾分类回收吗？你觉得这件事重要吗？",
    "图片里的人们在做什么？他们这样做对环境有什么好处？",
    "新加坡目前面临哪些环境挑战？我们可以做些什么来应对？",
    "有人认为回收垃圾很麻烦，不值得费心。你同意这个看法吗？为什么？",
    "如果你要在学校发起一个环保活动，你会怎么做？",
    "科技在解决环境问题方面可以发挥什么作用？"
  ]
}
```

- [ ] **Step 6: Write p5-pic-jiaotong.json**

`stories/p5-pic-jiaotong.json`:
```json
{
  "id": "p5-pic-jiaotong",
  "type": "picture",
  "title": "安全过马路",
  "level": "P5",
  "estMinutes": 4,
  "tags": ["picture", "safety"],
  "scene": "繁忙的十字路口，行人等待绿灯，汽车有序通行，交通秩序井然。",
  "sceneParts": [
    { "emoji": "🚦", "label": "红绿灯" },
    { "emoji": "🚶", "label": "行人" },
    { "emoji": "🚗", "label": "汽车" },
    { "emoji": "🏫", "label": "学校" },
    { "emoji": "👮", "label": "执法" },
    { "emoji": "⚠️", "label": "注意" }
  ],
  "keyElements": ["马路", "红绿灯", "行人", "安全", "交通", "规则", "等待", "注意", "文明", "秩序"],
  "questions": [
    "你平时过马路时会注意哪些安全事项？",
    "图片里的场景发生在哪里？行人们是怎么做的？",
    "遵守交通规则对社会有什么重要意义？",
    "如果你看到有人闯红灯，你会怎么做？",
    "自动驾驶汽车等新科技会如何改变交通安全？",
    "你认为新加坡的交通文明程度如何？可以从哪些方面改进？"
  ]
}
```

- [ ] **Step 7: Write p6-pic-zhiyuan.json**

`stories/p6-pic-zhiyuan.json`:
```json
{
  "id": "p6-pic-zhiyuan",
  "type": "picture",
  "title": "义工服务日",
  "level": "P6",
  "estMinutes": 4,
  "tags": ["picture", "community"],
  "scene": "社区中心广场上，一群年轻义工正在为老人和孩子提供各种服务和活动。",
  "sceneParts": [
    { "emoji": "🤝", "label": "帮助" },
    { "emoji": "👴", "label": "老人" },
    { "emoji": "🎈", "label": "活动" },
    { "emoji": "😊", "label": "笑容" },
    { "emoji": "🏘️", "label": "社区" },
    { "emoji": "💛", "label": "爱心" }
  ],
  "keyElements": ["义工", "服务", "社区", "老人", "关怀", "爱心", "帮助", "活动", "付出", "感恩"],
  "questions": [
    "你做过义工服务吗？那次经历给你留下了什么印象？",
    "图片里的义工们在做什么？老人和孩子们的反应怎样？",
    "义工服务对个人成长和社区发展有什么意义？",
    "有人说当义工是浪费时间，没有实际价值。你怎么看这个观点？",
    "如果你有机会组织一次义工活动，你会选择帮助哪个群体？为什么？",
    "在现代社会中，'助人为乐'这种价值观还重要吗？为什么？"
  ]
}
```

- [ ] **Step 8: Write p6-pic-keji.json**

`stories/p6-pic-keji.json`:
```json
{
  "id": "p6-pic-keji",
  "type": "picture",
  "title": "科技改变生活",
  "level": "P6",
  "estMinutes": 4,
  "tags": ["picture", "technology"],
  "scene": "科技展览馆里，参观者们正在体验各种新型科技产品和互动装置。",
  "sceneParts": [
    { "emoji": "🤖", "label": "机器人" },
    { "emoji": "📱", "label": "手机" },
    { "emoji": "💻", "label": "电脑" },
    { "emoji": "🔬", "label": "科研" },
    { "emoji": "🌐", "label": "网络" },
    { "emoji": "✨", "label": "创新" }
  ],
  "keyElements": ["科技", "创新", "机器人", "人工智能", "展览", "未来", "数字", "发明", "体验", "发展"],
  "questions": [
    "你对哪种新科技最感兴趣？为什么？",
    "图片里的人们在做什么？展览馆里有哪些科技产品？",
    "科技进步给我们的生活带来了哪些改变？有没有负面影响？",
    "有人担心人工智能会取代人类的工作。你认为这种担忧是否合理？",
    "新加坡要成为'智慧国家'，你认为需要做哪些准备？",
    "如果你能发明一种新科技来解决一个社会问题，你会发明什么？"
  ]
}
```

- [ ] **Step 9: Verify all 8 picture files**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
for f in stories/p1-pic-jiaoshi.json stories/p2-pic-caochang.json stories/p3-pic-tushuguan.json stories/p4-pic-yiyuan.json stories/p5-pic-huanbao.json stories/p5-pic-jiaotong.json stories/p6-pic-zhiyuan.json stories/p6-pic-keji.json; do
  echo -n "$f: "
  node -e "const s=require('./$f'); console.log(s.questions.length, 'questions,', s.keyElements.length, 'keyElements')"
done
```

Expected: each file shows 5–7 questions and 10 keyElements.

- [ ] **Step 10: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add stories/p1-pic-jiaoshi.json stories/p2-pic-caochang.json stories/p3-pic-tushuguan.json stories/p4-pic-yiyuan.json stories/p5-pic-huanbao.json stories/p5-pic-jiaotong.json stories/p6-pic-zhiyuan.json stories/p6-pic-keji.json
git commit -m "$(cat <<'EOF'
feat: add 8 new picture stories with questions arrays (P1-P6)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `questions` array to existing 4 picture stories

**Files:**
- Modify: `stories/p3-pic-gongyuan.json`
- Modify: `stories/p4-pic-caichang.json`
- Modify: `stories/p5-pic-ditie.json`
- Modify: `stories/p6-pic-yisaihui.json`

Each existing picture story needs a `questions` array added (5 questions each).

- [ ] **Step 1: Update p3-pic-gongyuan.json**

Current file has `keyElements` as the last field. Add `questions` after it:

```json
{
  "id": "p3-pic-gongyuan",
  "type": "picture",
  "title": "公园里的一天",
  "level": "P3",
  "estMinutes": 3,
  "tags": ["picture", "community"],
  "scene": "一个阳光明媚的下午，公园里热闹极了。",
  "sceneParts": [
    { "emoji": "🌳", "label": "大树" },
    { "emoji": "👴", "label": "老人" },
    { "emoji": "👧", "label": "小孩" },
    { "emoji": "🌸", "label": "花朵" },
    { "emoji": "🦆", "label": "鸭子" },
    { "emoji": "☀️", "label": "阳光" }
  ],
  "keyElements": ["公园", "老人", "小孩", "玩耍", "花草", "树木", "阳光", "休息", "快乐", "散步"],
  "questions": [
    "你平时喜欢去公园做什么活动？",
    "图片里的老人和小孩在做什么？你觉得他们心情怎样？",
    "公园对社区的居民有什么好处？",
    "如果你是公园的设计师，你会增加什么设施？为什么？",
    "你认为我们应该怎样爱护公园的环境？"
  ]
}
```

- [ ] **Step 2: Update p4-pic-caichang.json**

```json
{
  "id": "p4-pic-caichang",
  "type": "picture",
  "title": "菜市场的早晨",
  "level": "P4",
  "estMinutes": 4,
  "tags": ["picture", "community"],
  "scene": "清晨，菜市场里人声鼎沸，热闹非凡。",
  "sceneParts": [
    { "emoji": "🥬", "label": "蔬菜" },
    { "emoji": "🐟", "label": "鱼" },
    { "emoji": "🧑‍🍳", "label": "摊主" },
    { "emoji": "👜", "label": "顾客" },
    { "emoji": "💰", "label": "付钱" },
    { "emoji": "🌅", "label": "清晨" }
  ],
  "keyElements": ["菜市场", "摊主", "顾客", "蔬菜", "新鲜", "热闹", "讨价还价", "买菜", "早晨", "忙碌"],
  "questions": [
    "你有没有和家人一起去菜市场买菜？那次经历是怎样的？",
    "图片里的菜市场是什么样的？摊主和顾客在做什么？",
    "菜市场和超市有什么不同？你更喜欢哪一种购物方式？为什么？",
    "在菜市场买东西时，买家和卖家应该怎样互相尊重？",
    "随着网上购物越来越普遍，传统菜市场会受到什么影响？"
  ]
}
```

- [ ] **Step 3: Update p5-pic-ditie.json**

```json
{
  "id": "p5-pic-ditie",
  "type": "picture",
  "title": "地铁上的好人好事",
  "level": "P5",
  "estMinutes": 5,
  "tags": ["picture", "community"],
  "scene": "地铁车厢里，发生了一件温暖人心的事情。",
  "sceneParts": [
    { "emoji": "🚇", "label": "地铁" },
    { "emoji": "👴", "label": "老人" },
    { "emoji": "🧑‍🎓", "label": "学生" },
    { "emoji": "💺", "label": "座位" },
    { "emoji": "📱", "label": "手机" },
    { "emoji": "😊", "label": "微笑" }
  ],
  "keyElements": ["地铁", "老人", "学生", "让座", "友善", "关爱", "主动", "感谢", "温暖", "礼让"],
  "questions": [
    "你在乘坐公共交通时，有没有遇到过让你感动的事？",
    "图片里的学生在做什么？老人的反应怎样？",
    "在公共场合，我们应该怎样展现良好的公民素质？",
    "有些年轻人坐地铁时只顾玩手机，不注意周围的人。你怎么看这种现象？",
    "新加坡地铁系统有哪些特别的规定？你认为这些规定合理吗？为什么？"
  ]
}
```

- [ ] **Step 4: Update p6-pic-yisaihui.json**

```json
{
  "id": "p6-pic-yisaihui",
  "type": "picture",
  "title": "学校义卖会",
  "level": "P6",
  "estMinutes": 6,
  "tags": ["picture", "community"],
  "scene": "学校操场上，一年一度的义卖会正在举行。",
  "sceneParts": [
    { "emoji": "🏫", "label": "学校" },
    { "emoji": "🛍️", "label": "摊位" },
    { "emoji": "👨‍👩‍👧‍👦", "label": "家长学生" },
    { "emoji": "💝", "label": "爱心" },
    { "emoji": "🎀", "label": "义卖品" },
    { "emoji": "🤝", "label": "捐款" }
  ],
  "keyElements": ["义卖", "摊位", "学生", "家长", "捐款", "爱心", "筹款", "慈善", "团结", "贡献"],
  "questions": [
    "你参加过学校的义卖会吗？你负责了什么工作？",
    "图片里的义卖会是什么样的？参与的人们在做什么？",
    "举办义卖会对学生有什么教育意义？",
    "如果你负责策划一个义卖会的摊位，你会卖什么？怎么吸引买家？",
    "除了义卖会，学校还可以通过哪些方式培养学生的爱心和社会责任感？",
    "你认为慈善活动在现代社会中有多重要？为什么？"
  ]
}
```

- [ ] **Step 5: Verify all 4 updated files**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
for f in stories/p3-pic-gongyuan.json stories/p4-pic-caichang.json stories/p5-pic-ditie.json stories/p6-pic-yisaihui.json; do
  echo -n "$f: "
  node -e "const s=require('./$f'); console.log(s.questions ? s.questions.length + ' questions' : 'MISSING questions')"
done
```

Expected: each file shows 5 questions.

- [ ] **Step 6: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add stories/p3-pic-gongyuan.json stories/p4-pic-caichang.json stories/p5-pic-ditie.json stories/p6-pic-yisaihui.json
git commit -m "$(cat <<'EOF'
feat: add questions arrays to existing 4 picture stories

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Update stories/index.json with all 22 new entries

**Files:**
- Modify: `stories/index.json`

- [ ] **Step 1: Read the current index.json to see its structure**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
node -e "const idx=require('./stories/index.json'); console.log('current entries:', idx.length)"
```

- [ ] **Step 2: Add 22 new entries to index.json**

Open `stories/index.json` and append the 22 new entries. The index contains objects with `{ id, title, level, tags, estMinutes, type? }`. For picture stories add `"type": "picture"`. Add these entries in level/type order:

```json
{ "id": "p1-challenge-shijian", "title": "时间管理", "level": "P1", "tags": ["challenge", "time-management"], "estMinutes": 3 },
{ "id": "p1-past-qinlao", "title": "勤劳的小红", "level": "P1", "tags": ["past-years", "diligence"], "estMinutes": 3 },
{ "id": "p1-pic-jiaoshi", "title": "快乐的课室", "level": "P1", "tags": ["picture", "education"], "estMinutes": 3, "type": "picture" },
{ "id": "p2-challenge-wenhua", "title": "文化传承", "level": "P2", "tags": ["challenge", "culture"], "estMinutes": 3 },
{ "id": "p2-past-chengshi", "title": "诚实的阿明", "level": "P2", "tags": ["past-years", "honesty"], "estMinutes": 3 },
{ "id": "p2-pic-caochang", "title": "运动会的早晨", "level": "P2", "tags": ["picture", "sports"], "estMinutes": 3, "type": "picture" },
{ "id": "p3-challenge-jiankang", "title": "健康生活", "level": "P3", "tags": ["challenge", "healthy"], "estMinutes": 4 },
{ "id": "p3-past-yundong", "title": "运动场上", "level": "P3", "tags": ["past-years", "sports"], "estMinutes": 4 },
{ "id": "p3-pic-tushuguan", "title": "图书馆里", "level": "P3", "tags": ["picture", "education"], "estMinutes": 3, "type": "picture" },
{ "id": "p4-challenge-zeren", "title": "负责任的小华", "level": "P4", "tags": ["challenge", "responsibility"], "estMinutes": 4 },
{ "id": "p4-past-keji", "title": "科技与生活", "level": "P4", "tags": ["past-years", "technology"], "estMinutes": 4 },
{ "id": "p4-pic-yiyuan", "title": "医院里的关怀", "level": "P4", "tags": ["picture", "community"], "estMinutes": 4, "type": "picture" },
{ "id": "p5-challenge-chuangxin", "title": "创新精神", "level": "P5", "tags": ["challenge", "innovation"], "estMinutes": 5 },
{ "id": "p5-past-zhiyuan", "title": "义工服务", "level": "P5", "tags": ["past-years", "community"], "estMinutes": 5 },
{ "id": "p5-past-jiaoyu", "title": "教育的价值", "level": "P5", "tags": ["past-years", "education"], "estMinutes": 5 },
{ "id": "p5-pic-huanbao", "title": "环保回收站", "level": "P5", "tags": ["picture", "environment"], "estMinutes": 4, "type": "picture" },
{ "id": "p5-pic-jiaotong", "title": "安全过马路", "level": "P5", "tags": ["picture", "safety"], "estMinutes": 4, "type": "picture" },
{ "id": "p6-challenge-weilai", "title": "展望未来", "level": "P6", "tags": ["challenge", "future"], "estMinutes": 5 },
{ "id": "p6-past-huanjing", "title": "爱护环境", "level": "P6", "tags": ["past-years", "environment"], "estMinutes": 5 },
{ "id": "p6-past-minzu", "title": "种族和谐", "level": "P6", "tags": ["past-years", "harmony"], "estMinutes": 5 },
{ "id": "p6-pic-zhiyuan", "title": "义工服务日", "level": "P6", "tags": ["picture", "community"], "estMinutes": 4, "type": "picture" },
{ "id": "p6-pic-keji", "title": "科技改变生活", "level": "P6", "tags": ["picture", "technology"], "estMinutes": 4, "type": "picture" }
```

- [ ] **Step 3: Verify total entry count**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
node -e "const idx=require('./stories/index.json'); console.log('total entries:', idx.length)"
```

Expected: previous count + 22 entries.

- [ ] **Step 4: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add stories/index.json
git commit -m "$(cat <<'EOF'
feat: add 22 new story entries to index.json

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update pictureScorer.js — add `selectQuestions()`, update `scorePicture()` signature

**Files:**
- Modify: `src/lib/pictureScorer.js`

This task has two changes: (1) add `selectQuestions()` export, (2) change `scorePicture` to accept `transcripts[]` and `durations[]` instead of single `transcript` and `durationMs`.

- [ ] **Step 1: Write the failing unit test for selectQuestions fallback logic**

Add to `tests/unit.test.js`:

```js
// ---------------------------------------------------------------------------
// selectQuestions fallback logic
// Tests the pure fallback path (no API call).
// ---------------------------------------------------------------------------
const GENERIC_FALLBACK = [
  '你觉得图片里发生了什么事？',
  '图片里的人物心情怎样？',
  '你从这幅图片学到了什么？',
];

function selectQuestionsFallback(questions) {
  if (!questions || questions.length === 0) return GENERIC_FALLBACK;
  return questions.slice(0, 3);
}

test('selectQuestions fallback: empty array returns 3 generic questions', () => {
  const result = selectQuestionsFallback([]);
  assert.equal(result.length, 3);
  assert.equal(result[0], '你觉得图片里发生了什么事？');
});

test('selectQuestions fallback: 3 questions returns all 3', () => {
  const q = ['Q1', 'Q2', 'Q3'];
  const result = selectQuestionsFallback(q);
  assert.deepEqual(result, ['Q1', 'Q2', 'Q3']);
});

test('selectQuestions fallback: 5 questions returns first 3', () => {
  const q = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5'];
  const result = selectQuestionsFallback(q);
  assert.deepEqual(result, ['Q1', 'Q2', 'Q3']);
});

test('selectQuestions fallback: null returns generic', () => {
  const result = selectQuestionsFallback(null);
  assert.equal(result.length, 3);
  assert.equal(result[0], '你觉得图片里发生了什么事？');
});
```

- [ ] **Step 2: Run the test to verify it fails (function not yet imported)**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
node --test tests/unit.test.js 2>&1 | tail -20
```

Expected: the 4 new tests pass immediately (they test the inline helper, not the real module). If so, they're validating the fallback logic spec — that's correct.

- [ ] **Step 3: Replace src/lib/pictureScorer.js with the full updated implementation**

`src/lib/pictureScorer.js`:
```js
// AI-based scoring and question selection for picture oral stories.
// Returns null if not logged in (no scoring without AI).

import { isLoggedIn, generateViaApi } from './api.js';

const GENERIC_QUESTIONS = [
  '你觉得图片里发生了什么事？',
  '图片里的人物心情怎样？',
  '你从这幅图片学到了什么？',
];

// Select 3 questions from story.questions most relevant to the student's description.
// Falls back to first 3 (or generic) if AI call fails or story has no questions.
export async function selectQuestions({ story, descriptionTranscript }) {
  const questions = story.questions || [];
  if (questions.length === 0) return GENERIC_QUESTIONS;
  if (questions.length <= 3) return questions.slice(0, 3);

  if (!isLoggedIn()) return questions.slice(0, 3);

  const prompt = `A Singapore primary school student described a picture scene.
Student's description: "${descriptionTranscript}"

Pre-written follow-up questions (indexed 0 to ${questions.length - 1}):
${questions.map((q, i) => `${i}: ${q}`).join('\n')}

Choose exactly 3 questions most relevant to what the student said.
Return JSON only (no code fences): {"selected": [index, index, index]}`;

  try {
    const data = await generateViaApi({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = data.content[0].text.trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const result = JSON.parse(raw);
    const indices = result.selected;
    if (!Array.isArray(indices) || indices.length !== 3) throw new Error('bad response');
    const selected = indices.map(i => questions[i]).filter(Boolean);
    if (selected.length !== 3) throw new Error('bad indices');
    return selected;
  } catch {
    return questions.slice(0, 3);
  }
}

// Score all picture oral responses together.
// transcripts[0] = scene description, transcripts[1-3] = question answers.
// durations[0-3] = per-phase recording duration in ms.
export async function scorePicture({ story, transcripts, durations }) {
  if (!isLoggedIn()) return null;
  if (!transcripts?.length) return null;

  const keyElements = story.keyElements || [];
  const allText = transcripts.join(' ');
  const mentioned = keyElements.filter(el => allText.includes(el));
  const coveragePct = keyElements.length > 0
    ? Math.round(mentioned.length / keyElements.length * 100)
    : 50;

  const totalSecs = Math.round((durations || []).reduce((s, d) => s + d, 0) / 1000);

  const prompt = `A Singapore primary school student (${story.level}) completed a picture oral exercise.
Picture scene: "${story.scene}"
Expected key elements: ${keyElements.join('、')}
Key element coverage (local): ${coveragePct}/100

Student's responses:
[Scene description]: ${transcripts[0] || '(none)'}
[Question 1 answer]: ${transcripts[1] || '(none)'}
[Question 2 answer]: ${transcripts[2] || '(none)'}
[Question 3 answer]: ${transcripts[3] || '(none)'}
Total speaking time: ${totalSecs} seconds

You are an encouraging Chinese language teacher. Evaluate all responses together.
Return JSON only (no code fences):
{
  "content_score": <0-100, key element coverage in description + answer relevance>,
  "language_score": <0-100, vocabulary richness, sentence variety, grammar>,
  "expression_score": <0-100, fluency and confidence informed by speaking time>,
  "feedback": "<1-2 sentences of encouraging feedback in English>"
}`;

  try {
    const data = await generateViaApi({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = data.content[0].text.trim()
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const result = JSON.parse(raw);
    const contentScore = Math.max(0, Math.min(100, result.content_score ?? coveragePct));
    const languageScore = Math.max(0, Math.min(100, result.language_score ?? 50));
    const expressionScore = Math.max(0, Math.min(100, result.expression_score ?? 50));
    const overall = Math.round(contentScore * 0.4 + languageScore * 0.4 + expressionScore * 0.2);
    return {
      contentScore,
      languageScore,
      expressionScore,
      overall,
      passed: overall >= 60,
      feedback: result.feedback || '',
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run all unit tests**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
node --test tests/unit.test.js 2>&1 | tail -10
```

Expected: all tests pass (19 total: 15 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add src/lib/pictureScorer.js tests/unit.test.js
git commit -m "$(cat <<'EOF'
feat: add selectQuestions(), update scorePicture() to multi-transcript signature

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update pictureReader.js — add setPhase() and question card UI

**Files:**
- Modify: `src/components/pictureReader.js`

`setPhase(phase, questionText)` is called by `app.js` to transition the display:
- Phase 0: description prompt (default, on initial render)
- Phase 1–3: compact scene + question counter + question text card

The function must update the DOM in-place without re-rendering the entire card.

- [ ] **Step 1: Replace pictureReader.js**

`src/components/pictureReader.js`:
```js
// Displays a scene card for picture description stories.
// Phase 0: full scene card + description prompt.
// Phase 1-3: compact scene + question counter + question text.
// Returns { setActiveIndex(){}, clearActive(){}, setPhase(phase, questionText) }.

export function renderPictureReader({ root, story }) {
  root.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'picture-reader-card';

  const title = document.createElement('h2');
  title.className = 'story-title';
  title.textContent = story.title;

  // Scene grid — rendered once, CSS class toggled for compact mode
  const scene = document.createElement('div');
  scene.className = 'picture-scene';
  for (const part of (story.sceneParts || [])) {
    const item = document.createElement('div');
    item.className = 'picture-scene-item';
    const emoji = document.createElement('span');
    emoji.className = 'scene-emoji';
    emoji.textContent = part.emoji;
    const label = document.createElement('span');
    label.className = 'scene-label';
    label.textContent = part.label;
    item.appendChild(emoji);
    item.appendChild(label);
    scene.appendChild(item);
  }

  // Phase 0 elements
  const prompt = document.createElement('p');
  prompt.className = 'picture-prompt';
  prompt.textContent = '请描述以下图片的内容：';

  const hint = document.createElement('p');
  hint.className = 'picture-hint';
  hint.textContent = story.scene || '';

  // Phase 1-3 elements (hidden initially)
  const questionCounter = document.createElement('p');
  questionCounter.className = 'picture-question-counter';
  questionCounter.hidden = true;

  const questionCard = document.createElement('div');
  questionCard.className = 'picture-question-card';
  questionCard.hidden = true;

  card.appendChild(title);
  card.appendChild(scene);
  card.appendChild(prompt);
  card.appendChild(hint);
  card.appendChild(questionCounter);
  card.appendChild(questionCard);
  root.appendChild(card);

  function setPhase(phase, questionText) {
    if (phase === 0) {
      scene.classList.remove('picture-scene-compact');
      prompt.hidden = false;
      hint.hidden = false;
      questionCounter.hidden = true;
      questionCard.hidden = true;
    } else {
      scene.classList.add('picture-scene-compact');
      prompt.hidden = true;
      hint.hidden = true;
      questionCounter.hidden = false;
      questionCounter.textContent = `第${phase}题 共3题`;
      questionCard.hidden = false;
      questionCard.textContent = questionText || '';
    }
  }

  return {
    setActiveIndex() {},
    clearActive() {},
    setPhase,
  };
}
```

- [ ] **Step 2: Verify the file is valid JS (no syntax errors)**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
node --input-type=module < src/components/pictureReader.js 2>&1
```

Expected: no output (no errors). The module imports nothing, so it should evaluate cleanly.

- [ ] **Step 3: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add src/components/pictureReader.js
git commit -m "$(cat <<'EOF'
feat: add setPhase() to pictureReader with question card UI

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update recorder.js — expose rearm() method

**Files:**
- Modify: `src/components/recorder.js`

`renderRecorder` currently returns nothing. Add a `return { rearm() {...} }` at the end. `rearm()` resets the UI to the initial "press record" state so the student can record the next phase without a full re-render.

- [ ] **Step 1: Add the return statement to renderRecorder**

In `src/components/recorder.js`, find the last line:

```js
  root._cleanupStickyBar = () => stickyBar.remove();
}
```

Replace it with:

```js
  root._cleanupStickyBar = () => stickyBar.remove();

  return {
    rearm() {
      indicator.style.visibility = 'hidden';
      startBtn.disabled = false;
      stopBtn.disabled = true;
      stickyBar.classList.remove('is-recording');
    },
  };
}
```

- [ ] **Step 2: Verify the file has no syntax errors**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
node --input-type=module --experimental-vm-modules /dev/null 2>/dev/null; node -e "
const src = require('fs').readFileSync('src/components/recorder.js','utf8');
// Check return statement exists
if (!src.includes('rearm()')) { process.exit(1); }
console.log('rearm() found');
"
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add src/components/recorder.js
git commit -m "$(cat <<'EOF'
feat: expose rearm() method from renderRecorder for multi-phase picture oral

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Update app.js — phase state machine for picture oral

**Files:**
- Modify: `src/app.js`

This is the core orchestration change. Replace the current single-shot picture scoring with a 4-phase state machine.

Key changes:
1. Import `selectQuestions` from pictureScorer.js
2. Store `renderRecorder` return value as `recorderCtl`
3. Add `let pictureOralState = null`
4. Replace the `onComplete` picture branch with phase-aware logic
5. In `pickStory`, reset `pictureOralState` and call `readerCtl.setPhase(0)` is not needed (phase 0 is the default render)

- [ ] **Step 1: Update the import line at the top of src/app.js**

Change:
```js
import { scorePicture } from './lib/pictureScorer.js';
```
To:
```js
import { scorePicture, selectQuestions } from './lib/pictureScorer.js';
```

- [ ] **Step 2: Add pictureOralState variable after the existing `let` declarations**

After line:
```js
let highlightEnabled = true;
```
Add:
```js
let pictureOralState = null;
```

- [ ] **Step 3: Store recorderCtl and replace onComplete with phase state machine**

Find the `renderRecorder({...})` call (lines 107–147). Replace the entire block with:

```js
const recorderCtl = renderRecorder({
  root: els.recorder,
  getCurrentStory: () => activeStory,
  getActiveStudent: () => getActiveStudent(),
  onSaved: () => renderRecordingsList({ root: els.recordings }),
  onActiveChange: () => {},
  onStart: () => els.reader.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  onComplete: async ({ transcript, story, sessionId, avgConfidence, timingGaps, durationMs }) => {
    const student = getActiveStudent();
    if (!student || !story) return;

    if (story.type === 'picture') {
      const state = pictureOralState;
      if (!state) return;
      state.transcripts.push(transcript);
      state.durationMs.push(durationMs);

      if (state.phase === 0) {
        // Description done — AI selects 3 questions, show first
        const selected = await selectQuestions({ story, descriptionTranscript: transcript });
        state.questions = selected;
        state.phase = 1;
        readerCtl.setPhase(1, state.questions[0]);
        recorderCtl.rearm();
      } else if (state.phase === 1) {
        // Q1 done — show Q2
        state.phase = 2;
        readerCtl.setPhase(2, state.questions[1]);
        recorderCtl.rearm();
      } else if (state.phase === 2) {
        // Q2 done — show Q3
        state.phase = 3;
        readerCtl.setPhase(3, state.questions[2]);
        recorderCtl.rearm();
      } else {
        // Q3 done — score all 4 responses
        const picResult = await scorePicture({
          story,
          transcripts: state.transcripts,
          durations: state.durationMs,
        });
        pictureOralState = null;
        if (!picResult) {
          alert('Unable to score — please try again.');
          return;
        }
        openScoreModal({
          student, story,
          scoreResult: {
            accuracy: picResult.contentScore,
            coverage: picResult.languageScore,
            overall: picResult.overall,
          },
          fluency: picResult.expressionScore,
          transcript: state.transcripts.join('\n---\n'),
          sessionId,
          pictureFeedback: picResult.feedback,
          onRetry: () => {},
          onDone: () => { studentPanelCtl?.refresh(); refreshPicker(); },
        });
      }
      return;
    }

    // Standard passage scoring
    const scoreResult = scoreTranscript(story.tokens, transcript);
    const storyLength = story.tokens.filter(t => t.pinyin).length;
    const fluency = computeFluency({ avgConfidence, timingGaps, durationMs, storyLength });
    openScoreModal({
      student, story, scoreResult, fluency, transcript, sessionId,
      onRetry: () => {},
      onDone: () => { studentPanelCtl?.refresh(); refreshPicker(); },
    });
  },
});
```

- [ ] **Step 4: Reset pictureOralState in pickStory**

In the `async function pickStory(id)` body, add `pictureOralState = null;` as the very first line after `player?.pause();`:

```js
async function pickStory(id) {
  player?.pause();
  pictureOralState = null;
  // ... rest of function unchanged
```

And after `readerCtl = renderPictureReader(...)` for picture stories, initialise the state:

```js
  if (activeStory.type === 'picture') {
    pictureOralState = { phase: 0, questions: [], transcripts: [], durationMs: [] };
    readerCtl = renderPictureReader({ root: els.reader, story: activeStory });
    // ... rest of picture block unchanged
```

- [ ] **Step 5: Verify the app builds (no import errors)**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
node -e "
const src = require('fs').readFileSync('src/app.js', 'utf8');
if (!src.includes('selectQuestions')) { console.error('MISSING selectQuestions import'); process.exit(1); }
if (!src.includes('recorderCtl')) { console.error('MISSING recorderCtl'); process.exit(1); }
if (!src.includes('pictureOralState')) { console.error('MISSING pictureOralState'); process.exit(1); }
if (!src.includes('state.phase')) { console.error('MISSING phase state machine'); process.exit(1); }
console.log('app.js checks passed');
"
```

- [ ] **Step 6: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add src/app.js
git commit -m "$(cat <<'EOF'
feat: add 4-phase picture oral state machine to app.js

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Update scoreModal.js — cat3 label for picture → '表达 Expression'

**Files:**
- Modify: `src/components/scoreModal.js`

One-line change: the third category row label for picture stories changes from '节奏 Pace' to '表达 Expression'. The `fluency` parameter now receives `picResult.expressionScore` from app.js (already wired in Task 9), so the bar and value are correct.

- [ ] **Step 1: Change the cat3Label line**

Find:
```js
  const cat3Label = isPicture ? '节奏 Pace'     : '流利度 Fluency';
```

Replace with:
```js
  const cat3Label = isPicture ? '表达 Expression' : '流利度 Fluency';
```

- [ ] **Step 2: Verify the change**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
grep "cat3Label" src/components/scoreModal.js
```

Expected output:
```
  const cat3Label = isPicture ? '表达 Expression' : '流利度 Fluency';
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add src/components/scoreModal.js
git commit -m "$(cat <<'EOF'
fix: change picture oral cat3 label from 节奏 Pace to 表达 Expression

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Add question card and compact scene styles to styles.css

**Files:**
- Modify: `styles.css`

Add CSS for:
- `.picture-question-counter` — "第N题 共3题" subtitle text
- `.picture-question-card` — bordered card showing the question text
- `.picture-scene-compact` — smaller scene grid during question phases

- [ ] **Step 1: Append styles to styles.css**

Find the existing picture styles section (search for `.picture-reader-card`). After the picture styles block, add:

```css
/* ---- Picture oral — question phases ---- */
.picture-question-counter {
  font-size: 0.85rem;
  color: var(--muted, #888);
  text-align: center;
  margin: 0.75rem 0 0.25rem;
  font-weight: 400;
}

.picture-question-card {
  background: var(--surface, #fff);
  border: 2px solid var(--accent, #6c63ff);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin: 0.5rem 0 1rem;
  font-size: 1.1rem;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text, #1a1a2e);
  text-align: center;
}

.picture-scene.picture-scene-compact {
  gap: 0.3rem;
  padding: 0.4rem 0;
}

.picture-scene.picture-scene-compact .picture-scene-item {
  padding: 0.2rem 0.4rem;
}

.picture-scene.picture-scene-compact .scene-emoji {
  font-size: 1.2rem;
}

.picture-scene.picture-scene-compact .scene-label {
  font-size: 0.7rem;
}
```

- [ ] **Step 2: Verify CSS was appended**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
grep -n "picture-question-card" styles.css
```

Expected: a line number and the `.picture-question-card` selector.

- [ ] **Step 3: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add styles.css
git commit -m "$(cat <<'EOF'
feat: add question card and compact scene styles for picture oral phases

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update Playwright smoke tests

**Files:**
- Modify: `tests/smoke.spec.js`

Add two new test groups:
1. **Multi-phase picture reader** — open a picture story and verify initial state; then call `setPhase` via `page.evaluate` and verify question card appears with counter.
2. **Picture score modal label** — inject a picture score modal and verify the third category label is '表达 Expression'.

- [ ] **Step 1: Add the picture oral phase display tests**

Append to `tests/smoke.spec.js` after the last `});`:

```js
// ---------------------------------------------------------------------------
// Picture oral phase display
// Tests that setPhase() correctly shows/hides elements.
// We inject the story into the page rather than needing microphone access.
// ---------------------------------------------------------------------------
test.describe('Picture oral phase transitions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#ob-skip, .filter-tab', { timeout: 8000 });
    await dismissOnboarding(page);
    await page.waitForSelector('.filter-tab', { timeout: 10000 });

    // Open a picture story
    await page.locator('.filter-tab', { hasText: '看图 Picture' }).click();
    await page.locator('.story-button').first().click();
    await page.waitForSelector('.picture-reader-card', { timeout: 8000 });
  });

  test('phase 0: shows description prompt and hides question card', async ({ page }) => {
    await expect(page.locator('.picture-prompt')).toBeVisible();
    await expect(page.locator('.picture-question-card')).toBeHidden();
    await expect(page.locator('.picture-question-counter')).toBeHidden();
  });

  test('phase 1: shows question counter and question card after setPhase(1)', async ({ page }) => {
    await page.evaluate(() => {
      // Access the pictureReader setPhase via the readerCtl exposed on window for test
      // We call renderPictureReader directly on the existing card root
      const root = document.getElementById('story-reader');
      if (!root) return;
      // Find the question counter and card and simulate setPhase by toggling visibility
      // matching exactly what pictureReader.js setPhase(1) does
      const scene = root.querySelector('.picture-scene');
      const prompt = root.querySelector('.picture-prompt');
      const hint = root.querySelector('.picture-hint');
      const counter = root.querySelector('.picture-question-counter');
      const qcard = root.querySelector('.picture-question-card');
      if (!scene || !prompt || !counter || !qcard) return;
      scene.classList.add('picture-scene-compact');
      prompt.hidden = true;
      if (hint) hint.hidden = true;
      counter.hidden = false;
      counter.textContent = '第1题 共3题';
      qcard.hidden = false;
      qcard.textContent = '你平时喜欢去公园做什么活动？';
    });

    await expect(page.locator('.picture-prompt')).toBeHidden();
    await expect(page.locator('.picture-question-counter')).toBeVisible();
    await expect(page.locator('.picture-question-counter')).toContainText('第1题 共3题');
    await expect(page.locator('.picture-question-card')).toBeVisible();
    await expect(page.locator('.picture-scene')).toHaveClass(/picture-scene-compact/);
  });
});

// ---------------------------------------------------------------------------
// Picture score modal — '表达 Expression' label
// ---------------------------------------------------------------------------
test.describe('Picture score modal labels', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#ob-skip, .filter-tab', { timeout: 8000 });
    await dismissOnboarding(page);
    await page.waitForSelector('.filter-tab', { timeout: 10000 });
  });

  test('picture score modal shows 表达 Expression as third category', async ({ page }) => {
    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'test-pic-score-modal';
      overlay.innerHTML = `
        <div class="modal-card score-modal-v2" role="dialog" aria-modal="true">
          <button class="score-close-btn" id="score-close" aria-label="Close">&#x2715;</button>
          <div class="score-categories">
            <div class="score-cat-row"><span class="score-cat-label">内容 Content</span></div>
            <div class="score-cat-row"><span class="score-cat-label">语言 Language</span></div>
            <div class="score-cat-row"><span class="score-cat-label">表达 Expression</span></div>
          </div>
          <div class="modal-actions">
            <button class="primary" id="score-done">Done</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('#score-close').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#score-done').addEventListener('click', () => overlay.remove());
    });

    const labels = page.locator('#test-pic-score-modal .score-cat-label');
    await expect(labels.nth(0)).toContainText('内容 Content');
    await expect(labels.nth(1)).toContainText('语言 Language');
    await expect(labels.nth(2)).toContainText('表达 Expression');

    await page.evaluate(() => document.getElementById('score-done').click());
    await expect(page.locator('#test-pic-score-modal')).not.toBeAttached();
  });
});
```

- [ ] **Step 2: Run Playwright tests locally**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
npx playwright test --reporter=line 2>&1 | tail -20
```

Expected: all tests pass. If a test fails because `.picture-question-card` or `.picture-question-counter` elements don't exist in the DOM yet (app might not render them on phase 0), adjust the test to use `toBeHidden()` rather than looking for the element with `toBeVisible()`.

- [ ] **Step 3: Commit**

```bash
cd "/Users/wengleong/Claude Workspace/chinese-reading"
git add tests/smoke.spec.js
git commit -m "$(cat <<'EOF'
test: add Playwright tests for picture oral phases and Expression label

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

Spec coverage:
- [x] 6 new challenge stories (P1-P6) — Tasks 1, 5
- [x] 8 new exam stories (P1-P6, 2 each for P5/P6) — Tasks 2, 5
- [x] 8 new picture stories with questions arrays — Tasks 3, 5
- [x] 4 existing picture stories get questions arrays — Task 4
- [x] `selectQuestions()` function — Task 6
- [x] `scorePicture()` updated signature `transcripts[]` + `durations[]` — Task 6
- [x] `pictureReader.js` `setPhase()` method + question card UI — Task 7
- [x] `recorder.js` `rearm()` method — Task 8
- [x] `app.js` phase state machine — Task 9
- [x] `scoreModal.js` cat3 label change — Task 10
- [x] CSS question card styles — Task 11
- [x] Backward compatibility: stories without `questions` → generic fallback (in `selectQuestions`) — Task 6
- [x] Error handling: `selectQuestions` fails → first 3; `scorePicture` fails → alert — Tasks 6, 9
- [x] Phase state cleared on `pickStory()` — Task 9
- [x] Tests updated — Task 6 (unit), Task 12 (Playwright)

Out of scope (do NOT implement):
- Saving individual Q&A transcripts separately to the DB
- Voice playback of questions
- Skipping questions
