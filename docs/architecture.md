# kidori-lite 設計（第1版）

仕様の正は `docs/spec.md`。この文書は「どこに何を作るか」「データの形」「計算の流れ」「kidori から何を持ってくるか」を決める。
仕様書に書いていないことで、ここで仮に決めたものには **（暫定）** を付け、`docs/tasks.md` 末尾の未決事項に挙げている。

kidori（`~/Documents/kidori`）のコードは **コピーしてから直す**。kidori 本体は変更しない。下で「kidori：◯◯」と書いたものが元のファイル。

## 1. 全体の構成

```
src/
  engine/              計算ロジック（React・ui・store を import しない）
    types.ts             データ型と初期値                       ← kidori：types.ts（大きく削る）
    round.ts             小数第1位の丸め                         ← kidori：round.ts（そのまま）
    defaults.ts          初期の設定・調整寸法・表示名            ← kidori：defaults.ts（材料を外す）
    fixtures/
      shelf.ts           仕様書 6章の例（全体・天板・側板・棚板）。テストで使う。shelfJob(id?, name?)・shelfAdjusts()（メラミン1＝adjust-melamine、シート0.5＝adjust-sheet）
    formula/
      tokenize.ts        式 → 字句（数値・参照 部材名.W|H・調整寸法 {n:id}・記号）  ← kidori：tokenize.ts
      parse.ts           字句 → 構文木                           ← kidori：parse.ts
      evaluate.ts        構文木の計算・参照の取り出し            ← kidori：evaluate.ts
      rename.ts          部材名の変更の追従                      ← kidori：rename.ts
      usages.ts          調整寸法を使っている部材を探す（仕事の中・全部の仕事から） ← kidori：usages.ts（厚み・id のつけ替えを外す）
      units.ts           式をカーソルで動く単位に分ける           ← kidori：units.ts
      display.ts         式の表示（{n:id} → 逃げ1 など）         ← kidori：display.ts
    dimensions/
      resolve.ts         依存関係（計算順・循環・存在しない部材）← kidori：dimensions/resolve.ts
      index.ts           computeDimensions(job, adjusts)：仕上がり・木取り寸法とエラー
    packing/
      pieces.ts          部材 → 片、回転の向き、入らない片       ← kidori：pieces.ts（材料ごとの分けを外す）
      sheet.ts           使える範囲（端切り）・刃厚込みの入り判定 ← kidori：sheet.ts（そのまま）
      guillotine.ts      帯詰め（同じ幅の優先を含む）            ← kidori：guillotine.ts（手持ちを外す）
      cutOrder.ts        切る順番（画面には出さない）            ← kidori：cutOrder.ts（そのまま）
      scraps.ts          端材                                     ← kidori：scraps.ts（そのまま）
      yield.ts           歩留まり                                 ← kidori：yield.ts（そのまま）
      sizes.ts           3×6 と 4×8 の比べ                        ← kidori：sizes.ts（材料の行を外す）
      index.ts           packJob(job, dims)：おまかせ・固定した1枚を除いた入口 ← kidori：packing/index.ts
    progress/
      frozen.ts          固定した1枚・部材が変わったことの検出   ← kidori：progress/frozen.ts
      sheetChecklist.ts  1枚ごとのチェックの一覧（同じ部材を1行）← kidori：sheetChecklist.ts
      partProgress.ts    部材ごとの進み具合（2/5）               ← kidori：partProgress.ts
    clipboard/
      copy.ts            部材のコピー（式のまま）・貼り付けの確認（足せる／足せない）・複製の名前  ← 新しく作る
  store/
    storage.ts         localStorage の読み書き（try/catch）       ← kidori：storage.ts を参考に作り直す
    jobs.ts            仕事・部材・調整寸法の操作（純粋関数）
    reducer.ts         状態の変更
    JobStore.tsx       Context + useReducer、変更時の自動保存
  ui/
    App.tsx            下のタブ（仕事・部材・木取り）
    screens/
      JobsScreen.tsx     仕事の一覧
      PartsScreen.tsx    設定（たたむ）・［仕上がり］［木取り］のタブ・部材の一覧
      KidoriScreen.tsx   木取りの結果・切り出しチェック
    components/
      SettingsPanel.tsx  板のサイズ・刃厚・端切り・切り代・切り方
      AdjustList.tsx     調整寸法の一覧・追加（逃げ／ほぞ／自由入力）
      PartRow.tsx        部材の1行（式 ｜ 計算した寸法、仕上がりの完了）
      PartEditor.tsx     部材の編集（名前・W・H・枚数・回転・複製）
      FormulaInput.tsx   式の入力（ボタン・カーソル・部材｜調整寸法のタブ）← kidori の操作を参考
      Numpad.tsx         数字キー
      PastePreview.tsx   貼り付けの確認
      SheetDiagram.tsx   配置図（SVG）
      SheetChecklist.tsx 1枚ごとの切り出しチェック
      Help.tsx           「ⓘ」の説明
```

- 画面の切り替えはルーター用のパッケージを使わず、状態（今のタブ）で切り替える（依存を増やさない）
- 計算の呼び出しは画面側で `computeDimensions` → `packJob` の順。`useMemo` で部材・設定・調整寸法が変わったときだけ計算し直す
- 持ってこない kidori のファイル：`flush.ts` `boards.ts` `dimensions/thickness.ts` `dimensions/finished.ts` `dimensions/cutSize.ts`（index.ts にまとめる）`dimensions/explain.ts` `formula/swapThickness` `packing/stack*` `packing/stock.ts` `packing/offcuts.ts` `packing/pairing.ts` `hints/` `migrate/` `progress/` の重ね切り・手持ち・端材の行の部分

## 2. データ型（`src/engine/types.ts`）

寸法は mm の number。比較は小数第1位に丸めてから行い、表示も小数第1位まで。

```ts
/** 部材の寸法の軸（板の面の2つ） */
export type Axis = 'W' | 'H'
export const AXES: readonly Axis[] = ['W', 'H']

// ---------- 入力 ----------

export type CutMode = 'vertical' | 'horizontal' | 'auto' // 縦切り優先 / 横切り優先 / おまかせ

export type BoardSizeKind = 'saburoku' | 'shihachi' | 'custom' // 3×6 / 4×8 / 自由入力
export const BOARD_SIZES = { saburoku: [910, 1820], shihachi: [1220, 2430] } as const // [妻手, 長手]

export interface Sheet {
  sizeKind: BoardSizeKind
  width: number   // 妻手（mm）
  length: number  // 長手（mm）。width ≦ length にそろえる
}

export interface Settings {
  sheet: Sheet       // 初期値 4×8
  kerf: number       // 刃厚（初期値 3）
  trim: number       // 端切り（初期値 5）。刃厚を含む
  allowance: number  // 切り代（初期値 10）。W・H に同じ値を足す
  cutMode: CutMode   // 初期値 'vertical'
}

/** 設定の数値の初期値（板はオブジェクトなので defaults.ts の defaultSettings() で作る） */
export const DEFAULT_SETTINGS = { kerf: 3, trim: 5, allowance: 10, cutMode: 'vertical' }

/** 調整寸法（アプリ全体で1つの一覧）。kidori の Nige と同じ形 */
export interface Adjust {
  id: string     // 式からは {n:id} で参照する
  name: string   // 例：逃げ、ほぞ、メラミン、シート
  value: number  // mm。0 より大きい
}

export interface Part {
  id: string
  name: string                  // 仕事の中で重複不可（全角・半角の違いは同じとみなす）
  expr: Record<Axis, string>    // 仕上がり寸法の入力（数値または式）
  quantity: number              // 0 は寸法だけの行
  rotatable: boolean            // 回転してよい。初期値 false
  finishedDone: boolean         // 仕上がりの完了のチェック
}

export interface Job {
  id: string
  name: string
  settings: Settings
  parts: Part[]                 // 並び順＝画面の並び順
  frozenSheets: FrozenSheet[]   // 固定した1枚（固定した順）
  createdAt: string             // ISO
  updatedAt: string
}

/** 固定した1枚（kidori の FrozenSheet から材料・重ね切りを外したもの） */
export interface FrozenSheet {
  id: string
  sheet: Sheet                  // 固定したときの板
  mode: 'vertical' | 'horizontal'
  kerf: number
  trim: number
  layout: SheetLayout           // 固定したときの1枚（深いコピー）
  checked: string[]             // チェックした片の pieceId
  frozenAt: string
  completedAt?: string          // 全部チェックした時刻。あれば「切り終わり」
}

/** 保存する全体 */
export interface AppData {
  version: 1
  jobs: Job[]
  adjusts: Adjust[]             // 初めは メラミン1・シート0.5
  clipboard: CopiedPart[] | null // 最後にコピーした部材
}

/** コピーした部材（id は持たない。式は式のまま。{n:id} の調整寸法はアプリ全体なのでそのまま使える） */
export type CopiedPart = Omit<Part, 'id' | 'finishedDone'>

// ---------- 寸法の計算結果 ----------

export type DimensionErrorKind = 'syntax' | 'unknownRef' | 'unknownAdjust' | 'cycle' | 'nonPositive' | 'divideByZero'

export interface DimensionError {
  partId: string
  axis: Axis
  kind: DimensionErrorKind
  message: string               // 画面にそのまま出せる日本語
  refs?: string[]
  from?: { partId: string; axis: Axis }
}

export interface PartDimensions {
  partId: string
  name: string
  quantity: number
  finished: Record<Axis, number> | null  // 仕上がり寸法（式の計算結果）。エラーがあれば null
  cut: Record<Axis, number> | null       // 木取り寸法（仕上がり ＋ 切り代）
  finishedByAxis: Partial<Record<Axis, number>> // 軸ごとの仕上がり（計算できた軸だけ。片方の軸だけエラーのとき式の隣に出す）
  cutByAxis: Partial<Record<Axis, number>>      // 軸ごとの木取り
  errors: DimensionError[]
}

export interface DimensionResult {
  parts: PartDimensions[]
  errors: DimensionError[]
}

// ---------- 木取りの結果（kidori と同じ形から材料を外す） ----------
// Rect・Placement・CutStep・SheetLayout・SheetOrientation は kidori の types.ts と同じ

export interface PackingResult {
  sheet: Sheet
  mode: 'vertical' | 'horizontal'        // 実際に使った切り方
  sheets: SheetLayout[]                   // 固定した1枚を除いた、計算した1枚
  sheetCount: number                      // 必要な板の枚数（固定した1枚を含む）
  yieldRate: number                       // 全体の歩留まり
  unplaced: { partId: string; name: string; reason: UnplacedReason }[]  // UnplacedReason = 'tooLarge'
  skipped: { partId: string; name: string; reason: 'dimensionError' }[]
}
```

**初期値と表示名（`src/engine/defaults.ts`）**

- `defaultSheet()`：4×8（1220×2430）。`defaultSettings()`：4×8・刃厚3・端切り5・切り代10・縦切り優先
- `defaultAdjusts(newId)`：メラミン1・シート0.5（id は `newId('adjust')`）
- `createJob({ id, name, now, settings? })`：部材なしの新しい仕事。`settings` を渡せばその写し（仕事のコピー）
- `defaultAppData(newId)`：仕事なし・調整寸法は初期値・コピーした部材なし
- `adjustName(adjust)`：表示名＝名前＋寸法（例：逃げ1。mm を付けない。寸法は丸めず、浮動小数の誤差だけ消す）
- `adjustNameKey(adjust)`：表示名が重なるかの判定用（名前の前後の空白を外し、全角・半角をそろえた表示名）。名前「逃げ1」寸法5 と 名前「逃げ」寸法15 は同じ「逃げ15」

## 3. 計算の流れ

### 3.1 式（`formula/`）— kidori と同じ考え方

- 字句：数値（小数可）、参照 `部材名.W|H`、調整寸法 `{n:id}`、`+ - * / ( )`、空白。kidori の材料の厚み `{t:id}` は外す
- 入力の揺れをそろえる（`normalizeFormulaText`。NFKC、`×` `✕` → `*`、`÷` → `/`、`−` `–` `—` → `-`。長音 `ー` は置き換えない）
- 部材名は `normalizePartName` でそろえてから照らし合わせる
- 結果は `{ ok: true, value }` か `{ ok: false, error }`。例外は投げない
- `.D` を書いたら、存在しない寸法としてエラー（kidori の式を貼ったときなど）（暫定）。kidori の `{t:id}` も「読めない参照」のエラー
- 計算に渡す値は `Lookup = { ref(部材名, 軸), adjust(調整寸法の id) }`（kidori の `thickness`・`nige` を `adjust` 1つに）。見つからなければ `null` を返し、部材は `unknownRef`、調整寸法は `unknownAdjust`（「削除した調整寸法を使っています」）になる
- 字句の種類は `number`・`ref`・`adjust`（`{n:id}`）・記号。構文木も同じ（kidori の `nige` を `adjust` に改名）
- 部材名の変更（`rename.ts`）：`renamePart(parts, partId, newName)` で名前を変え、全部材の W・H の式の `旧名.W|H` を書き換える（`{n:…}` の中は書き換えない）
- 表示（`display.ts`）：`formulaLabels(expr, adjusts)` は単位ごとの表示名（`* → ×`、`/ → ÷`、`- → −`、`{n:id}` → `adjustName`、無ければ「（削除した調整寸法）」）。`formulaText(expr, adjusts)` は1行の文字（例：`天板.H − 20 − メラミン1`）。調整寸法はアプリ全体の一覧（`AppData.adjusts`）から引くので、名前・寸法を変えると表示もついてくる

### 3.2 寸法（`dimensions/`）

1. すべての部材の W・H の式から参照を取り出し、`部材.軸` を点とした依存関係を作る（kidori：resolve.ts）
2. 存在しない部材名 → `unknownRef`、存在しない調整寸法 → `unknownAdjust`、並べられないもの → `cycle`
3. 計算順に：仕上がり ＝ 式の計算結果。0 以下 → `nonPositive`。参照先の値は **仕上がり寸法**
4. 木取り ＝ 仕上がり ＋ `settings.allowance`（W・H それぞれに1回）
5. 式の隣に出す値（spec 5.2）は `finishedByAxis` / `cutByAxis` を使う（W・H の片方だけエラーでも、もう片方の値は出せる）。`finished` / `cut` は W・H の両方が計算できたときだけ（木取りの計算はこちらを使う）
6. 入口は `computeDimensions(job, adjusts)`（`adjusts` はアプリ全体の調整寸法の一覧）。kidori の `finished.ts`・`cutSize.ts` は `index.ts` にまとめた
7. エラーのある寸法を参照している寸法は計算せず、元のエラーの種類を引き継いで `from` に元の寸法を入れる（kidori と同じ）
8. 枚数 0 の行（全体 など）も `cut` を出す。切らないことは `quantity` で判断する（木取りのタブで「切らない」と出すかは画面で決める）

### 3.3 木取り（`packing/`）— kidori 3.3・17.13 と同じ処理

- 板は1種類（`settings.sheet`）。kidori の「材料ごとに分ける」段は無くす
- 片の向き（`Orientation` の x＝妻手方向、y＝長手方向）：
  - 回転しない：x ＝ 木取り W、y ＝ 木取り H
  - 回転してよい：両方の向きを試す（kidori の `any` と同じ）
- 帯詰め・同じ幅の優先・右上から詰める・おまかせの比べ方・切る順番・端材（30mm 以上・大きい順）・歩留まりは kidori のまま
- 固定した1枚（`frozenSheets`）の片は、部材ごとの必要な枚数から引いてから並べる（kidori：`frozenDemand`）
- `sheetCount` ＝ 固定していて切り終わっていない1枚 ＋ 切り終わった1枚 ＋ 計算した1枚（暫定。kidori と同じ数え方にそろえる）

### 3.4 3×6 と 4×8 の比べ（`packing/sizes.ts`）

- 今の設定の板のサイズを 3×6・4×8 に置き換えて `packJob` を2回呼び、枚数・歩留まりを返す
- 固定した1枚は、どちらの計算でもそのまま数える（暫定）

### 3.5 切り出しチェック（`progress/`）— kidori 第1.8版・第2.7版と同じ

- 1枚ごとのチェックの一覧は、同じ部材を1行にまとめる（kidori：`sheetPartChecklist`）
- 1つ目のチェックで、その1枚を `FrozenSheet` として写す（kidori：`freezeSheet`）。全部外したら消す
- 固定した1枚の部材の寸法・枚数が今の部材と違えば「部材が変わっています」（kidori：`frozenSheetViews` の drift）
- 部材ごとの進み具合は、全部の固定した1枚のチェックから数える（kidori：`partCutProgress`）

### 3.6 コピーと貼り付け（`clipboard/copy.ts`）— 新しく作る

- `copyParts(job, partIds)` → `CopiedPart[]`（並び順は画面の順）
- `previewPaste(job, copied, adjusts)` → 行ごとに `{ ok: true }` か `{ ok: false, reason: 'duplicateName' }`、式に無い部材の参照があれば `warnings: ['全体 がありません']`
  - 同じ名前は、今の部材とも、貼る部材どうしとも比べる（normalizePartName で）
- `applyPaste(job, copied, newId)` → 足せる部材だけを後ろに足した仕事
- `duplicateName(job, name)` → 「棚板のコピー」「棚板のコピー2」…（重ならない名前）

## 4. 保存（`src/store`）

- localStorage のキー：`kidori-lite.data.v1` に `AppData`、`kidori-lite.currentJobId` に開いている仕事の id、端末ごとの画面の状態（選んだタブ）は `kidori-lite.ui`（暫定）
- kidori のキー（`kidori.*`）とは混ざらない（同じ `github.io` のドメインで localStorage を共有するため、キーの頭を必ず `kidori-lite.` にする）
- 読み書きはすべて try/catch。読めない・壊れているときは空の一覧で始め、「保存データを読めませんでした」と出す（データは上書きしない）
- 書き込みは状態が変わるたびに 300ms ほどまとめて行う
- 調整寸法の変更・削除は、全部の仕事の部材を見て、使っている仕事と部材を返す（`formula/usages.ts` の `adjustUsages(data, adjustId)` → `{ jobId, jobName, partId, partName, axes }[]`。一括削除は `adjustUsagesOf(data, adjustIds)` で、部材ごとに使っている `adjustIds` も付く）。画面で確認してから行う
- id は `crypto.randomUUID()`

## 5. 画面（`src/ui`）

幅 375px 前後、横スクロールなし、押せる部分は高さ 44px 以上、ライト／ダーク両対応。下に3つのタブ：**仕事・部材・木取り**。仕事を開いていないときは「仕事」以外を押せない。

| 画面 | 内容 |
|---|---|
| 仕事 | 一覧（名前・最後に変えた日・部材の数。新しい順）。新しく作る・開く・名前を変える・コピー・削除（確認） |
| 部材 | 上に設定（たたむ）。［仕上がり］［木取り］のタブ。部材の行：名前・W・H（式 ｜ 計算した寸法）・枚数・回転の印・仕上がりの完了（仕上がりのタブだけ）。「＋ 部材を追加」「選んでコピー」「貼り付け（◯件）」 |
| 部材の編集 | 名前（キーボード）、W・H（式の入力）、枚数（数字キー）、回転しない／回転してよい、複製、削除 |
| 式の入力 | 欄の上の1行に計算結果かエラー。下にボタン：「部材｜調整寸法」のタブ（部材は部材名 → W・H の2段階）、数字、`+ − × ÷ ( )`、←→、1字消す・全部消す |
| 設定 | 板のサイズ（3×6／4×8／自由入力）、刃厚、端切り、切り代、切り方、調整寸法の一覧と追加 |
| 木取り | 上に必要な枚数・全体の歩留まり、3×6 と 4×8 の比べ。板ごとに配置図（端材の寸法入り）・歩留まり・端材の一覧・切り出しチェック。切り終わりの1枚は下にたたむ。入らない部材・エラーの部材の知らせ |

**配置図**（`SheetDiagram.tsx`）：kidori と同じく `viewBox` を板の寸法（mm）にして画面幅に合わせる。端切り・部材（名前と木取り寸法）・端材（寸法）を色分け。チェックした片はグレー。

## 6. 公開

- GitHub Pages。`main` に入ったら、チェック → ビルド → 公開（kidori の `.github/workflows/deploy.yml` と同じ）
- ホーム画面に追加できるよう `public/manifest.webmanifest` とアイコンを置く（アイコンは kidori と同じ。名前・短い名前は「Kidori Lite」。オーナー決定）
