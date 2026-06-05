// ES Tailor backend — Claude API powered.
// Three AI features:
//   1) POST /api/research-company  : 会社名から企業情報をAI(web検索)で調査
//   2) POST /api/analyze-es        : アップロードした過去ES(PDF/docx/txt)をAIが読み、STAR要素を抽出
//   3) POST /api/generate-es       : 企業情報＋経験から、その企業向けESをストリーミング生成
//
// Requires ANTHROPIC_API_KEY in the environment. Without it, the AI endpoints
// return 503 and the front-end falls back to the offline template generator.

import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL = "claude-opus-4-8";
const hasKey = !!process.env.ANTHROPIC_API_KEY;
const client = hasKey ? new Anthropic() : null;

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname)); // serves index.html

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
});

// ---------- helpers ----------
function requireKey(res) {
  if (!client) {
    res
      .status(503)
      .json({ error: "AI未設定: 環境変数 ANTHROPIC_API_KEY を設定してサーバーを再起動してください。" });
    return false;
  }
  return true;
}

// Collect all text blocks from a non-streaming response.
function textOf(message) {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

// Extract the last JSON object/array found in a string (handles ```json fences).
function extractJson(text) {
  const fence = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  // find the last balanced {...}
  const start = candidate.lastIndexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  try {
    return JSON.parse(candidate.trim());
  } catch {
    return null;
  }
}

// Run a request that may use server-side tools (web search), resuming on pause_turn.
async function createWithTools(params, maxContinuations = 4) {
  let response = await client.messages.create(params);
  let msgs = params.messages;
  let i = 0;
  while (response.stop_reason === "pause_turn" && i < maxContinuations) {
    msgs = [...msgs, { role: "assistant", content: response.content }];
    response = await client.messages.create({ ...params, messages: msgs });
    i++;
  }
  return response;
}

// ---------- 1) 企業情報のAI調査 ----------
app.post("/api/research-company", async (req, res) => {
  if (!requireKey(res)) return;
  const company = String(req.body.company || "").trim();
  if (!company) return res.status(400).json({ error: "会社名が空です。" });

  const system =
    "あなたは日本の就職活動を支援するリサーチャーです。指定された企業の公開情報（公式サイトの企業理念・採用ページ・事業内容など）を調べ、" +
    "ESの作成に役立つ形で日本語で簡潔にまとめます。憶測や不確かな情報は含めず、一般に公開されている事実に基づいてください。";

  const userPrompt =
    `企業「${company}」について調べ、最後に必ず次のスキーマのJSONだけを\`\`\`jsonコードブロックで出力してください。\n` +
    `{\n` +
    `  "official_name": "正式な会社名",\n` +
    `  "values": ["企業理念や求める人物像のキーワードを3〜6個"],\n` +
    `  "business": "事業内容の要約(80字以内)",\n` +
    `  "appeal": "学生がESで志望動機に使える魅力・特徴(120字以内)",\n` +
    `  "culture": "社風・働き方の特徴(80字以内)",\n` +
    `  "sources": ["参照したURLを1〜3個"]\n` +
    `}`;

  try {
    const response = await createWithTools({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system,
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = textOf(response);
    const data = extractJson(text);
    if (!data) return res.status(502).json({ error: "AI応答の解析に失敗しました。", raw: text.slice(0, 500) });
    res.json(data);
  } catch (err) {
    handleErr(res, err);
  }
});

// ---------- 2) 過去ESの解析（ファイルアップロード） ----------
app.post("/api/analyze-es", upload.array("files", 5), async (req, res) => {
  if (!requireKey(res)) return;
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "ファイルがありません。" });

  // Build content: PDFs as native document blocks, docx/txt extracted to text.
  const content = [];
  try {
    for (const f of files) {
      const name = f.originalname.toLowerCase();
      if (name.endsWith(".pdf") || f.mimetype === "application/pdf") {
        content.push({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: f.buffer.toString("base64") },
        });
      } else if (name.endsWith(".docx")) {
        const { value } = await mammoth.extractRawText({ buffer: f.buffer });
        content.push({ type: "text", text: `【${f.originalname}】\n${value}` });
      } else {
        // txt / md / その他テキスト
        content.push({ type: "text", text: `【${f.originalname}】\n${f.buffer.toString("utf8")}` });
      }
    }
  } catch (e) {
    return res.status(400).json({ error: "ファイルの読み込みに失敗しました: " + e.message });
  }

  content.push({
    type: "text",
    text:
      "上記は応募者が過去に書いたエントリーシート(ES)です。内容を読み取り、最も強く打ち出されている経験を1つ選んで、" +
      "次のスキーマのJSONだけを```jsonコードブロックで出力してください。本文を創作せず、書かれている内容から抽出・要約してください。\n" +
      `{\n` +
      `  "strength": "強み(一言)",\n` +
      `  "epWhat": "取り組んだこと/テーマ",\n` +
      `  "epRole": "立場・規模",\n` +
      `  "epProblem": "直面した課題・困難",\n` +
      `  "epAction": "具体的な行動・工夫",\n` +
      `  "epResult": "結果(できれば数値)",\n` +
      `  "epLearn": "学んだこと",\n` +
      `  "summary": "このESの要点(60字以内)"\n` +
      `}`,
  });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      messages: [{ role: "user", content }],
    });
    const data = extractJson(textOf(message));
    if (!data) return res.status(502).json({ error: "AI応答の解析に失敗しました。" });
    res.json(data);
  } catch (err) {
    handleErr(res, err);
  }
});

// ---------- 3) ES生成（ストリーミング） ----------
app.post("/api/generate-es", async (req, res) => {
  if (!requireKey(res)) return;
  const b = req.body || {};
  const company = String(b.company || "").trim() || "貴社";
  const limit = parseInt(b.limit) || 400;

  const system =
    "あなたは日本の就職活動のプロのES添削者です。応募者本人の経験だけを使い、誇張や創作をせず、" +
    "指定企業の価値観に接続した、論理的で説得力のあるエントリーシートを日本語の敬体(です・ます調)で書きます。" +
    "他者のESを模倣せず、与えられた素材から『結論→具体(STAR)→企業との接続→締め』の構成で執筆します。";

  const userPrompt =
    `# 設問\n${b.question || "志望動機を教えてください。"}\n` +
    `# 指定文字数\n${limit}字程度（±1割に収める）\n` +
    `# 企業\n会社名: ${company}\n理念・求める人物像: ${b.values || "(未指定)"}\n魅力/事業: ${b.appeal || "(未指定)"}\n` +
    `# 応募者の素材\n強み: ${b.strength || ""}\n取り組み: ${b.epWhat || ""}\n立場/規模: ${b.epRole || ""}\n` +
    `課題: ${b.epProblem || ""}\n行動/工夫: ${b.epAction || ""}\n結果: ${b.epResult || ""}\n学び: ${b.epLearn || ""}\n` +
    `入社後にやりたいこと: ${b.contrib || ""}\n` +
    (b.pastEsText ? `# 参考: 応募者本人の過去ESの文体・トーン\n${String(b.pastEsText).slice(0, 1500)}\n` : "") +
    `\n指定文字数に収めた本文のみを出力してください。前置き・見出し・補足説明は不要です。`;

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    stream.on("text", (delta) => res.write(delta));
    await stream.finalMessage();
    res.end();
  } catch (err) {
    // stream may have started; append an error marker
    if (!res.headersSent) handleErr(res, err);
    else res.end("\n\n[エラー: " + (err?.message || "生成に失敗しました") + "]");
  }
});

app.get("/api/health", (req, res) => res.json({ ok: true, ai: hasKey, model: MODEL }));

function handleErr(res, err) {
  const status = err?.status || 500;
  const map = {
    401: "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。",
    429: "レート制限に達しました。しばらく待って再試行してください。",
    529: "APIが混雑しています。少し待って再試行してください。",
  };
  console.error("API error:", err?.status, err?.message);
  res.status(status).json({ error: map[status] || ("AIエラー: " + (err?.message || "unknown")) });
}

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`ES Tailor server on http://localhost:${PORT}  (AI: ${hasKey ? "有効" : "未設定 — テンプレート動作"})`);
});
