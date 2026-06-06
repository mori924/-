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

// ---------- 企業情報の抽出（LLM不使用・公式サイトURLから） ----------
// 指定された公開URLを取得し、理念・求める人物像のキーワードを発見的に抽出する。
// Anthropic API は使わないので課金は発生しない。
const STOP = new Set([
  "私たち","ます","です","こと","ため","する","おり","により","として","および","また","これ","その","お客様","当社","弊社","会社","企業","事業","世界","社会","人材","環境","とともに","ながら","もの","よう","https","http","www","reserved","rights","copyright","株式会社","ホーム","メニュー","ページ","採用","情報","お問い合わせ",
  // ナビ・定型ノイズ
  "社長挨拶","代表取締役","代表取締役社長","事業案内","会社概要","会社情報","企業情報","沿革","役員","拠点","グループ","ニュース","お知らせ","一覧","詳細","トップ","サイト","公式","投資家","ESG","サステナビリティ","ブランド","製品","サービス","トピックス","プライバシー","利用規約","個人情報","ログイン","検索","メッセージ","代表","役員一覧","数字で見る",
]);
// セクションのラベル語（価値そのものではない見出し）
["企業理念","理念","存在意義","文化","価値創造","価値創造サイクル","コーポレートメッセージ","パーパス","ビジョン","ミッション","バリュー","行動指針","スローガン","ピックアップコンテンツ","公式SNSアカウント","数字で見る","トップメッセージ"].forEach((w)=>STOP.add(w));
// 文の断片っぽいトークンを除外
const FRAGMENT = /(挨拶|構成|されて|ています|について|に関する|はこちら|ください|から成|に基づ|を目指|を大切)/;
// 候補トークンの正規化（先頭番号・「-Purpose-」等のラベル装飾を除去）
function normToken(s) {
  return s
    .replace(/^[\s0-9０-９]+[．.、)）]\s*/, "")
    .replace(/[-−–—]\s*(Purpose|Culture|Vision|Mission|Value|Way)\s*[-−–—]?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
const GENERIC_DESC = /掲載しています|ご紹介します|公式(企業)?サイト|総合サイト|について(ご案内|紹介)/;

function isBlockedHost(host) {
  return (
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[?::1\]?)/i.test(host) ||
    /\.(local|internal)$/i.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (ES-Tailor research bot)", "Accept-Language": "ja" },
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const ct = r.headers.get("content-type") || "";
    if (!/text\/html|text\/plain|xml/.test(ct)) throw new Error("HTMLではありません");
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function metaContent(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : "";
}
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// 理念ページの見出し(h1〜h4)から価値語の候補を拾う（見出しは価値表現が多い）
function headingValues(html) {
  const out = [];
  const re = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi;
  let m;
  while ((m = re.exec(html))) {
    const t = normToken(stripHtml(m[1]));
    if (t.length >= 2 && t.length <= 16 && !STOP.has(t) && !FRAGMENT.test(t) && !/^[0-9０-９\s]+$/.test(t)) out.push(t);
  }
  return out;
}

// マーカー語の近傍から短い名詞句候補を拾う
function keywordsNear(text) {
  const markers = ["理念", "ミッション", "ビジョン", "バリュー", "価値観", "行動指針", "大切に", "求める人材", "求める人物", "私たちは", "Mission", "Vision", "Value", "Purpose"];
  const found = [];
  for (const mk of markers) {
    let idx = 0;
    const lower = text;
    while ((idx = lower.indexOf(mk, idx)) !== -1 && found.length < 60) {
      const seg = text.slice(idx + mk.length, idx + mk.length + 50);
      seg
        .split(/[、。・,.\/|｜\s「」『』（）()【】\-—　:：]+/)
        .map((s) => normToken(s))
        .filter((s) => s.length >= 2 && s.length <= 10 && !/^[0-9０-９]+$/.test(s) && !STOP.has(s) && !FRAGMENT.test(s))
        .forEach((s) => found.push(s));
      idx += mk.length;
    }
  }
  // 出現頻度順に上位を返す
  const freq = {};
  found.forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  return Object.keys(freq)
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, 8);
}

app.post("/api/extract-company", async (req, res) => {
  let url = String(req.body.url || "").trim();
  if (!url) return res.status(400).json({ error: "企業サイトのURLを入力してください。" });
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  let u;
  try {
    u = new URL(url);
  } catch {
    return res.status(400).json({ error: "URLの形式が正しくありません。" });
  }
  if (isBlockedHost(u.hostname)) return res.status(400).json({ error: "そのURLは取得できません。" });

  try {
    let html = await fetchText(u.href);

    // 同一ドメインの「理念・会社情報・採用」ページがあれば1つだけ追加取得
    const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m, extraUrl = null;
    while ((m = linkRe.exec(html)) && !extraUrl) {
      const label = stripHtml(m[2]);
      if (/理念|ビジョン|ミッション|価値|会社情報|企業情報|about|company|philosophy|recruit|採用|求める/i.test(label)) {
        try {
          const abs = new URL(m[1], u.href);
          if (abs.hostname === u.hostname && abs.href !== u.href && !isBlockedHost(abs.hostname)) extraUrl = abs.href;
        } catch {/* ignore */}
      }
    }
    let extraHtml = "";
    if (extraUrl) {
      try { extraHtml = await fetchText(extraUrl); } catch {/* ignore */}
    }

    const allHtml = html + "\n" + extraHtml;
    const title = metaContent(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ||
      metaContent(html, /<title[^>]*>([^<]+)<\/title>/i);
    const desc =
      metaContent(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      metaContent(html, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);

    const text = stripHtml(allHtml);
    // 理念ページがあればその見出しを優先し、近傍キーワードで補完
    const headings = extraHtml ? headingValues(extraHtml) : [];
    const values = [...new Set([...headings, ...keywordsNear(text)])].slice(0, 8);

    res.json({
      name: (title || "").replace(/[|｜].*$/, "").replace(/(株式会社|有限会社)/g, "").trim().slice(0, 40),
      values,
      // SEO定型文（〜を掲載しています等）は志望動機に使うと不自然なので空にする
      appeal: GENERIC_DESC.test(desc) ? "" : desc.slice(0, 140),
      business: desc.slice(0, 80),
      sources: [u.href, extraUrl].filter(Boolean),
      note: "公式サイトから機械的に抽出した候補です。必ず確認・編集してください。",
    });
  } catch (err) {
    res.status(502).json({ error: "サイトの取得に失敗しました: " + (err?.message || "unknown") });
  }
});

function handleErr(res, err) {
  const status = err?.status || 500;
  const msg = err?.message || "";
  const map = {
    401: "APIキーが無効です。ANTHROPIC_API_KEY を確認してください。",
    429: "レート制限に達しました。しばらく待って再試行してください。",
    529: "APIが混雑しています。少し待って再試行してください。",
  };
  let friendly;
  if (/credit balance is too low|Plans & Billing/i.test(msg)) {
    friendly =
      "Anthropicアカウントのクレジット残高が不足しています。console.anthropic.com の「Plans & Billing」でクレジットを購入してから、もう一度お試しください。";
  } else {
    friendly = map[status] || "AIエラー: " + (msg || "unknown");
  }
  console.error("API error:", status, msg.slice(0, 200));
  res.status(status).json({ error: friendly });
}

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`ES Tailor server on http://localhost:${PORT}  (AI: ${hasKey ? "有効" : "未設定 — テンプレート動作"})`);
});
