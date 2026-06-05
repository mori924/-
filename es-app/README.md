# ES Tailor — 企業に合わせるES作成支援（AI対応版）

会社名を入れると **AIが企業情報を検索**し、**過去のES（PDF/Word/テキスト）をアップロード**すると
AIが内容を読み取って経験を自動入力、そのうえで **その企業に合わせたESをAIが生成**します。
AIには **Claude API（`claude-opus-4-8`）** を使用します。

> 他者のESを転載・複製するものではありません。公開された企業情報とあなた自身の経験から、独自のESを構成します。

## セットアップ

```bash
cd es-app
npm install

# Anthropic の APIキーを設定（必須：AI機能を使う場合）
export ANTHROPIC_API_KEY=sk-ant-...     # Windows(PowerShell): $env:ANTHROPIC_API_KEY="sk-ant-..."

npm start          # → http://localhost:5050 を開く
```

`ANTHROPIC_API_KEY` を設定しない場合でもアプリは起動し、**APIキー不要のテンプレート生成**だけが使えます
（AI検索・ES読み込み・AI生成は無効。画面上部のバッジに「AI未設定」と表示されます）。

## 機能

| 機能 | 説明 | 使用するClaude機能 |
|------|------|------|
| 🔍 AIで企業検索 | 会社名から理念・求める人物像・事業・社風を調査して自動入力 | web検索ツール（`web_search`）＋ adaptive thinking |
| 📎 過去ESアップロード | PDF/Word/テキストを読み、STAR要素（強み・課題・行動・結果・学び）を抽出して自動入力 | PDFネイティブ読込 / docx抽出 + 構造化抽出 |
| 🤖 AIでES生成 | 企業情報＋経験＋過去ESの文体から、設問・文字数に合わせて本文をストリーミング生成 | streaming + adaptive thinking |
| 📝 テンプレート生成 | APIキー不要。入力をSTARの型で組み立てるオフライン生成 | （AI不使用） |

生成後は文字数カウントとセルフ添削チェックが表示されます。出力は必ず自分の言葉に推敲してから提出してください。

## 構成

- `server.js` — Express バックエンド。`/api/research-company`・`/api/analyze-es`・`/api/generate-es`・`/api/health`
- `index.html` — フロントエンド（AI無効時はテンプレート生成にフォールバック）
- 依存: `@anthropic-ai/sdk`, `express`, `multer`(アップロード), `mammoth`(Word抽出)

## 公開URL化（デプロイ）

バックエンド（Node）が必要なため、静的ホスト（GitHub Pages等）では動きません。Node を実行できるホストにデプロイします。
どのホストでも、**環境変数 `ANTHROPIC_API_KEY` をダッシュボードで設定**してください（コードには含めない）。

### Render（最も簡単・無料枠あり）
1. https://render.com にGitHubでログイン → **New → Blueprint**
2. このリポジトリを選択（`es-app/render.yaml` を自動検出）
3. デプロイ時に環境変数 `ANTHROPIC_API_KEY` を入力
4. 発行されるURL（例 `https://es-tailor.onrender.com`）で公開完了

### Fly.io（東京リージョン・Dockerfile）
```bash
cd es-app
fly launch --no-deploy        # fly.toml を検出
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy
```

### Docker（任意のVPS/クラウド）
```bash
cd es-app
docker build -t es-tailor .
docker run -p 8080:8080 -e ANTHROPIC_API_KEY=sk-ant-... es-tailor
# → http://localhost:8080
```

サーバーは `PORT` 環境変数を尊重します（Render/Fly が自動設定）。ローカル既定は 5050、Docker既定は 8080。

## 注意

- アップロードしたファイルとフォーム入力は、あなたのサーバー経由で Anthropic API に送信されます（自分のAPIキーで動作）。第三者には公開されません。
- APIキーはコードに書かず、必ず環境変数で渡してください。
- web検索結果や生成文は事実確認のうえ利用してください。
