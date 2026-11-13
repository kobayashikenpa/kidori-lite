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
      pieces.ts          帯詰めのテスト用の片（kidori の見本のランバー18・ベニヤ4 と同じ大きさの片、仕様書 6章の棚を全部「回転してよい」にした片）
      progress.ts        切り出しチェックのテスト用（見本の棚を計算して i 枚目を固定する freezeAt など）
    formula/
      tokenize.ts        式 → 字句（数値・参照 部材名.W|H・調整寸法 {n:id}・記号）  ← kidori：tokenize.ts
      parse.ts           字句 → 構文木                           ← kidori：parse.ts
      evaluate.ts        構文木の計算・参照の取り出し            ← kidori：evaluate.ts
      rename.ts          部材名の変更の追従                      ← kidori：rename.ts
      usages.ts          調整寸法を使っている部材を探す（仕事の中・全部の仕事から） ← kidori：usages.ts（厚み・id のつけ替えを外す）
      units.ts           式をカーソルで動く単位に分ける           ← kidori：units.ts
      display.ts         式の表示（{n:id} → 逃げ1 など）         ← kidori：display.ts
    adjusts.ts           調整寸法の表の行（書きかけ）・式で使える調整寸法・変えるときの確認（第1.7版。12.1・12.3）
    dimensions/
      resolve.ts         依存関係（計算順・循環・存在しない部材）← kidori：dimensions/resolve.ts
      index.ts           computeDimensions(job, adjusts)：仕上がり・木取り寸法とエラー
    packing/
      pieces.ts          部材 → 片、回転の向き、入らない片       ← kidori：pieces.ts（材料ごとの分けを外す）。expandPieces(job, dims, frozen)・orientationsFor・piecesOf
      sheet.ts           使える範囲（端切り）・刃厚込みの入り判定 ← kidori：sheet.ts（材料の型を板の大きさ BoardSize に）
      guillotine.ts      帯詰め（同じ幅の優先・並べ方の選び方 chooseWay を含む） ← kidori：guillotine.ts（手持ち packOnStock・SheetSpec を外し、1種類の板だけに）
      cutOrder.ts        切る順番（画面には出さない）            ← kidori：cutOrder.ts（そのまま）
      scraps.ts          端材                                     ← kidori：scraps.ts（そのまま）
      yield.ts           歩留まり                                 ← kidori：yield.ts（そのまま）
      sizes.ts           3×6 と 4×8 の比べ                        ← kidori：sizes.ts（材料の行を外す）
      index.ts           packJob(job, dims, options?)：固定した1枚を除いた入口（第1.4版でおまかせをなくした） ← kidori：packing/index.ts
    hints/
      saving.ts          板を減らせるときのお知らせ findSavingHint(job, adjusts)（第1.5版。11.1） ← kidori：hints/saving.ts（材料ごと・重ね切り・手持ちを外す）
    progress/
      frozen.ts          固定した1枚・部材が変わったことの検出   ← kidori：progress/frozen.ts
      checks.ts          片のチェックの付け外し（1つ目で固定・全部で切り終わり・全部外すと固定を外す） ← kidori：store/jobs.ts の setPieceCheck・setPartCheck
      sheetChecklist.ts  1枚ごとのチェックの一覧（同じ部材を1行）← kidori：sheetChecklist.ts
      partProgress.ts    部材ごとの進み具合（2/5）               ← kidori：partProgress.ts
    clipboard/
      copy.ts            部材の複製・複製の名前（第1.1版の部材まるごとのコピー・貼り付けは第1.2版でなくした）  ← 新しく作る
      cells.ts           セルのコピーと貼り付け・消す・行を削除（第1.2版 E-12。8.1）  ← 新しく作る
    parts.ts             表示用の名前（空なら #行番号）・式から参照できる部材・切り出す枚数（第1.1版 E-10。7.1）
    shape.ts             仕事・部材・調整寸法の形の確かめ（保存データとファイルの読み込みで使う。第1.1版 E-11）
    transfer/            共有とバックアップのファイル（envelope・share・backup・read・importFile。第1.1版 E-11。7.2） ← kidori：store/transfer/ を参考に作り直す
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
      BoardSettings.tsx  木取りの画面の上の板（3×6・4×8・自由入力）・刃厚・端切り・切り代・切り方（第1.2版。SettingsPanel.tsx はなくした）
      AdjustPanel.tsx    部材の画面の上のたたんだ「調整寸法」（第1.2版）
      AdjustList.tsx     調整寸法の一覧・追加（逃げ／ほぞ／自由入力）
      PartRow.tsx        部材の1行（式 ｜ 計算した寸法、仕上がりの完了）
      PartEditor.tsx     部材の編集（名前・W・H・枚数・回転・複製）
      FormulaInput.tsx   式の入力（ボタン・カーソル・調整寸法のボタン。部材の寸法は表のセルを押して入れる＝第1.6版）← kidori の操作を参考
      Numpad.tsx         数字キー
      PastePreview.tsx   貼り付けの確認（第1.2版でなくした）
      SheetDiagram.tsx   配置図（SVG）
      SheetChecklist.tsx 1枚ごとの切り出しチェック
      Help.tsx           「ⓘ」の説明
```

- 画面の切り替えはルーター用のパッケージを使わず、状態（今のタブ）で切り替える（依存を増やさない）
- 計算の呼び出しは画面側で `computeDimensions` → `packJob` の順。`useMemo` で部材・設定・調整寸法が変わったときだけ計算し直す
- 持ってこない kidori のファイル：`flush.ts` `boards.ts` `dimensions/thickness.ts` `dimensions/finished.ts` `dimensions/cutSize.ts`（index.ts にまとめる）`dimensions/explain.ts` `formula/swapThickness` `packing/stack*` `packing/stock.ts` `packing/offcuts.ts` `packing/pairing.ts` `hints/`（第1.5版で `hints/saving.ts` だけ持ってきた。11.1） `migrate/` `progress/` の重ね切り・手持ち・端材の行の部分

## 2. データ型（`src/engine/types.ts`）

寸法は mm の number。比較は小数第1位に丸めてから行い、表示も小数第1位まで。

```ts
/** 部材の寸法の軸（板の面の2つ） */
export type Axis = 'W' | 'H'
export const AXES: readonly Axis[] = ['W', 'H']

// ---------- 入力 ----------

export type CutMode = 'vertical' | 'horizontal' // 縦切り優先 / 横切り優先（第1.4版で 'auto'＝おまかせをなくした。10.1）

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
  adjusts: AdjustRow[]          // 初めは メラミン1・シート0.5。第1.7版から書きかけの行も持つ（12.1。第1.6版までは Adjust[]）
  cellClip: CellClip | null     // 最後にコピーしたセル（第1.2版。8.1。第1.1版までは clipboard: CopiedPart[] | null）
  adjustClip: AdjustClip | null // 調整寸法の表で最後にコピーしたセル（第1.7版。12.1）
}

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
9. 部材の削除の確認用に `partsReferencing(parts, partId)`（`resolve.ts`）：その部材の寸法を式で使っている、ほかの部材と軸（`{ partId, name, axes }[]`）

### 3.3 木取り（`packing/`）— kidori 3.3・17.13 と同じ処理

- 板は1種類（`settings.sheet`）。kidori の「材料ごとに分ける」段は無くす
- 板の妻手・長手は `normalizeSheet`（`defaults.ts`。小さい方を width、大きい方を length）でそろえる。自由入力は `customSheet(a, b)` で作り、`packJob`・`freezeSheet` の頭でも必ずそろえる（逆に入れても同じ結果）
- 片の向き（`Orientation` の x＝妻手方向、y＝長手方向）：
  - 回転しない：x ＝ 木取り W、y ＝ 木取り H
  - 回転してよい：両方の向きを試す（kidori の `any` と同じ）
- 帯詰め・同じ幅の優先・右上から詰める・切る順番・端材（30mm 以上・大きい順）・歩留まりは kidori のまま
- 帯詰め（`guillotine.ts`）：`packGuillotine(pieces, usable, kerf, mode, sameWidthFirst = true)`。同じ幅を優先する並べ方（true）と、幅が収まる最初の帯に入れる並べ方（false。kidori 第2.4版まで）を持つ
- 並べ方の選び方（`guillotine.ts` の `chooseWay(fixed, run)`・`preferSameWidth`。kidori 17.13 の `packing/index.ts` から移した）：両方を計算し、入らない片が少ないほう → 板が少ないほう → 同じなら同じ幅を優先するほう。`packJob`（E-06）は設定の切り方で、2つの並べ方を `chooseWay` で比べる（第1.4版でおまかせをなくした）
- 回転してよい片の向き（E-17。仕様書 23）：`packGuillotine` の引数 `orientFirst: 'long' | 'short'`（初期値 'long'）。'short' は、すでにある帯に置くときだけ帯の中の方向に短い向き（帯の長さを使わない向き）を先に試す（新しい帯を作るとき・並べる順は 'long' と同じ）。`chooseLayout(fixed, run, rotatable)` が向きごとに `chooseWay` で同じ幅の優先を選び、'short' が「入らない片が少ない → 板が少ない」で勝つときだけ 'short' を採る（同じなら 'long'＝今までの並べ方。`betterThan`）。回転してよい片が無ければ 'short' は計算しない。`packJob` の `options.orientFirst` で向きを決めて計算できる（比べ・テスト用）
- 部材 → 片（`pieces.ts`）：`expandPieces(job, dims, frozen)` で部材ごとの片の並び（枚数0 は除く、寸法のエラーは `skipped`）、`piecesOf(runs, board, trim, mode)` で向きを決めて片にする（どう置いても入らない部材は `unplaced`＝tooLarge）。向きの判定は設定の切り方の範囲
- 入口は `packJob(job, dims, options?)`。`options.sameWidthFirst` を指定するとその並べ方だけで計算する（比べ・テスト用。ふつうは指定しない）。`unplaced` は部材の並び
- 固定した1枚（`frozenSheets`）の片は、部材ごとの必要な枚数から数だけで引いてから並べる（`progress/frozen.ts` の `frozenDemand(job)` → `expandPieces` の引数 `frozen`。kidori と同じ）
- 全体の歩留まり（`yieldRate`）も、`sheetCount` と同じ1枚たち（固定した1枚（切り終わりを含む）＋ 計算した1枚）で出す（暫定）
- `sheetCount` ＝ 固定していて切り終わっていない1枚 ＋ 切り終わった1枚 ＋ 計算した1枚（暫定。kidori と同じ数え方にそろえる）

### 3.4 3×6 と 4×8 の比べ（`packing/sizes.ts`）

- 今の設定の板のサイズを 3×6・4×8 に置き換えて `packJob` を2回呼び、枚数・歩留まりを返す
- `compareStandardSizes(job, dims)` → `{ options: [3×6, 4×8], fewer, higher }`（kidori は材料ごとの配列。1種類の板なので1つだけ返す）。`options` は種類・妻手・長手・枚数・歩留まり・入らない部材の数
- 印（`pickBetterSize`）：枚数が少ない方 `fewer`、歩留まりが高い方 `higher`（小数第1位の % で比べる）。入らない部材が出るサイズ・枚数 0 のサイズがあれば比べない（どちらも null）。同じなら null
- 固定した1枚は、どちらの計算でもそのまま数える（暫定）

### 3.5 切り出しチェック（`progress/`）— kidori 第1.8版・第2.7版と同じ

- 1枚ごとのチェックの一覧は、同じ部材を1行にまとめる（`sheetPartChecklist(job, layout, checked)` → `{ partId, name, sizeLabel, pieceIds, done }[]`。kidori：`sheetPartChecklist`）。並びは切る順番に取り出される順（`pieceReleaseSteps`）。名前は今の部材名（部材が無ければ写しの名前）、寸法は写しのまま
- 1つ目のチェックで、その1枚を `FrozenSheet` として写す（`freezeSheet(job, mode, layout, id, now)`。kidori：`freezeSheet`）。全部外したら消す
- チェックの付け外しは `checks.ts`（kidori では store にあったものを、純粋関数として engine に置いた）：
  - `SheetTarget` ＝ `{ kind: 'computed', mode, layout }`（計算した1枚）か `{ kind: 'frozen', sheetId }`
  - `setPartCheck(job, target, partId, done, now, id?)`：その1枚の同じ部材をまとめて付け外し（画面の1行）。`setPieceCheck(job, target, pieceId, done, now, id?)`：片1つ
  - 戻り値は `{ ok: true, job }` か `{ ok: false, message }`。計算した1枚に付けるときは、新しい固定した1枚の `id` が要る。`updatedAt` は付けない（保存の側で付ける）
  - 全部チェックで `completedAt`（切り終わり）、1つ外すと消す。全部外すと固定した1枚を消す
- 固定した1枚の部材の寸法・枚数が今の部材と違えば「部材が変わっています」（`frozenSheetViews(job, dims)` → `{ sheet, drift, complete }[]`。drift の理由は size（木取り寸法が違う・エラー）／count（固定した片の数 ＞ 今の枚数）／removed（部材が無い）。kidori：`frozenSheetViews` の drift）
- 部材ごとの進み具合は、全部の固定した1枚（切り終わりを含む）のチェックから数える（`partCutProgress(job)` → `{ partId, name, done, total }[]`。枚数0 の部材は入れない。kidori：`partCutProgress`）
- **画面向けの注意**：`pieceId` は1枚の中でだけ重ならない。固定した片を引いたあと残りの片の連番は #1 からふり直すので、別の1枚に同じ `pieceId` があり得る。1枚をまたいで区別するときは、1枚の id（固定した1枚の `id`、計算した1枚なら何枚目か）と組にする
- **画面向けの注意**：計算した1枚の `SheetLayout.index` は、固定した1枚があっても 1 から。画面では 固定した1枚 → 計算した1枚 の順に通し番号を振り直す
- kidori の `sheetProgress`（済んだ工程・残りの材料）は持ってこない（切る順番は画面に出さないため。取り出す工程 `pieceReleaseSteps` だけ `sheetChecklist.ts` に持ってきた）

### 3.6 コピーと貼り付け（`clipboard/copy.ts`）— 新しく作る

> 第1.2版で `copyParts`・`previewPaste`・`applyPaste`・`CopiedPart`・`AppData.clipboard` はなくした（セルのコピーと貼り付けに替えた。8.1）。残っているのは `duplicateName`・`duplicatePart` だけ。下は第1.1版の記録

- `copyParts(job, partIds)` → `CopiedPart[]`（並び順は画面の順。式は式のまま。id・仕上がりの完了は持たない）
- `previewPaste(job, copied, adjusts)` → `{ rows, addCount, skipCount, hasWarnings }`
  - `rows` は行ごとに `{ part, ok: true, warnings }` か `{ part, ok: false, reason: 'duplicateName', message: '棚板 はもうあります', warnings }`
  - 同じ名前は、今の部材とも、貼る部材どうしとも比べる（normalizePartName で。貼る部材どうしは2つ目から足せない）
  - `warnings`：貼ったあとの仕事（今の部材 ＋ 貼る部材）に無い部材の参照があれば `['全体 がありません']`、`adjusts` に無い調整寸法を使っていれば `'削除した調整寸法を使っています'`
- `applyPaste(job, copied, newId)` → 足せる部材だけを後ろに足した仕事（id は `newId('part')`、仕上がりの完了は外す）
- `duplicateName(job, name)` → 「棚板のコピー」「棚板のコピー2」…（重ならない名前。「棚板のコピー」を複製しても「棚板のコピー2」）
- `duplicatePart(job, partId, newId)` → `{ ok: true, job, partId }`（式・枚数・回転を写し、元の部材のすぐ後ろに足す。仕上がりの完了は外す）か `{ ok: false, message }`
- どれも仕事を書き換えずに新しい仕事を返す。`updatedAt` と `AppData.clipboard` への保存は store の側で行う

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
| 式の入力 | 欄の上の1行に計算結果かエラー。下にボタン（第1.6版 20.1）：調整寸法のボタンの欄、`＝ ＋ − × ÷`／全部消す 1 2 3 ⌫／◀ 4 5 6 ▶／( 7 8 9 )／閉じる 0 . 次へ。「＝」で始めた入力中は、ほかの部材の W・H のセルを押すと 部材名.W が入る（20.2。第1.5版までの「部材」のタブはなくした） |
| 設定 | 板のサイズ（3×6／4×8／自由入力）、刃厚、端切り、切り代、切り方、調整寸法の一覧と追加 |
| 木取り | 上に必要な枚数・全体の歩留まり、3×6 と 4×8 の比べ。板ごとに配置図（端材の寸法入り）・歩留まり・端材の一覧・切り出しチェック。切り終わりの1枚は下にたたむ。入らない部材・エラーの部材の知らせ |

**配置図**（`SheetDiagram.tsx`）：kidori と同じく `viewBox` を板の寸法（mm）にして画面幅に合わせる。端切り・部材（名前と木取り寸法）・端材（寸法）を色分け。チェックした片はグレー。

## 6. 公開

- GitHub Pages。`main` に入ったら、チェック → ビルド → 公開（kidori の `.github/workflows/deploy.yml` と同じ）
- ホーム画面に追加できるよう `public/manifest.webmanifest` とアイコンを置く（アイコンは kidori と同じ。名前・短い名前は「Kidori Lite」。オーナー決定）

## 7. 第1.1版の変更（仕様書 15章）

### 7.1 名前が空の部材・枚数が空の部材（E-10。`src/engine/parts.ts`）

```ts
export interface Part {
  id: string
  name: string                  // 空でもよい。重なりの判定は名前のある部材どうしだけ。空の部材は式から参照できない
  expr: Record<Axis, string>
  quantity: number | null       // null＝枚数が空（寸法は計算するが、木取り・必要な枚数・進み具合・比べに入れない）。0 は寸法だけの行
  rotatable: boolean
  finishedDone: boolean
}
// PartDimensions.quantity も number | null。PartDimensions.name は表示用の名前（下の partLabelAt）
```

- `hasName(part)`：名前があるか（前後の空白を外して空でない）
- `partLabel(job, partId)` → 名前があれば名前、空なら「#行番号」（`job.parts` の並びで 1 から）。部材が無ければ `''`
- `partLabelAt(part, index)`・`partLabels(parts)`（id → 表示用の名前の Map）：たくさん出すとき用
- `referableParts(parts)`：式から使える部材（名前のある部材だけ。第1.6版で「部材」のタブはなくし、画面では名前の無い部材のセルを押したときに知らせる）
- `cutQuantity(quantity)`：切り出す枚数（null と 0 は 0）
- 表示用の名前を使う所：`computeDimensions` の `PartDimensions.name`（→ `Placement.name`・`unplaced`・`skipped`）、エラーの文の `部材.W`、`partsReferencing`、`adjustUsages`・`partsUsingAdjust` の部材名、`sheetChecklist`・`sheetPartChecklist`、`frozenSheetViews` の drift、`partCutProgress`
- 行番号は今の並び順なので、上に行を入れると変わる。チェックの一覧・進み具合・drift は今の行番号で出す。固定した1枚の写しの `Placement.name` は固定したときの表示名のまま（部材を消したときだけ使う）
- 名前の重なり：`validatePartName('')` は null（使える）。`otherNames` の空の名前とは比べない。`previewPaste`・`applyPaste` も名前のある部材どうしだけ比べる。`duplicateName(job, '')` は `''`（複製しても空のまま）
- `renamePart` で空にする／空から名前を付けるときは、ほかの式を書き換えない（空にした部材を参照していた式は元の名前のまま残り、`unknownRef` になる）（暫定）
- 枚数が空：`expandPieces` で片にしない（エラーがあっても `skipped` に出さない）。`partCutProgress` に入れない。固定した片がある部材の枚数を空にすると drift は `count`（0 枚とみなす）（暫定）
- 保存データ：`store/storage.ts` の形の確かめは `quantity: null` と `name: ''` を通す。第1版のデータ（名前も枚数も入っている）はそのまま読める（`version` は 1 のまま）

### 7.2 共有とバックアップのファイル（E-11。`src/engine/transfer/`）

kidori の `store/transfer/`（envelope・share・backup・read）を参考に、engine の純粋関数として作り直した（材料・フラッシュ・重ね切りの組・版の移し替えは無い）。ブラウザの共有シート・ファイルの選択は画面（U-13）の側で行う。

```ts
// envelope.ts
interface JobFile    { app: 'kidori-lite'; kind: 'job';    version: 1; job: Job;    adjusts: Adjust[] } // adjusts はその仕事の式で使っているものだけ
interface BackupFile { app: 'kidori-lite'; kind: 'backup'; version: 1; jobs: Job[]; adjusts: Adjust[] } // 全部の仕事と調整寸法の一覧
type TransferFile = JobFile | BackupFile
const READ_FAILED = '読み込めませんでした'
```

| ファイル | 関数 | 内容 |
|---|---|---|
| `share.ts` | `jobFile(job, adjusts)` → `JobFile`、`buildJobFile(job, adjusts)` → JSON の文字列 | 切り出しチェック（`frozenSheets`）と仕上がりの完了を外す。調整寸法は式で使っているものだけ（アプリの一覧の並び） |
| | `jobFileName(job)` → `本棚.kidori-lite.json` | 使えない文字（`\ / : * ? " < > |`・制御文字・空白）は `_` に置き換え、50 文字まで。空なら `仕事.kidori-lite.json`（暫定） |
| `backup.ts` | `backupFile(data)`・`buildBackupFile(data)` | 全部の仕事（チェックも）と調整寸法の一覧をそのまま。コピーした部材（`clipboard`）は入れない |
| | `backupFileName(now)` → `kidori-lite-バックアップ-2026-10-22.json` | 端末の日付 |
| `read.ts` | `readTransferFile(text)` → `{ ok: true, kind: 'job', file, summary: { jobName, partCount } }` ／ `{ ok: true, kind: 'backup', file, summary: { jobCount, jobNames } }` ／ `{ ok: false, message: '読み込めませんでした' }` | 空・JSON でない・形が違う・`app` が違う（kidori のファイルを含む）・`version` が違う・20MB 超は読めない。例外を投げない。先頭の BOM は外す |
| `importFile.ts` | `importTransfer(data, file, newId, now)` → `{ data, jobIds, addedAdjusts, message }` | 今の `AppData` に足した新しい `AppData`（下） |

- **取り込み**（`importTransfer`）：仕事・部材・固定した1枚の id を `newId('job' | 'part' | 'frozen')` で振り直し、仕事の一覧の後ろにコピーとして足す（今ある仕事・コピーした部材は変えない）。仕事の名前が今の仕事と重なれば「棚のコピー」「棚のコピー2」（暫定）
  - 調整寸法：ファイルの調整寸法ごとに、表示名（`adjustNameKey`）が同じものが今の一覧にあればその id、無ければ `newId('adjust')` で一覧の後ろに足す。式の `{n:id}` を `formula/usages.ts` の `remapAdjustIds(expr, map)` でつけ替える（ファイルに無い id＝削除した調整寸法はそのまま）
  - 共有（`kind: 'job'`）：固定した1枚・仕上がりの完了は無し（ファイルに入っていても外す）。作った日・変えた日は `now`
  - バックアップ（`kind: 'backup'`）：固定した1枚（片の `partId`・`pieceId`・`checked` を新しい部材の id につけ替える）・仕上がりの完了も戻す。作った日・変えた日はファイルのまま
  - `message`：「「本棚」を取り込みました」／「3件の仕事を追加しました」。保存（`updatedAt` を付けない・開く仕事を変えない）は store の側で行う
- **形の確かめ**（`src/engine/shape.ts`）：仕事・部材・調整寸法・コピーした部材の形の確かめ（`isJob`・`isAdjust`・`isCopiedPart`・`isRecord`）を `store/storage.ts` から engine に移し、保存データの読み込みとファイルの読み込みで同じものを使う

### 7.3 部材の表（U-11。`src/ui/components/PartsTable.tsx`・`src/ui/partsTable.ts`）

- ［仕上がり］のタブは部材の表（番号・名前・W・H・枚数）。行の数は `tableRowCount`（10行か、部材の数 ＋ 空の行1つ）。選んでいる欄は部材の id で持つ（空の行は id なし）
- 名前は `<input>`（スマホのキーボード）。書きかけは画面に持ち、確定（キーボードの「次へ」・ほかの欄・表の外・キーボードを閉じる）で `updatePart` / `addPart`。W・H・枚数は `<button>` で、押すと画面の下にアプリのキー（`FormulaKeys.tsx`：編集シートの式の入力と同じ部品。枚数は数字だけ）。キーを押すたびに `updatePart`（空の行なら `addPart`。枚数は空から）
- 何も入っていない部材（`isBlankPart`）は、選んでいない間に `removePart` で外す。途中の空の行を押すと、いちばん上の空の行に入る（`inputRow`）
- 「次へ」は `nextCell`。名前へ移るときは、押した操作の中で次の行の `<input>` に注目を移す（スマホのキーボードが出るように）
- 番号を押すとメニュー（`PartMenu.tsx`。下から出るシート）：回転・仕上がりの完了は `updatePart`、複製は `duplicatePart`、上に行を入れるは `insertPart`（その位置に空の部材を入れ、`PartsTable` の `editName` で名前の欄を選ぶ）、削除は `removePart`（`partsReferencing` で使われていれば確認）（U-12）
- 「全部回転してよい」は `rotationState`（全部／一部／なし）と `setAllRotatable`。「選んで削除」は `removeParts`（確認の注意は `referencingOthers`＝`partsReferencing` をまとめたもの）（U-12）
- ［木取り］のタブは `CutTable.tsx`（同じ表の形で見るだけ。`cutDimCell`・`cutQuantityText`・`partCutProgress`）。部材の編集シート（PartEditor）・古い一覧（PartRow）・式の欄（FormulaInput）はなくした（U-12）

## 8. 第1.2版の変更（仕様書 16章）

### 8.1 セルのコピーと貼り付け（E-12。`src/engine/clipboard/cells.ts`）

```ts
// types.ts
export type CellCol = 'name' | 'W' | 'H' | 'qty'                 // 表の列（左から）
export const CELL_COLS: readonly CellCol[] = ['name', 'W', 'H', 'qty']
export interface CellPos { row: number; col: CellCol }           // row は表の行（0 から。job.parts の位置。部材の数以上は空の行）
export interface CellClip { rows: number; cols: number; cells: string[][] } // cells[行][列]。名前・式は書いたまま、枚数は数字の文字、空は ''
// AppData.cellClip: CellClip | null（最後の1回分。ほかの仕事でも貼れる）
```

| 関数 | 内容 |
|---|---|
| `selectionShape(cells)` | `{ kind: 'none' }`／`{ kind: 'range', top, left, rows, cols }`（1つのセルは 1×1。left は列の位置 0〜3）／`{ kind: 'scattered' }`。押した順・同じセルの重なりは問わない |
| `cellText(job, pos)` | セルの中身の文字（空の行は ''） |
| `copyCells(job, cells)` | `{ ok: true, clip }`／`{ ok: false, message: 'コピーは1つのセルか、四角い範囲を選んでください' }` |
| `pasteCells(job, clip, cells, newId)` | `{ ok: true, job, pasted, skipped: { cell, reason, message }[], renamed }`（renamed は第1.4版。10.2）／`{ ok: false, message: '貼るセルを選んでください' }`。reason は `invalidName`（名前に使えない文字。validatePartName の文）・`notQuantity`（枚数には 0 以上の整数だけ貼れます） |
| `clearCells(job, cells)` | 中身を空に（枚数は null）。行の全部の欄が空になった部材（`parts.ts` の `isBlankPart`）は消す |
| `deleteRows(job, cells)` | 選んだセルのある行の部材をまとめて消す。`selectedPartIds(job, cells)` で消す部材の id（式で使われているかは `ui/partsTable` の `referencingOthers`＝`partsReferencing` で確かめる） |

- **貼り付け**：1×1 のコピーは選んだセル全部に同じもの。範囲のコピーは選んだセルの一番左上（いちばん上の行・いちばん左の列。四角でない選び方なら外枠の左上）から同じ形。枚数の右にはみ出す列は貼らない（貼れなかった数にも入れない）
- 空の行（部材の数以上）に貼ると部材を作る（`newId('part')`・名前と W・H は空・枚数は空・回転しない）。途中の空の行も、部材の後ろに上から詰めて足す（暫定）。空だけを貼った行は作らない
- 名前は前後の空白を外して入れる。（第1.4版で変えた：重なる名前は貼らずに番号を振る。10.2）第1.2版：貼ったあとに名前のある部材どうしで同じ名前（`normalizePartName`）になるものは貼らない：元のまま残る名前と重なる名前は貼らず、貼るものどうしで重なるときは上（左）の1つだけ貼る（入れ替え A・B → B・A は貼れる）。ほかの式の参照は書き換えない（名前の変更ではない）
- W・H は文字のまま式として入れる（読めなければ計算のエラー）。枚数は 0 以上の整数（全角の数字も）だけ、空は空に
- 貼って行の全部の欄が空になった部材は消す。1つも貼れなかったときは同じ仕事を返す
- **保存データ**：`store/storage.ts` の `parseAppData` は `cellClip` を `shape.ts` の `isCellClip` で確かめ、形が違えば null（仕事は読める）。第1.1版までの `clipboard` はあっても読んで捨てる。バックアップ・共有のファイルには入れない
- **store**（`reducer.ts`）：`{ type: 'copyCells', cells }`（`cellClip` を置き換える。仕事は変えない）、`{ type: 'pasteCells', cells }`（結果の `paste: { pasted, skipped }`）、`{ type: 'clearCells', cells }`、`{ type: 'deleteRows', cells }`（空の行だけなら「削除する行を選んでください」）。どれも `jobId` を省くと開いている仕事。古い `copyParts`・`pasteParts`・`removeParts` と `jobs.ts` の `removeParts` はなくした
- 画面の古い「選んでコピー」「貼り付け（◯件）」「選んで削除」と `PastePreview.tsx` は外した。新しい画面は U-14

### 8.2 枚数のキー・行を足す・調整寸法（U-15。spec 16.2・16.5・16.6）

- 枚数のキーも `FormulaKeys.tsx` を使う（`quantity: { onKey }` を渡すと数字・1字消す・全部消す だけ押せ、調整寸法のボタン・＝・記号・( )・◀▶・小数点は同じ場所に薄く出して押せない）。「閉じる」「次へ」は `FormulaKeys` の `onClose`・`onNext`（W・H・枚数で同じ位置）
- 「＝」（第1.6版 20.2）：式の文字には入れず、`PartsTable` の `equals` で持つ。開くときは `formulaEdit.ts` の `opensAsFormula`（部材の寸法・調整寸法を使っている式か、先頭に「＝」が付いた式）。engine は式の先頭の「＝」「=」を読み飛ばす（`tokenize.ts` の `splitChunks`・`splitLeadingEquals`）。色の枠は `refColorsOf`・`refCellsOf`
- 調整寸法のボタンの欄の「＋ 追加」：`FormulaKeys` の `onAddAdjust(draft)`（`PartsTable` が store の `addAdjust` を呼び、足した id を返す）。重なりの判定は `store/jobs.ts` の `validateAdjust`。足したら `{n:id}` をカーソルの位置に入れる
- 「＋ 5行足す」：`ui/partsTable.ts` の `tableRowCount(partCount, minRows)`・`addRowsMin`。足した行の下限は `sessionTableMinRows`／`setSessionTableMinRows`（モジュールの中の Map。仕事ごと・保存しない）
- 部材の画面の上のたたんだ欄は `AdjustPanel.tsx`（中身は `AdjustList.tsx`）

### 8.3 板〜切り方を木取りの画面へ・切り代（U-16。spec 16.3・16.4）

- 木取りの画面の上は `BoardSettings.tsx`：［3×6］［4×8］は `compareStandardSizes` の枚数・歩留まり、［自由入力］は今の板の `packJob` の結果。押すと `setSheet`。刃厚・端切り・切り代・切り方は `updateSettings`。「3×6 と 4×8 の比べ」の別の欄はなくした
- 部材の画面の［木取り］のタブのときだけ、表の上に切り代の欄（`NumberField`・`updateSettings`）。木取りの画面の切り代と同じ `job.settings.allowance`
- 部材の画面の `SettingsPanel.tsx` はなくした

## 9. 第1.3版の変更（仕様書 17章）

### 9.1 範囲・切り取り・オートフィル（E-13。`src/engine/clipboard/cells.ts`）

```ts
// types.ts
export interface CellRange { top: number; left: number; rows: number; cols: number } // left は列の位置（0＝名前 … 3＝枚数）
export interface CellCut { jobId: string; range: CellRange }                          // 切り取った元
export interface CellClip { rows: number; cols: number; cells: string[][]; cut?: CellCut } // cut が無ければふつうのコピー
// cells.ts
export type CellSelection = CellRange | readonly CellPos[]  // 今までの関数は、セルの配列でも四角でも受け取る
```

| 関数 | 内容 |
|---|---|
| `rangeCells(range)` | 四角 → セルの配列（上から・左から。表の左右・0 より上ははみ出さない） |
| `rowRange(top, rows = 1)` | 行全体＝名前〜枚数（left 0・cols 4） |
| `columnRange(job, left, cols = 1)` | 列全体＝上から部材の数の行（空の行は入れない。部材が無ければ1行） |
| `selectionRange(sel)` | 四角（1つのセルも）なら表の中に収めた四角、それ以外は null |
| `cutCells(job, sel)` | コピーと同じ結果に `clip.cut = { jobId: job.id, range }` を付ける。仕事は変えない |
| `pasteCells(job, clip, sel, newId)` | 第1.2版と同じ。結果に `cutClear: { jobId, cells } \| null` が増えた（切り取りを違う仕事に貼ったとき、元の仕事で空にするセル） |
| `clearCutSource(job, clip, cells)` | 違う仕事に貼ったあと、元の仕事のセルを空にする（切り取ったあとに書き換えたセルは空にしない） |
| `fillCells(job, from, to, newId)` | オートフィル。結果は `pasteCells` と同じ形（`cutClear` はいつも null）。範囲でない from は `{ ok: false, message: '引く元の範囲を選んでください' }` |

- **切り取りの貼り付け**：元のセルを空にする。空にしないのは、貼る先と重なるセル・クリップのその位置が1つも貼れなかったセル（同じ名前・枚数に式など）・切り取ったあとに中身を書き換えたセル。同じ仕事なら、元を先に空にしてから名前の重なりを比べる（同じ仕事の中で名前ごと動かせる）。全部の欄が空になった部材は消える。1つも貼れなければ何もしない
- **オートフィル**：to は引いたあとの範囲（元を含む）でも、元を除いた所だけでもよい。元の行は書かず、列はいつも元の列（上下だけ）。行 r には元の `(r − top) mod rows` 番目の行を入れる（上へ引いても並びがつながる）。名前の列も入れ、重なる名前には番号を振る（第1.4版。10.2。第1.3版の `fillName` はなくした）。枚数・W・H・行が足りないときの部材の足し方は貼り付けと同じ
- **保存データ**：`shape.ts` の `isCellClip` は cut を無くてもよいとし、あれば形を確かめる（`isCellRange`）。`readCellClip` は cut だけ形が違えば cut を外してふつうのコピーとして読む。第1.2版の保存データはそのまま読める
- **store**（`reducer.ts`）：選んだセルは `SelectionArg = { cells: CellPos[] } | { range: CellRange }`。`copyCells`・`cutCells`・`pasteCells`・`clearCells`・`deleteRows` はどちらでも呼べる。`{ type: 'cutCells', range }`（cellClip を置き換える。仕事は変えない）、`{ type: 'pasteCells', range }`（切り取りなら元を空にし、ほかの仕事でも空にして updatedAt を付ける。1つでも貼れたら cellClip から cut を外す）、`{ type: 'fillCells', from, to }`（結果の `paste: { pasted, skipped }`）

## 10. 第1.4版の変更（仕様書 18章）

### 10.1 切り方の「おまかせ」をなくす（E-14。spec 18.2）

- `CutMode = 'vertical' | 'horizontal'`。`packJob` は設定の切り方だけで並べる（縦切り・横切りの比べ `preferFirst`・`largestScrap` はなくした）。2つの並べ方の比べ（`chooseWay`）はそのまま
- `shape.ts` の `isJob`（`isSettings`）は 'vertical'・'horizontal' だけを通す。古いデータは **`readJob(v)`・`readJobs(v)`** で読む：`settings.cutMode === 'auto'` なら 'vertical' にしてから `isJob` で確かめる（spec 18.2【案】）
- 使う所：`store/storage.ts` の `parseAppData`（保存データ）、`transfer/read.ts` の `readTransferFile`（共有・バックアップのファイル）。読んだあとの仕事はもう 'auto' を持たない
- `store/jobs.ts` の `updateSettings` も 'auto' を断る（「切り方が正しくありません」）。画面の切り方のボタン（`ui/settings.ts` の `CUT_MODES`）は2つ、木取りの画面の「おまかせで選択」の印はなくした

### 10.2 名前を貼る・オートフィルで番号を振る（E-14。spec 18.3。`clipboard/cells.ts`）

- `pasteCells`・`fillCells` の名前の欄は `assignNames(parts, writes)` で決める（parts は同じ仕事の切り取りの元を空にしたあと）
  1. 前後の空白を外す。名前に使えない文字なら貼らない（`invalidName`。今までどおり）
  2. 書く先が今と同じ名前（`normalizePartName`）なら、今の名前のまま（コピー元のセルが貼る先に入っていても名前は変えない）（暫定）
  3. 「残る名前」＝書かない行の名前（使えない名前で貼らなかった行も今の名前が残る）。残る名前と重なる、または貼るものどうしで重なる名前は **後ろに番号を振る**。重ならない名前はそのまま（切り取りで動かす・ほかの仕事から貼る・入れ替え A・B → B・A）
  4. 番号は 1 から、残る名前・そのまま貼る名前・先に振った名前のどれとも重ならない一番小さい番号。上から・左から順に振る。比べは `normalizePartName`（「棚板１」があれば「棚板2」）
  5. 名前の終わりが数字（半角・全角）なら、その数字を外した名前に番号を振る（「棚板1」を貼って重なれば「棚板2」。「棚板11」にしない。spec 18.3【案】。U-20 で直した）。数字だけの名前は外すと空になるので、そのまま後ろに振る（「12」→「121」）（暫定）。貼るものどうしだけが重なるときも全部に振る（棚板 を3つに貼る → 棚板1・棚板2・棚板3）（暫定）
- 結果に **`renamed: { cell, from, to }[]`**（番号を振ったセル。上から・左から）を足した。store の `PasteSummary` にも `renamed`。`PasteSkipReason` は `'invalidName' | 'notQuantity'` だけ（`duplicateName`・`fillName` と `DUPLICATE_NAME_MESSAGE`・`FILL_NAME_MESSAGE` はなくした）
- オートフィルは名前の列も入れる。元の名前が空なら空を入れる（W・H と同じ）（暫定）

### 10.3 式の「入れている途中」の印（E-14。spec 18.5）

- `FormulaError.incomplete?: true`・`DimensionError.incomplete?: true`。付くのは syntax のエラーで、次の形のとき：
  - 空（「数値か式を入れてください」）
  - 終わりが記号か「(」（`全体.W -` →「式が「−」で終わっています（後ろに数値か部材の寸法を入れてください）」。`-` だけ・`全体.W - -` も）
  - かっこが閉じないまま終わる（「閉じかっこ「)」が足りません」）
  - 終わりが「1.」（小数点の後ろの数字がまだ。「「1.」の小数点の後ろに数字を入れてください」）（暫定）
- 途中の形より前に別のエラーがあれば、そのエラー（印なし。例：`全体.W 0 -`）
- 参照している寸法に伝わったエラー（`from` のあるもの）には付けない（暫定）。画面は入力中のセルの寸法のエラーのうち `incomplete` のものを出さない
- 式だけを確かめる関数：`isIncompleteFormula(expr)`（`formula/parse.ts`）
- 仕様書 18.5 の書き足し（入力中は「50全体.W − 厚み20」のような記号の抜けも含め、式の書き方のエラーを出さない）に合わせるなら、画面は入力中のセルの `kind === 'syntax'` のエラーを全部出さない（`incomplete` は「途中で終わっている」形の印として残す）

### 10.4 エラーの文を画面に見えている言葉に（E-14。spec 18.6）

- `parse(expr, adjusts?)`・`evaluateExpr(expr, lookup, adjusts?)`・`resolve(parts, adjusts?)` に調整寸法の一覧を渡せるようにした（`computeDimensions(job, adjusts)` は渡している）
- 字句の書き方は `tokenLabel(tok, expr, adjusts?)`：数値はそろえた数字、参照は「全体.W」、調整寸法は `adjustName`（無ければ「（削除した調整寸法）」、一覧を渡さなければ「調整寸法」）、記号は + − × ÷ ( )
- 文の一覧：

| 形 | 文 |
|---|---|
| 値が2つ続く | 「全体.W」と「メラミン1」の間に ＋ − × ÷ のどれかを入れてください（数字・かっこも同じ形） |
| 終わりが記号・( | 式が「−」で終わっています（後ろに数値か部材の寸法を入れてください） |
| 式の始めの + × ÷ ) | 式の始めに「×」は置けません |
| 記号・( のすぐ後ろの + × ÷ ) | 「+」のすぐ後ろに「×」は置けません |
| ( ) | かっこ「( )」の中が空です |
| かっこが閉じない | 閉じかっこ「)」が足りません |
| ) が多い | 閉じかっこ「)」が多すぎます（対になる「(」がありません） |
| 空 | 数値か式を入れてください |
| 部材名だけ | 「全体」が読めません（部材の寸法は「全体.W」「全体.H」のように書きます） |
| 読めない {…} | 「{t:x}」は読めない参照です（調整寸法はキーの「調整寸法」から入れ直してください） |
| 0 以下 | 計算結果が 0 以下になります（−200） |
| 参照先のエラー | 参照している「天板.W」が計算できません（…） |

- 天板.D・存在しない部材・削除した調整寸法・0 で割る・循環参照の文は今までどおり

### 10.5 画面の直し（U-20。spec 18.1・18.4・18.5・18.7）

- 空の行の名前の欄は、薄い「名前」の字（手引き）を出さない
- 部材の表の見出しは W・H を2段（「W／妻手」「H／長手」。下の段は 10px）。キーの上の行は「棚板 W（妻手）」。部材名が長いときは名前だけ「…」
- 入力中のセル（W・H のキーを出しているセル）は `ui/partsTable.ts` の `errorsWhileEditing` で出すエラーを決める：kind が syntax・nonPositive・divideByZero のもの（参照先から伝わった from のあるものは除く）は出さない。表の欄も、出さないエラーだけなら赤い「エラー」にせず空に見せる。入力を終えたら今までどおり
- 式の入力（`ui/formulaEdit.ts` の `insertAt`）は、前の単位のすぐ後ろに入れる（先頭に 5・0 と入れても「5 0」と離れない）
- キーの上の行の式を押すとカーソルが移る：`FormulaView` の `onCaret`。単位ごとの箱を測り `caretFromTap(boxes, x, y)`（押した高さに近い行の中で、単位の左半分なら前・右半分なら後ろ）
- 貼り付け・オートフィルで番号を振ったら、知らせに「。同じ名前にならないよう番号を振りました」を足す（`ui/cellSelect.ts` の `pasteText`・`fillText` の第3引数）

## 11. 第1.5版の変更（仕様書 19章）

### 11.1 板を減らせるときのお知らせ（E-15。spec 19.2。`src/engine/hints/saving.ts`）

- kidori の `hints/saving.ts` をコピーして直した。外したもの：材料ごとの分け（`materials` の配列）・重ね切りの組（`stackLabel`・`plan`）・手持ちが足りない材料の除外（`noStock`）・「切り代はフラッシュの部材だけ」の決まり・部材ごとの切り代の上書き。板は1種類（`settings.sheet`）
- 入口は **`findSavingHint(job, adjusts): SavingHint | null`**（kidori は材料ごとの配列 `findSavingHints(job)`。簡易版は板が1種類なので1つか null）
  - `SavingHint = { change: { kind: 'allowance' | 'trim', value }, from, to, message }`。`from`・`to` は固定した1枚を含む必要な板の枚数（`PackingResult.sheetCount`）
  - `message` は「切り代を 7mm にすると、板が 1 枚減ります」（`savingMessage(kind, value, from, to)`。値は小数第1位まで）（暫定：kidori の「（2枚 → 1枚）」は付けない。仕様書 19.2 の例のとおり）
- 試す値は `smallerSteps(今の値)`：今の値より小さい整数を大きい順に 1 まで、最後に 0.5（0 は試さない。今の値が小数なら切り捨てた値から。0.5 以下なら試さない）。kidori と同じ
- 流れ：今の設定で `packJob(job, computeDimensions(job, adjusts))`。枚数が 1 枚以下なら null。切り代を大きい値から試し、**枚数が減り入らない部材が増えない最初の値**（＝減る一番大きい値）で返す。切り代で減らなければ端切りを同じように。同時には変えない。板・切り方・刃厚は今のまま
- 減った所で止める（kidori は全部の材料が出たら止める。1種類なので同じ結果）。計算は最大で 1 ＋ 切り代の試す数 ＋ 端切りの試す数 回の `packJob`（初期値 切り代10・端切り5 なら 16 回）。部材 120 枚で 1 秒以内をテストで確かめた
- 固定した1枚（`frozenSheets`）は `packJob` と同じくそのまま数え、残りの部材だけで試す（kidori と同じ）
- 仕事のデータは書き換えない。画面は切り代・端切り（設定）・部材・調整寸法・固定した1枚が変わったら計算し直す
- kidori の画面（`SavingHints.tsx`）はお知らせを押しても値を変えない（知らせるだけ。「設定は変えていません」と添える）

## 12. 第1.7版の変更（仕様書 21章）

### 12.1 調整寸法の表の行と書きかけ（E-16。spec 21.1。`src/engine/types.ts`・`src/engine/adjusts.ts`）

```ts
// types.ts
export interface AdjustRow { id: string; name: string; value: number | null } // 表の1行。名前は空も可、寸法は 0 より大きい数か空
// AppData.adjusts: AdjustRow[]（第1.6版までは Adjust[]。Adjust は AdjustRow の「そろった」形なので、今までの保存データはそのまま読める）
// AppData.adjustClip: AdjustClip | null（調整寸法の表のクリップ。部材の表の cellClip とは別）
export type AdjustCol = 'name' | 'value'; export const ADJUST_COLS = ['name', 'value']
export interface AdjustCellPos { row: number; col: AdjustCol }            // row は AppData.adjusts の位置（行の数以上は空の行）
export interface AdjustClip { rows: number; cols: number; cells: string[][]; cut?: CellRange } // 範囲の left は 0＝名前・1＝寸法
```

- **書きかけの行**（名前だけ・寸法だけ）も `AppData.adjusts` に持つ。`Adjust`（名前と寸法がそろったもの）の型は変えない
- **式で使えるのは名前があり寸法が 0 より大きい行だけ**：`usableAdjusts(rows): Adjust[]`（表の並び。同じ配列を渡せば同じ配列を返す＝画面の useMemo 用）。式・表示・計算・木取り・お知らせ（`computeDimensions`・`formulaText`・`formulaLabels`・`parse`・`findSavingHint` など）には、いつも `usableAdjusts(data.adjusts)` を渡す（型で `AdjustRow[]` は渡せない）
- 書きかけの行を使っている式は、一覧に見つからないので「削除した調整寸法」と同じエラー（`unknownAdjust`）・表示（「（削除した調整寸法）」）。id は残るので、寸法を入れ直せば式は元に戻る
- 名前も寸法も空の行は保存しない（`isBlankAdjustRow`）。消すのは クリア・貼り付けで空になったとき・保存データの読み込み（`readAdjustRows`）・画面が入力を終えたとき（`dropBlankAdjustRows`・store の `removeAdjusts`）
- `adjusts.ts` のほかの関数：`isUsableAdjust`・`parseAdjustValue(text)`（空 → null、0 より大きい数（全角・小数）→ 数、それ以外 → undefined）・`adjustValueText(value)`・`adjustConflict(rows, row, exceptId?)`（表示名が同じになる、式で使える行）・`duplicateAdjustMessage`（「メラミン1」はもうあります）
- **保存データ**：`shape.ts` の `isAdjustRow`・`readAdjustRows`（形が違う行・同じ id があれば読めない。空の行は外す）、`isAdjustClip`・`readAdjustClip`（無い・形が違えば null、cut だけ違えば外す）。`store/storage.ts` の `parseAppData` が使う
- **ファイル**：共有（`jobFile`）・バックアップ（`backupFile`）には式で使える行だけを入れる（書きかけの行は入れない（暫定）。ファイルの形は第1.6版と同じなので前の版でも読める）。取り込み（`importTransfer`）は今の表の書きかけの行とは合わせない（式で使える行と表示名で合わせ、無ければ足す）。見本（`sampleJob`）も式で使える行からメラミン1 を探す
- `store/jobs.ts` の `validateAdjust`・`addAdjust`・`updateAdjust`・`removeAdjusts` は `AdjustRow[]` を受ける（重なりは式で使える行とだけ比べる）。今までの store の `addAdjust`・`updateAdjust`・`removeAdjusts` の操作は残した

### 12.2 調整寸法の表のセル操作（E-16。spec 21.1。`src/engine/clipboard/adjustCells.ts`）

部材の表の `cells.ts` と同じ考え方・同じ形の結果。選んだセルは `AdjustSelection = CellRange | readonly AdjustCellPos[]`。

| 関数 | 内容 |
|---|---|
| `adjustRowRange(top, rows = 1)`・`adjustColumnRange(rows, left, cols = 1)`・`adjustRangeCells(range)`・`adjustSelectionShape`・`adjustSelectionRange` | 行全体（left 0・cols 2）・列全体（行のある所まで）など |
| `adjustCellText(rows, pos)` | 名前、または寸法の数字の文字（丸めない。空は ''） |
| `copyAdjustCells(rows, sel)`・`cutAdjustCells(rows, sel)` | `{ ok: true, clip }`／`{ ok: false, message: 'コピーは1つのセルか、四角い範囲を選んでください' }`。切り取りは `clip.cut` に元の範囲 |
| `pasteAdjustCells(rows, clip, sel, newId)`・`fillAdjustCells(rows, from, to, newId)` | `{ ok: true, adjusts, pasted, skipped: { cell, reason: 'notValue' \| 'duplicate', message }[], renamed: { cell, from, to }[] }`。1つも貼れなければ `adjusts` は同じ配列 |
| `clearAdjustCells(rows, sel)` | 中身を空に（寸法を空にすると書きかけの行。id はそのまま）。名前も寸法も空になった行は消す |
| `deleteAdjustRows(rows, sel)`・`selectedAdjustIds(rows, sel)` | 選んだセルのある行をまとめて消す（空の行だけなら同じ配列） |
| `insertAdjustRow(rows, index, id)` | 行を上に挿入（空の行。表の下なら最後に） |
| `setAdjustCell(rows, pos, text, newId)` | セルに入力。`{ ok: true, adjusts, id? }`／`{ ok: false, message }`（「寸法は 0 より大きい数を入れてください」「「メラミン1」はもうあります」）。表の下の空の行なら行を足す。空になっても行は消さない（入力の途中） |
| `dropBlankAdjustRows(rows, keepId?)` | 空の行を外す（入力中の行は残す） |
| `numberedAdjustName(name, value, rows)` | 番号を振った名前（下） |

- **貼り付けの形**：部材の表と同じ（1つのセルは選んだセル全部、範囲は左上から同じ形。寸法の右にはみ出す列は貼らない。表の下の空の行は今の行のすぐ下に詰める）
- **寸法の欄**：0 より大きい数（全角・小数も）だけ。空は寸法を空にする（書きかけ）。式・文字・0 は貼らない（`notValue`「寸法には 0 より大きい数だけ貼れます」）
- **表示名が同じになる行は作らない**
  - 名前を書く行（行のコピー・名前の列）：重なれば **名前の後ろに丸つき数字 ②③… を付ける**（例：メラミン1 をコピーして貼る → 名前「メラミン②」、表示名「メラミン②1」）（暫定）。部材のように「メラミン2」にすると表示名が「メラミン21」になり寸法と読み分けられないため。② から、表示名が重ならない一番小さい番号。名前の終わりが丸つき数字なら外してから振る（メラミン② → メラミン③）。名前の終わりの普通の数字は外さない（逃げ1 → 逃げ1②）。㊿ まで使って重なれば貼らない（`duplicate`）
  - 今と同じ表示名を書く行は名前を変えない。重ならない名前はそのまま。同じものを2つ貼るときは上はそのまま・下に番号（部材の表は全部に振る。暫定）
  - 寸法だけを書く行（名前は書かない）：重なればその寸法は貼らない（`duplicate`「「メラミン1」はもうあります」）。入れ替え（x1・x2 → x2・x1）は貼れる
  - 書きかけになる行（名前だけ・寸法だけ）は表示名が無いので、重なりも番号も無い
- **切り取り**：部材の表と同じく、元のセルを先に空にしてから重なりを比べ、貼れた位置の元は空のまま・貼れなかった位置は戻す・切り取ったあとに書き換えたセルは消さない。表はアプリに1つなので、仕事をまたいでも同じ表。**行全体（名前・寸法）を切り取って空の行へ両方を貼ったときは、元の行の id を引き継ぐ**（式がついてくる）（暫定）
- **オートフィル**：部材の表と同じ（上下だけ・くり返し・元の行は書かない）。名前には貼り付けと同じく番号を振る

### 12.3 変える・消すときの確認（E-16。spec 21.3。`src/engine/adjusts.ts`）

- `changedAdjusts(before, after)`：前に式で使えた調整寸法のうち、消えた・書きかけになった・表示名（名前・寸法）が変わったもの
- **`adjustChangeUsages(jobs, before, after, currentJobId)`** → `{ changed, usages, jobCount, otherJobCount }`
  - `changed`：値・名前が変わる調整寸法のうち、**今の仕事以外で使っているもの**。空なら確認はいらない（この仕事でしか使っていない・どこでも使っていない）
  - `usages`：changed を使っている部材（全部の仕事。今の仕事も入る。`adjustUsagesOf` と同じ形）。`jobCount` はその仕事の数（「◯件の仕事で使っています」）、`otherJobCount` は今の仕事を除いた数
  - currentJobId が null なら全部の仕事を「ほか」とみなす
- 画面の流れ：store の `adjustTableOutcome(data, action, newId)` で操作のあとの表を作る → `adjustChangeUsages(data.jobs, data.adjusts, outcome.adjusts, currentJobId)` → changed があれば確認 → `dispatch(action)`

### 12.4 store（E-16。`src/store/reducer.ts`）

- 選んだセルは `AdjustSelectionArg = { cells: AdjustCellPos[] } | { range: CellRange }`
- 操作（`AdjustTableAction`）。どれも `AppData.adjusts`・`adjustClip` だけを変える（仕事の updatedAt は変えない）

| 操作 | 結果 |
|---|---|
| `{ type: 'setAdjustCell', pos, text }` | `id`＝入れた行の id。断るときは `{ ok: false, message }` |
| `{ type: 'copyAdjustCells' \| 'cutAdjustCells', range \| cells }` | `adjustClip` を置き換える |
| `{ type: 'pasteAdjustCells', range \| cells }` | `adjustPaste: { pasted, skipped, renamed }`。切り取りなら1つでも貼れたら `adjustClip` から cut を外す。コピーが無ければ「コピーしたセルがありません」 |
| `{ type: 'fillAdjustCells', from, to }` | `adjustPaste` |
| `{ type: 'clearAdjustCells', range \| cells }` | |
| `{ type: 'deleteAdjustRows', range \| cells }` | 空の行だけなら「削除する行を選んでください」 |
| `{ type: 'insertAdjustRow', index }` | `id`＝入れた空の行の id（入力を終えて空のままなら画面が `removeAdjusts` で外す） |

- `adjustTableOutcome(data, action, newId)`：上の操作を当てたあとの `{ adjusts, adjustClip, id?, adjustPaste? }`（純粋関数。reduce もこれを使う）。画面の確認（12.3）に使う
- 画面：`PartsScreen`・`KidoriScreen` は `usableAdjusts(data.adjusts)` を使う

### 12.5 画面（U-23。spec 21.1〜21.4。`src/ui`）

- `useGrid.ts`：表のセルを選ぶ仕組み（選んでいる範囲と起点・丸い取っ手・オートフィルの取っ手・長押し・表の端でのスクロール・取っ手と点線の位置 `useGridBoxes`・キーの高さ `usePadHeight`・入力している行を見せる `useRevealRow`）。`PartsTable` から外に出し、`AdjustTable` でも使う。選んでいる範囲はアプリで1つの表だけ（`exclusive.ts` の `claimOpen('cellRange')`。ほかの表が選んだら範囲を外し、入力を終える）。取っ手と点線は `components/GridOverlay.tsx`
- `components/AdjustTable.tsx`：部材の表の下の調整寸法の表（`PartsTable` の中に置き、`picking`（「＝」の入力中に押した行を式に入れる）と `refIds`（色の枠）を受け取る）。保存データは `useJobStore` から直接。入力は確定したときに `setAdjustCell`。表を変える操作は `adjustTableOutcome` → `adjustChangeUsages` → 確認の文（`ui/adjustTable.ts` の `adjustConfirmText`）があれば確かめてから dispatch
- `ui/adjustTable.ts`：行の数（初め5行・「＋ 5行足す」はアプリを開いている間だけ）・「次へ」の行き先・行の呼び方・確認の文
- `FormulaKeys`：キーの上の調整寸法のボタンと「＋ 追加」の欄をなくした。`numeric`（数字だけのキー。`decimal` なら小数点も）で枚数・調整寸法の寸法のキーにする
- なくしたもの：`AdjustPanel`・`AdjustList`・`settings.ts` の `ADJUST_PRESETS`・`groupUsages`
- 部材の表の初めの行は5行（`TABLE_MIN_ROWS`）

## 13. 第2.0版の変更（仕様書 24章）

### 13.1 並べ替えと行の移動（U-25。`src/engine/order.ts`）

- `sortParts(parts, dims, key, order)`：`key` は `'name' | 'W' | 'H' | 'qty'`、`order` は `'asc'`（小さい順・名前はあいうえお順）／`'desc'`（大きい順・名前は逆の順）。W・H は `dims`（`computeDimensions` の結果）の仕上がり寸法、名前は `Intl.Collator('ja')`（`localeCompare('ja')` と同じ）。空・エラー（式が空、その軸にエラー、名前が空、枚数が空）は向きによらず一番下。値が同じなら今の並び（安定）
- `moveParts(parts, from, count, to)`：続いた行を、元の並びの `to` 行目の上（`to` が部材の数なら一番下）へ動かす。動かす行の中・すぐ上・すぐ下なら変わらない。`movedTop(length, from, count, to)` は動かしたあとの一番上の行。`sameOrder(a, b)` は同じ並びか
- store：`jobs.ts` の `sortJobParts`・`moveJobParts`（並びが変わらなければ同じ仕事を返す＝updatedAt を付けない）。reducer に `{ type: 'sortParts', key, order }`（W・H は `usableAdjusts(data.adjusts)` で計算）と `{ type: 'moveParts', from, count, to }`
- 画面：`PartsTable` の見出しは `HeadButton`（`useLongPress`。押すと列全体、長押しで並べ替えのシート）。番号を引く指の動きは `useGrid` の `moveRowsFrom`・`onMoveRows`（選んでいる行全体の番号だけ。その番号は CSS で `touch-action: none`）。動かす先の線は `GridOverlay` の `moveLine`。左上の丸い取っ手が番号に重なる所は、番号として扱う

## 14. 第2.1版の変更（仕様書 25章）

### 14.1 部材の調整の型・読み込み・調整の式（E-18。spec 25.1・25.2）

```ts
// types.ts
export interface Part {
  id: string
  name: string
  expr: Record<Axis, string>    // 仕上がり寸法の入力（数値または式）
  adjust: Record<Axis, string>  // 調整の式（第2.1版）。仕上がりに足し引きする値。空の文字は「調整なし（0）」
  quantity: number | null
  rotatable: boolean
  finishedDone: boolean
}
```

- フィールド名は **`adjust`**（W・H それぞれの文字）。式で `part.expr.W`（仕上がり）と `part.adjust.W`（調整）を並べて読めるように。アプリ全体の調整寸法の一覧 `AppData.adjusts`（`AdjustRow[]`）とは別物
- **読み込み**（`shape.ts`）：`isPart` は `adjust`（`{ W: string, H: string }`）を要る。第2.0版までの部材（`adjust` が無い）は `readJob` で `{ W: '', H: '' }` を足してから確かめる（保存データ `parseAppData`・共有とバックアップのファイル `readTransferFile` の両方が `readJob`／`readJobs` を通る）。`adjust` があって形が違う部材は読めない（仕事ごと読めない＝今までと同じ考え方）
- `store/jobs.ts` の `newPart` は調整を空で作る。表の空の行に貼って作る部材（`clipboard/cells.ts`）も空
- **調整の式**（`formula/adjustExpr.ts`）：
  - `parseAdjustExpr(expr, adjusts?)` → `ParseResult`（空・空白だけは 0）。`evaluateAdjustExpr(expr, adjusts)` → `EvalResult`（足し引きする値。`adjusts` は `usableAdjusts(data.adjusts)`）。`isBlankAdjustExpr(expr)`
  - 中では `parse(expr, adjusts, { kind: 'adjust' })`（`formula/parse.ts` に `ParseOptions`・`FormulaKind` を足した）。`kind: 'adjust'` の違い：先頭の「+」を読む（足す）／部材の寸法はエラー `REF_IN_ADJUST_MESSAGE`「調整には部材の寸法は使えません」（kind は `syntax`。位置 start・end つき）／終わりが記号のときの案内は「後ろに数値か調整寸法を入れてください」
  - 先頭の「−」は今の式と同じく符号（`−{n:メラミン}×2` ＝ −2）。全角の記号・× ÷ − は今の式と同じく読む。「＝」は付けない形だが、付いていれば今の式と同じく読み飛ばす
  - 一覧に無い id（削除した調整寸法・書きかけの行）は `unknownAdjust`「削除した調整寸法を使っています」。「−」だけ・「＋」だけ・終わりが記号は `incomplete`（入れている途中）

### 14.2 寸法の計算に調整後を足す・見本（E-19。spec 25.1・25.2・25.4・25.5）

```ts
// types.ts
export type DimensionField = 'finished' | 'adjust'   // エラーの欄：［仕上がり］の式か、［調整］の調整の式か
export interface DimensionError { partId; axis; field: DimensionField; kind; message; refs?; incomplete?; from? }
export interface PartDimensions {
  partId; name; quantity
  finished: Record<Axis, number> | null        // 仕上がり（式の計算結果）
  adjusted: Record<Axis, number> | null        // 調整後（仕上がり ＋ 調整）。第2.1版
  cut: Record<Axis, number> | null             // 木取り（調整後 ＋ 切り代）。第2.1版から調整後に足す
  finishedByAxis: Partial<Record<Axis, number>>
  adjustByAxis: Partial<Record<Axis, number>>   // 調整の値（足し引きする値。空は 0）。調整の式が計算できた軸だけ
  adjustedByAxis: Partial<Record<Axis, number>> // 調整後。仕上がりと調整の両方が計算でき、0 より大きい軸だけ
  cutByAxis: Partial<Record<Axis, number>>
  errors: DimensionError[]                      // 仕上がりの欄と調整の欄のエラー（軸ごとに 仕上がり → 調整 の順）
}
```

- `computeDimensions(job, adjusts)`：仕上がり → 調整後（`evaluateAdjustExpr(part.adjust[axis], adjusts)` を足す）→ 木取り（＋ `settings.allowance`）
  - 式の参照（`天板.W`）は今までどおり仕上がり寸法（`resolve.ts` は変えていない）。調整のエラーはほかの部材に伝わらない
  - 調整の欄のエラー（`field: 'adjust'`）：調整の式が読めない（syntax。「−」だけなら incomplete）・部材の寸法を使っている（syntax「調整には部材の寸法は使えません」）・削除した調整寸法（unknownAdjust）・0 で割る（divideByZero）・調整後が 0 以下（nonPositive「調整後の寸法が 0 以下になります（−5）」。小数第1位に丸めて比べる）
  - 仕上がりがエラーの軸は、調整後・木取りを出さない。このとき調整の欄のエラーは **足さない**（調整の式そのものがおかしいときだけ足す）。画面の［調整］のタブは、その軸のエラー（仕上がりのものも）を出せばよい
  - 仕上がりの欄のエラーは `field: 'finished'`（`resolve.ts` のエラー・参照先から伝わったエラーも）
- **画面の出し分け**：［仕上がり］のタブは `field === 'finished'` のエラーだけ、［調整］［木取り］のタブはその軸のエラー全部。`ui/partCells.ts` の `dimCell` は［仕上がり］のタブのとき `field === 'finished'` だけを見るように直した（最小限の直し。調整のエラーで［仕上がり］の欄が赤くならないように）
- 木取りの計算（`packing/`）・お知らせ（`hints/saving.ts`）・比べ（`packing/sizes.ts`）・固定した1枚の drift（`progress/frozen.ts`）は `cut`／`cutByAxis` を使っているので、そのまま調整後の木取り寸法についてくる（テストで確かめた）。並べ替え（`order.ts`）は今までどおり `finishedByAxis`（仕上がり）で比べる
- テストの見本 `fixtures/shelf.ts` の `shelfJob()`：棚板 W を仕上がり `天板.W - 20`・調整 `-{n:adjust-melamine}` にした（仕上がり 380・調整後 379・木取り 389）。第2.0版までの形（仕上がりの式にメラミン1）は `legacyShelfJob()`（古いデータの読み込み・置き換えのテスト用）
- 見本（`store/sample.ts` の `sampleJob`）：棚板 W は仕上がり `天板.W - 20`・調整 `-{n:メラミン1 の id}`（25.4）。4×8 2枚・57.2% は今と同じ

### 14.3 仕上がりの式から調整寸法をなくす（E-20。spec 25.4・25.9）

- **仕上がりの式では調整寸法を使えない**：`parse(expr, adjusts, { kind: 'finished' })` は調整寸法 `{n:id}` をエラー `ADJUST_IN_FINISHED_MESSAGE`「仕上がりの式では調整寸法は使えません」（kind は `syntax`、位置つき、`incomplete` なし）にする。`dimensions/resolve.ts` は仕上がりの式をこの種類で読む（`computeDimensions`・`partsReferencing` が通る）。削除した調整寸法の id も同じエラー（今までの `unknownAdjust` は、仕上がりの欄では出なくなった。調整の欄では今までどおり `unknownAdjust`）
  - 記号が抜けている式（`全体.W {n:id}`）は、今までどおり「「全体.W」と「メラミン1」の間に…」の文（調整寸法を値として読む前に記号の抜けで止まるため）
  - `parse` の初めの値（`kind` を省いたとき）は `any`（今までどおり両方使える）。`evaluateExpr`・`isIncompleteFormula` は `any` のまま
- **数字に置き換える**（`src/engine/migrate/finishedAdjusts.ts`）
  - `inlineAdjustsInExpr(expr, adjusts)`：式の `{n:id}`（全角も）を寸法の数字（`exactText`。丸めない）に置き換える。一覧に無い id（削除した調整寸法・書きかけの行）はそのまま。前後に数字・文字がくっついていれば空白をはさむ（`{n:x}5` → `1 5`。エラーの式を別の数にしない）
  - `inlineJobAdjusts(job, adjusts)`：部材の仕上がりの式（`Part.expr`）だけ。調整の欄（`Part.adjust`）は置き換えない
  - `inlineCellClipAdjusts(clip, adjusts)`：保存してあるコピーしたセル（名前には `{ }` を使えず、枚数は数字だけなので、`{n:id}` があるのは W・H のセルだけ）
  - `inlineAppDataAdjusts(data)`：全部の仕事とコピーしたセルを、`usableAdjusts(data.adjusts)` で置き換える
  - どれも、置き換えるものが無ければ同じオブジェクトを返す
- **使う所**
  - 保存データ：`store/storage.ts` の `parseAppData` の最後（アプリを開いたとき）
  - 取り込み：`transfer/importFile.ts` の `importTransfer` で、ファイルの仕事を **ファイルの `adjusts` の寸法** で置き換えてから id をつけ替える（送った人の寸法のまま。受け取る人の一覧の寸法ではない）

### 14.4 共有・バックアップ・調整寸法を使っている所（E-21。spec 25.3・25.5・25.9・21.3）

- **「使っている」は調整の欄で数える**（`formula/usages.ts`）：`partsUsingAdjust(s)`・`adjustUsages`・`adjustUsagesOf` は `Part.adjust` の W・H だけを見る（`AdjustUsage.axes` は調整の欄の軸）。仕上がりの式に残っている `{n:id}`（削除した調整寸法など。エラーの式）は数えない。`adjustIdsInPart(part)`（調整の欄の id。W → H・重なりなし）を足した。`adjusts.ts` の `adjustChangeUsages`（21.3 の「◯件の仕事で使っています」）は `adjustUsagesOf` を使うので、そのまま調整の欄で数える
- **共有**（`share.ts` の `jobFile`）：部材の調整も入れる（`adjust` は写し）。入れる調整寸法は **その仕事の調整の欄で使っているもの** だけ（アプリの一覧の並び。削除した・書きかけは入らない）
- **バックアップ**（`backup.ts`）：形は変えない。仕事（調整も）と、調整寸法の一覧は今どおり **ぜんぶ**（式で使える行。仕様書 25.9）
- **取り込み**（`importFile.ts` の `importTransfer`）
  1. 仕上がりの式をファイルの寸法で数字に置き換える（14.3）
  2. 一覧に足す調整寸法：共有は **置き換えたあとの仕事の調整の欄で使っているもの** だけ（第2.0版のファイルの、仕上がりで使っていた調整寸法は数字になったので足さない）（暫定）、バックアップはファイルの一覧ぜんぶ
  3. `rekeyJob` で、仕上がりの式と調整の欄の両方の `{n:id}` をつけ替える（ファイルに無い id はそのまま）
- 調整の無い古いファイルは `readJob` で調整なしとして読む（14.1）。ファイルの版（`TRANSFER_VERSION`）は 1 のまま（仕様書 25.9。前の版のアプリで読むと、調整なしとして読まれる）

### 14.5 部材の行の操作・仕事のコピーで調整がついていく（E-22。spec 25.2・25.5・25.9）

- `store/jobs.ts`
  - `copyJob`：調整もコピーする（写し）
  - `insertPart`：渡した部材の調整を写して入れる（`newPart` は調整なし）
  - `updatePart(job, partId, patch: PartPatch)`：`PartPatch` は `expr`・`adjust` を **片方の軸だけ** 渡せる形（`Partial<Record<Axis, string>>`）。渡さない軸はそのまま。今までの `{ expr: { W, H } }` もそのまま使える
  - `setPartAdjust(job, partId, axis, text)`：調整を1つの軸に入れる。同じ値なら同じ仕事（updatedAt を付けない）。読めない式でも入れる（計算のエラーとして出す。仕上がりと同じ）
- `clipboard/copy.ts` の `duplicatePart`：調整も写す
- 部材ごと動かす・消す操作（`order.ts` の `sortParts`・`moveParts`、`clipboard/cells.ts` の `deleteRows`・`clearCells`・`pasteCells`・`fillCells`、`removePart`）は部材のオブジェクトごと扱うので、調整はその部材についていく（削除では消える）。［仕上がり］の貼り付け・オートフィル・切り取りは仕上がりの欄（名前・W・H・枚数）だけを変え、調整は変えない。表の下に足す部材の調整は空
- ［仕上がり］で名前・W・H・枚数をぜんぶ空にした行は、調整が入っていても外す（`parts.ts` の `isBlankPart` は調整を見ない。仕様書 25.9）
- **store**（`reducer.ts`）：`{ type: 'setPartAdjust', partId, axis, text }`（`jobId` を省くと開いている仕事）。`updatePart` の `patch` も `PartPatch`（調整を渡せる）

### 14.6 ［調整］の欄のセル操作（E-23。spec 25.2・25.9。`src/engine/clipboard/partAdjustCells.ts`）

```ts
// types.ts
export interface CellClip { rows; cols; cells: string[][]; cut?: CellCut; source?: 'adjust' }
// source：どのタブの欄から写したか。'adjust'＝［調整］（W・H は調整の式）。無ければ［仕上がり］（第2.0版までの保存データも無い）
```

- コピーしたセルは今までどおり `AppData.cellClip` の1つだけ（［仕上がり］と［調整］で同じクリップを使い、`source` で見分ける）。［仕上がり］と［調整］をまたいだ貼り付けは断る：
  - ［調整］のものを［仕上がり］に：`pasteCells` が `{ ok: false, message: ADJUST_CLIP_TO_FINISHED_MESSAGE }`「［調整］でコピーしたものは［仕上がり］には貼れません」
  - ［仕上がり］のものを［調整］に：`pastePartAdjustCells` が `FINISHED_CLIP_TO_ADJUST_MESSAGE`「［仕上がり］でコピーしたものは［調整］には貼れません」
  - オートフィルはクリップを使わないので、どちらの表もそのタブの中だけ
- **保存データ**：`shape.ts` の `isCellClip` は `source` が無いか `'adjust'` だけを通す（ほかの値なら読めない＝`readCellClip` は null）。`inlineAppDataAdjusts`（14.3）は `source: 'adjust'` のクリップを置き換えない

| 関数 | 内容 |
|---|---|
| `partAdjustCellText(job, pos)` | W・H は調整の式、名前・枚数は `cellText` と同じ。空の行は '' |
| `copyPartAdjustCells(job, sel)`・`cutPartAdjustCells(job, sel)` | `CopyCellsResult`（`clip.source = 'adjust'`。切り取りは `clip.cut = { jobId, range }`）。名前・枚数のセルも選んでコピーできる |
| `pastePartAdjustCells(job, clip, sel)` | `{ ok: true, job, pasted, skipped: [], renamed: [], cutClear }`／`{ ok: false, message }`。W・H の調整だけ書く。名前・枚数に当たる所・部材の無い行（空の行）は貼らず数えない（部材も作らない）。1つのセルは選んだセル全部へ、範囲は左上から同じ形 |
| `clearPartAdjustCutSource(job, clip, cells)` | 切り取りをほかの仕事に貼ったあと、元の仕事の W・H を空にする（書き換えたセルは空にしない） |
| `fillPartAdjustCells(job, from, to)` | オートフィル（`fillCells` と同じくり返し）。W・H だけ。部材のある行まで |
| `clearPartAdjustCells(job, sel)` | W・H の調整を空にする。名前・枚数・仕上がりは変えず、部材も消さない。変わらなければ同じ仕事 |

- 切り取り：元の W・H だけを空にする（名前・枚数は消さない）。貼る先と重なるセル・切り取ったあとに書き換えたセルは空にしない。同じ仕事なら返す job の中で、違う仕事なら `cutClear` で
- `cells.ts` に `selectionCells(sel)`（選んだセルをそろえた配列。四角なら `rangeCells` と同じ）を外に出した
- **store**（`reducer.ts`）。どれも `SelectionArg`（`cells` か `range`）、`jobId` を省くと開いている仕事
  - `{ type: 'copyPartAdjustCells' }`・`{ type: 'cutPartAdjustCells' }`：`cellClip` を置き換える（仕事は変えない）
  - `{ type: 'pastePartAdjustCells' }`：結果の `paste: { pasted, skipped: [], renamed: [] }`。切り取りなら元を空にし（ほかの仕事でも。updatedAt を付ける）、1つでも貼れたら `cellClip` から `cut` を外す。コピーが無ければ「コピーしたセルがありません」
  - `{ type: 'fillPartAdjustCells', from, to }`：結果の `paste`
  - `{ type: 'clearPartAdjustCells' }`：変わらなければ updatedAt を付けない

### 14.7 タブを3つに・［調整］の表（U-26。spec 25.1・25.2・25.3・25.5・25.6）

- `ui/partsTab.ts`：`PartsTab = 'finished' | 'adjust' | 'cut'`。並びは ［仕上がり］［調整］［木取り］。覚えるキーは今までどおり `kidori-lite.ui` の `partsTab`（第2.0版の 'finished'・'cut' はそのまま読める）
- `ui/partsTable.ts` の `adjustDimCell(part, dims, axis, adjusts)`：［調整］の W・H の欄。`empty`（仕上がりも調整も空）／`finished`（調整が空。仕上がり寸法を薄く）／`adjusted`（`label` は `formulaText` の書き方「−メラミン1 × 2」・`value` は `adjustedByAxis`）／`error`（その軸のエラー全部。仕上がりのものも）。読み上げの文は `adjustCellLabel`
- `components/PartAdjustTable.tsx`：［調整］の表（U-26 では見るだけ。U-28 で入力できるようにする）。部材のある行だけ。W・H の欄は375px に収めるため2段（上に調整の値を小さく緑、下に調整後の寸法）（暫定）
- `screens/PartsScreen.tsx`：3つのタブ。タブの色は 仕上がり＝青（`fin`）・調整＝緑（`adjust`。調整寸法の色 `--ok`）・木取り＝橙（`cut`）。調整寸法の表（`AdjustTable`）は［調整］の表の下に移した（`PartsTable` の中から外した。［仕上がり］の入力中に調整寸法の行を押して `{n:id}` が入ることは無くなった）
- 見出しは「W」「H」の1段（`PartsTable` の `AXIS_SIDE` と `.pt-h2` をなくした。並べ替えのシートの題も「W で並べ替え」）。［木取り］のタブの ⓘ と題は「調整後 ＋ 切り代」

### 14.8 「＝」なしで式を打つ（U-27。spec 25.7）

- `ui/formulaEdit.ts` の **`canInsertRef(text, cursor)`**：入力中にほかのセルを押したとき寸法を入れるか。欄が空（空白だけ）か、カーソルのすぐ前の単位が記号（`op`。先頭の符号の「−」も）か「(」なら true。数字・寸法・「)」の後ろ、カーソルが先頭で後ろに何かあるときは false（暫定）。先頭の「＝」（古い式）は外した形で見る。`opensAsFormula` はなくした
- `FormulaKeys`：「＝」のキー（`eq`）と `equals`・`onEquals` をなくした。一番上の段は ＋ − × ÷ の4つ（キーの並びを 20 等分にし、ふつうのキーは 4、一番上の段は 5、「0」は 8 ずつ）。`FormulaView` の `equals` もなくした
- `PartsTable`：「＝」の状態（`equals`）をなくした。W・H の入力中に押したセルが **部材のある行の W・H で、`canInsertRef` が true** なら寸法を入れる（名前の無い部材は入れずに知らせ、入力は続ける）。それ以外（数字の後・名前・枚数・部材の無い空の行）は入力を終えて押したセルを選ぶ。同じ部材のもう一方の軸（天板.W の入力中に天板.H）も入れる（今までどおり。暫定）。長押しのメニューは、寸法が入るときだけ出さない（`formulaPicking`）
- 古い「＝」付きの式：開くときは「＝」を外した形で編集し、入れ直すと「＝」の無い形で保存する（入れ直さなければそのまま。engine は今までどおり読む）

### 14.9 ［調整］のタブの入力と操作（U-28。spec 25.2・25.3・25.7・25.9）

- `components/PartAdjustTable.tsx`：［調整］の表を入力できる表にした（`useGrid`・`GridOverlay`・`CellMenu` を使う）。行は部材の数だけ（`rowCount = parts.length`）。入力している欄は `{ partId, axis }`（W・H だけ）。名前・枚数のセルは選べる（コピーもできる）が、もう一度押しても入力しない
  - キーを押すたびに `setPartAdjust` で保存（読めない式も入れ、計算のエラーとして出す）。入力中のセルは、打っている途中のエラー（`errorsWhileEditing` で出さないもの）だけなら赤くせず調整の値だけ出す
  - 入力中に表のほかのセル（ほかの部材の W・H も）を押したら、入れずに入力を終えてそのセルを選ぶ。番号・見出しは行全体・列全体（`rowRange`・`columnRange`）。見出しの長押しの並べ替え・番号を引いての移動は無い
  - 「次へ」は `ui/partsTable.ts` の `nextAdjustTabCell`：W → H → 次の部材の W。最後の部材の H の次は入力を終える（暫定）
  - オートフィルは `fillPartAdjustCells`、長押しのメニューは `CellMenu` の `adjust`（切り取り・コピー・貼り付け・クリアだけ。`copyPartAdjustCells` など）。入力中は長押しのメニューを出さない
  - 切り取った元の点線は、`clip.source` が `'adjust'` のときだけ［調整］の表に出す（`PartsTable` は `'adjust'` でないときだけ）
- 調整寸法の表（`AdjustTable`）は `PartAdjustTable` の下に置く（`PartsScreen` からは `PartAdjustTable` だけ）。`picking: ((row) => boolean) | null` は、入力中で `canInsertRef`（14.8）が true の間だけ渡す。押した行が式で使える行なら `{n:id}` を入れて true、書きかけの行は「名前と寸法をそろえると使えます」と出して true。false・空の行・番号・見出しは、調整寸法の表がふつうにそのセルを選び（`claimOpen('cellRange')` で［調整］の表の範囲が外れ）、入力が終わる
- 寸法を変える・消すときの確認（21.3）は今の `AdjustTable` のまま（`adjustChangeUsages` が調整の欄で数える。14.4）
- `CellMenu`：貼れなかったとき（［仕上がり］と［調整］をまたいだ など）もメニューを閉じて理由を出す（［仕上がり］も同じ。暫定）

### 14.10 タブのすぐ下の式の欄（U-29。spec 25.8）

- `screens/PartsScreen.tsx`：タブと式の欄の置き場所（`.fx-slot`）を `.parts-sticky`（`position: sticky`。`top` は上の仕事の名前の帯 `.topbar` の高さを測った値）に入れて画面の上に止める。表は選んでいるセルの中身をこの置き場所へ `createPortal` で出す（置き場所の要素は state で持ち、各表に `barSlot` で渡す）。置き場所が空のときは CSS（`:empty::before`）で同じ高さの点線の空の欄を出す（表の位置がずれない）
- `components/FormulaBar.tsx`：式の欄。中身は `ui/fxBar.ts` の `BarContent`（`expr`＝式を `FormulaView` の塊つきで、`text`＝枚数・調整寸法の寸法）。選んでいるだけのときは押すと `onPress`（入力を始める）、入力中はカーソル（式を押すとその位置。`caretFromTap`）と右の「✓」（`onDone`）、`onPress` が無ければ見るだけ。エラーの理由は欄のすぐ下に重ねて出す（`.fx-err`。表を押し下げない）。計算した寸法は欄に出さない（セルに出ている）
- `ui/fxBar.ts`（テストつき）：`barField(range)`（範囲の左上が W・H・枚数ならその列）、`partBar(parts, range, tab)`（［仕上がり］［木取り］は仕上がりの式（「＝」は外す）、［調整］は調整の式、枚数は枚数。部材の無い空の行は空の中身）、`adjustRowBar(rows, range)`（調整寸法の表の寸法のセル）、`barErrors(errors, axis, tab, editing)`（［仕上がり］は仕上がりの欄のエラーだけ、ほかはその軸全部。入力中は `errorsWhileEditing`）
- 各表：`PartsTable`・`PartAdjustTable`・`AdjustTable` は、キーの上の行（`ExprKeys`・`QtyKeys` の `.pt-show`）をなくし、キーだけを画面の下に出す。入力中は欄も「中」とみなす（`useOutsideEnd` の inside に `barSlot`）。`CutTable` は W・H・枚数のセルを押すと選んだ印（`.picked`）を付け、欄に見るだけで出す（もう一度押すか外を押すと外す）。［調整］の枚数のセルは見るだけ（欄を押しても入力しない）
- `useGrid.ts` の `stickyBottom()`：画面の上に止めてあるもの（`.topbar`・`.parts-sticky`）の下の端。入力している行を見せるスクロール（`useRevealRow`）と、取っ手を引いたときの端のスクロール（`edgeDelta`）がこの下を上の端とみなす
- コピー中の表示：`cellSelect.ts` の `clipText(clip, adjusts?)` は、adjusts を渡すと1つのセルの中身を `formulaText`（× ÷ −・メラミン1）で出す（部材の表・［調整］の表・長押しのメニュー）

## 15. 第2.2版の変更（仕様書 26章）

作業は `docs/tasks.md` の E-24〜E-28・U-30〜U-36。計算・保存の側（E-24〜E-28）は 15.1〜15.5 に実装に合わせて書いた（2026-11-13 engine-dev）。画面（U-30〜U-36）は 15.6〜15.12（2026-11-13 ui-dev）。

- **厚み**（E-24・E-25・E-26）：`Part.thickness`（数か空）。部材の寸法の `Axis`（W・H。板に置く2つ）は変えず、式の参照の軸だけ W・H・T（`RefAxis`）。`.T` は参照先の部材の厚みの数字で、計算順・循環の辿り（`resolve.ts` の `deps`）には入らない。木取りの並べ方（`packing/`）は厚みを見ない（11章のまま）
- **表の列**（E-26）：`CELL_COLS` は 名前・厚み・W・H・枚数（`left` 0〜4）。［仕上がり］［調整］［木取り］の3つの表が同じ列。［調整］では厚みも見るだけ
- **名前の重なり**（E-27）：貼り付け・オートフィルでは同じ名前を許す（18.3 の番号を振る処理をなくした）。打って入れるとき（`validatePartName`）は今どおり断る。同じ名前の部材を参照している式はエラー（`ambiguousRef`）
- **色とメモ**（E-28）：`Part` に 行の色（`rowColor`）・列ごとのセルの色（`cellColors`）・メモ（`memo`）。部材のオブジェクトごと動く操作（並べ替え・移動・複製・仕事のコピー・ファイル）はそのままついていく。行をまるごと切り取って同じ仕事に貼ったときは、第2.1版の調整と同じ所（`cells.ts` の `RowMove`。前の `AdjustMove`）で動かす
- **前の版のデータ**：厚み・色・メモの無い部材は `shape.ts` の `readJob` で「なし」を足してから読む（第2.1版の `adjust` と同じやり方）。ファイルの版（`TRANSFER_VERSION`）は 1 のまま（26.7）

### 15.1 部材の厚みの型・読み込み・行の操作（E-24。spec 26.1・26.7）

```ts
// types.ts
export interface Part {
  id; name; expr; adjust
  thickness: number | null   // 厚み（第2.2版）。0 より大きい数（小数可）か空（null）。木取りの並べ方には使わない
  quantity; rotatable; finishedDone
}
```

- フィールド名は **`thickness`**（数で持つ。式は入れられない。26.8）。部材の寸法の `Axis`（W・H）は変えていない
- **読み込み**（`shape.ts`）：`isThickness(v)`（null か 0 より大きい有限の数）を足し、`isPart` は `thickness` を要る。`readJob` は前の版の部材（`adjust`・`thickness` の無いもの）に「なし」（調整 W・H とも空・厚み null）を足してから確かめる（`withPartDefaults`）。厚みが 0 以下・数でない部材は読めない（仕事ごと読めない＝今までと同じ考え方）。保存データ（`parseAppData`）・送るファイル・バックアップ（`readTransferFile`）は全部 `readJob` を通る
- `store/jobs.ts`：`newPart` は厚み null。`copyJob` は厚みを写す。`insertPart`・`addPart`・`updatePart` は `validatePartFields` で厚みを確かめ、0 以下・数でないものは `THICKNESS_MESSAGE`「厚みは 0 より大きい数を入れてください」で断る。`PartPatch` はそのまま（`thickness` を渡せる。渡さなければそのまま）
- `clipboard/copy.ts` の `duplicatePart`：厚みも写す。`clipboard/cells.ts` の表の下に足す部材は厚み null
- `parts.ts` の `isBlankPart`：名前・厚み・W・H・枚数がぜんぶ空のときだけ空（厚みだけの行は残す。26.8）。引数の型に `thickness` が増えた
- `order.ts`：`SortKey` は `'name' | 'T' | 'W' | 'H' | 'qty'`（`T` が厚み）。厚みは `part.thickness` で比べ、空は一番下・同じ値は今の並び（24.1 と同じ）
- 送るファイル（`share.ts` の `jobFile`）・バックアップ・取り込み（`rekeyJob`）は部材をまるごと写すので、厚みはそのまま入る（テストで確かめた）。`TRANSFER_VERSION` は 1 のまま
- store（`reducer.ts`）：action は変えていない。`{ type: 'updatePart', patch: { thickness } }` で厚みを入れる・空にする（null）。`{ type: 'sortParts', key: 'T', order }` で厚みの順
- テスト用：`fixtures/legacy.ts` の `toV21(value)`（JSON で写し、部材から第2.2版の欄を消す。前の版のデータの読み込みのテストに使う）

### 15.2 式で厚みを使う `天板.T`（E-25。spec 26.1）

```ts
// types.ts
export type RefAxis = Axis | 'T'                 // 式の参照の軸。T は厚み（部材の寸法の Axis とは分ける）
export const REF_AXES: readonly RefAxis[] = ['W', 'H', 'T']
export type DimensionErrorKind = … | 'noThickness' // 厚みが空の部材の 部材名.T を使っている
```

- **字句**（`formula/tokenize.ts`）：`parseRefText` は `部材名.T`（全角の `Ｔ` も。小文字の `t` はエラー）を読み、`{ part, axis: RefAxis }` を返す。`Token` の `ref` の軸も `RefAxis`。`天板.D` などの文は「「天板.D」は使えません（寸法は W・H・T（厚み）だけです。「部材名.W」「部材名.H」「部材名.T」で書いてください）」
- `formula/parse.ts`（`Expr` の `ref`）・`evaluate.ts`（`Ref`・`RefLookup`）の軸も `RefAxis`。`units.ts`・`display.ts`・`rename.ts` は `parseRefText` を使うので、`天板.T` は部材の参照の単位（`partRef`）・表示は「全体.H − 天板.T × 2」・名前を変えると `甲板.T` に書き換わる（そのまま）
- ［調整］の式（`kind: 'adjust'`）の `天板.T` は今までどおり「調整には部材の寸法は使えません」
- **依存関係**（`dimensions/resolve.ts`）：`DimNode` に `thicknessDeps: string[]`（厚みを参照している部材の id）を足した。`.T` は `deps`（計算順・循環の辿り）に入れない。参照先が無ければ今までどおり `unknownRef`「「天板」という部材はありません」、厚みが空なら `noThickness`（`noThicknessMessage(name)`「天板 の厚みが入っていません」。`refs` に部材名。field は finished）。自分の厚みを使う式（`A.H = A.T × 2`）は循環ではない
- **計算**（`dimensions/index.ts` の `computeDimensions`）：`.T` の値は参照先の部材の `thickness`（数字）。厚みは天板の W・H のエラーと関係なく使える。エラーは今までどおり、参照している寸法に `from` 付きで伝わる。厚みは木取り寸法・板の並べ方に足さない
- **使っている所**（`partsReferencing`）：`deps` か `thicknessDeps` にその部材があれば「使っている」（軸は使っている側の式の W・H）。部材の削除の確認（`ui/partsTable.ts` の `referencingOthers`）はそのまま使える
- テストの見本：`fixtures/shelf.ts` の `thickShelfJob()`（`shelfJob` に天板の厚み 18・側板の H ＝ `全体.H - 天板.T × 2`。側板の仕上がり H 1764・木取り 1774）。`shelfJob()` は変えていない

### 15.3 部材の表の列に厚みを足す（E-26。spec 26.1・26.3・26.8）

```ts
// types.ts
export type CellCol = 'name' | 'T' | 'W' | 'H' | 'qty'     // T は厚み
export const CELL_COLS: readonly CellCol[] = ['name', 'T', 'W', 'H', 'qty']   // left 0＝名前・1＝厚み・2＝W・3＝H・4＝枚数
export const CELL_COLS_KEY = CELL_COLS.join(',')           // 'name,T,W,H,qty'（列の並びの印）
export interface CellClip { rows; cols; cells; cut?; source?; columns?: string }   // columns：列の並びの印
```

- 3つの表（［仕上がり］［調整］［木取り］）は同じ列。行全体（`rowRange`）は 5 列、範囲（`isCellRange`）は left + cols ≦ 5
- **セル操作**（`clipboard/cells.ts`）
  - `cellText`：厚みは数字の文字（`String(thickness)`。空は ''）
  - 貼り付け・オートフィル（`applyTargets` の `thicknessOf`）：前後の空白を外し、全角をそろえて `数字` か `数字.数字` で 0 より大きいものだけ貼る（例 18・2.5・１８．５）。空は空（null）にする。それ以外（文字・0・負の数・式・「18mm」・「18.」）は貼らずに `skipped` に `{ reason: 'notThickness', message: NOT_THICKNESS_MESSAGE }`（「厚みには 0 より大きい数だけ貼れます」）
  - クリア・切り取りの元を空にする（`setCellEmpty`）は厚みを null。厚みだけ入った行は外れない（`isBlankPart`。15.1）
  - 行をまるごと（5列）切り取って同じ仕事の左の端から貼ったとき、5つの欄がぜんぶ貼れた行の調整が動く（`AdjustMove` の `srcs` は `CELL_COLS` の数）
- **［調整］のタブ**（`clipboard/partAdjustCells.ts`）：厚みは名前・枚数と同じく見るだけ（`partAdjustCellText` は厚みの数字。コピーはできるが、貼り付け・クリア・オートフィルで変わるのは W・H だけ）
- **コピーしたセルの印**：`copyCells`・`cutCells`・`copyPartAdjustCells`・`cutPartAdjustCells` で作るクリップには `columns: CELL_COLS_KEY` を付ける。`shape.ts` の `isCellClip` は `columns === CELL_COLS_KEY` のものだけを通すので、前の版で保存したクリップ（印なし）は `parseAppData` で捨てる（`cellClip: null`。仕事などほかの中身は読める。26.8）。列の並びがまた変われば印も変わり、古いクリップは捨てられる。貼り付けは印を見ない
- `migrate/finishedAdjusts.ts` の `inlineCellClipAdjusts` は列の位置を見ていないので変えていない
- store（`reducer.ts`）：action は変えていない（`copyCells`・`pasteCells`・`fillCells`・`clearCells` で厚みの列がそのまま使える。テストで確かめた）
- **画面の最小限の直し**（厚みのセルは U-30 で作る）：`ui/cellSelect.ts` の `CELL_COL_LABEL` に `T: '厚み'`。`PartsTable.tsx`：`FIELD_LABEL`・`SORT_KEY` を `Record<CellCol, …>` にして T を足し、`sortChoices` の引数を `CellCol` に、`onPressCell` は厚みの列なら何もしない、見出しは `CELL_COLS.map` で T を出さない（位置 `c` は 0〜4 のまま）、枚数のセルの `data-col` を `colOf('qty')`（4）に。`PartAdjustTable.tsx`：見出しで T を出さない、枚数のセルの位置を `QTY_COL`（4）に。`ui/partsTable.ts` の `TableField`（名前・W・H・枚数）は変えていない

### 15.4 名前はそのまま貼る・同じ名前のエラー（E-27。spec 26.6・26.8）

```ts
// types.ts
export type DimensionErrorKind = … | 'ambiguousRef'   // 同じ名前が2つ以上ある部材を参照（どちらか決まらない）
// parts.ts
export const DUPLICATE_NAME_MESSAGE = '同じ名前があります'
export function duplicateNameCounts(parts): Map<string, number>   // そろえた名前 → 数（2つ以上だけ。空の名前は数えない）
export function duplicateNameIds(parts): Set<string>               // 同じ名前の部材の id
// dimensions/resolve.ts
export function ambiguousRefMessage(name, count): string          // 「棚板 が2つあります」
```

- **貼り付け・オートフィル**（`clipboard/cells.ts` の `applyTargets`）：名前は前後の空白を外して **そのまま** 入れる（18.3 の番号を振る処理 `assignNames`・`numberedName` をなくした）。使えない文字の名前は今までどおり貼らない（`invalidName`）。全角・半角だけ違う名前も書いたまま（`棚板１` は `棚板１`）。結果の `renamed`（`PasteRenamed`）は **いつも空**（画面の知らせの直しは U-33。形だけ残した）。`partAdjustCells.ts` は前から `renamed: []`
- **同じ名前の見つけ方**（`parts.ts`）：`normalizePartName` でそろえて比べる（全角・半角の違いは同じ）。空の名前・空白だけの名前は数えない。画面は `duplicateNameIds(job.parts)` の部材の名前のセルを赤にし、選んだら `DUPLICATE_NAME_MESSAGE` を出す（U-33）
- **式**（`dimensions/resolve.ts`）：同じ名前の部材が2つ以上ある名前を参照している式（`棚板.W`・`棚板.H`・`棚板.T`）は、`ambiguousRef`（「棚板 が2つあります」。3つなら「3つ」。`refs` に名前。field は finished）にし、依存関係（`deps`・`thicknessDeps`）に入れない。今までの「重複していれば先のものを使う」はやめた。エラーの並びは unknownRef → ambiguousRef → noThickness。同じ名前の部材そのものの寸法は計算し、木取りにも入れる。参照している寸法にはエラーが `from` 付きで伝わる
- `partsReferencing`：同じ名前の部材は、どちらも「使われていない」になる（式はどちらも指していないため。片方を消すと、式は残ったほうを指すようになる）
- **名前の変更**（`formula/rename.ts` の `renamePart`）：打って同じ名前にするのは今までどおり断る（`validatePartName`。文は「「棚板」という部材はすでにあります」のまま。26.8）。同じ名前の部材の片方の名前を変えたとき、もう1つ同じ名前が残るなら、ほかの部材の式は書き換えない（式は残った部材を指すようになり、エラーが消える）
- `store/jobs.ts` の `insertPart`・`addPart`・`updatePart`：変えていない（打って同じ名前は断る。同じ名前の部材の名前以外の欄は変えられる。テストで確かめた）。複製（`duplicateName`「棚板のコピー」）・行をまるごと切り取って動かすときも今のまま

### 15.5 色とメモの型・付け方・部材についていく（E-28。spec 26.3・26.7・26.8）

```ts
// types.ts
export type PartColor = 'red' | 'blue' | 'yellow'
export const PART_COLORS: readonly PartColor[] = ['red', 'blue', 'yellow']
export interface Part {
  …
  rowColor: PartColor | null                       // 行の色（null はなし）
  cellColors: Partial<Record<CellCol, PartColor>>  // セルの色（列ごと。無い列は色なし。{} は色なし）
  memo: string                                     // メモ（'' はメモなし。改行可・長さの上限なし）
  …
}
```

- 行の色とセルの色は別々に持つ（番号で「なし」は行の色だけ消す。26.8）
- **付け方**（新しいファイル `src/engine/marks.ts`。テストは `marks.test.ts`）

| 関数 | 内容 |
|---|---|
| `cellColor(part, col)` | そのセルに見せる色：セルの色 → 無ければ行の色 → どちらも無ければ null（26.3「両方あるときはセルの色」） |
| `hasMemo(part)` | メモがあるか（空白・改行だけはメモなし）。名前のセルの右上の三角に使う |
| `setCellColor(job, sel, color)` | 選んだセル（`CellSelection`。範囲でも離れたセルでも）にセルの色。`null` で消す。部材の無い空の行は何もしない（部材を作らない）。変わらなければ同じ仕事 |
| `setRowColor(job, sel, color)` | 選んだセルのある行（部材）に行の色。`null` で行の色だけ消す。空の行は何もしない。変わらなければ同じ仕事 |
| `setPartMemo(job, partId, text)` | `{ ok: true, job }`／`{ ok: false, message: '部材が見つかりません' }`。空白・改行だけは ''（メモを消す）、それ以外は打ったまま。同じなら同じ仕事 |

- **読み込み**（`shape.ts`）：`isPartColor(v)` を足した。`isPart` は `rowColor`（null か色）・`cellColors`（知っている列 → 色）・`memo`（文字）を要る。`readJob` は前の版の部材に「なし」（null・{}・''）を足す。色・メモは飾りなので、**知らない色・知らない列・形の違うものは仕事ごと読めなくせず、その色・メモを外して読む**（あとの版で色が増えたファイルを前の版で読んでも読めるように。暫定）
- **部材についていく**
  - `store/jobs.ts` の `copyJob`（写す。`cellColors` は別のオブジェクト）・`insertPart`（渡した部材のまま。`newPart` は色なし・メモなし）、`clipboard/copy.ts` の `duplicatePart`（写す）、`order.ts` の `sortParts`・`moveParts`、`removePart`・`deleteRows`（部材ごと消える）は部材のオブジェクトごと扱う
  - `clipboard/cells.ts`：行をまるごと（5列）切り取って同じ仕事に貼ったときは、調整・行の色・セルの色・メモ（`RowExtras`）を貼った行へ動かす（`RowMove`。元の行は「なし」にしてから貼った先に入れるので、1行ずらしても入れ違わない。ほかの部材の行に貼れば、その行のものは入れ替わる）。セルのコピー・貼り付け・オートフィル・一部の欄の切り取り・ほかの仕事への貼り付けでは写さない。クリアは中身だけ消し、色・メモは残す。行の欄がぜんぶ空になって部材が外れたときは色・メモも消える。表の下に足す部材は色なし・メモなし
  - 送るファイル（`share.ts` の `jobFile`）・バックアップ・取り込み（`importFile.ts` の `rekeyJob`）にも入る（`cellColors` は写し）
- **store**（`reducer.ts`。どれも `jobId` を省くと開いている仕事。変わらなければ updatedAt を付けない）
  - `{ type: 'setCellColor', color: PartColor | null } & SelectionArg`（`cells` か `range`）
  - `{ type: 'setRowColor', color: PartColor | null } & SelectionArg`
  - `{ type: 'setPartMemo', partId, text }`（無い部材は「部材が見つかりません」）

### 15.6 厚みの列と厚みの入力（U-30。spec 26.1・26.8）

- 3つの表（`PartsTable`・`PartAdjustTable`・`CutTable`）の列は 番号・名前・厚み・W・H・枚数。見出しも `CELL_COLS` のまま全部出す（E-26 の「T を出さない」をやめた）。`useGrid` の `headEls` は5列そろう
- 列の幅（`index.css` の `.pt-row`）：`36px 1.25fr 40px 1fr 1fr 42px`（番号・枚数を少し詰め、厚みは 40px）。［調整］（`.pt.adjtab .pt-row`）は名前を詰めて W・H を広く（`36px 1fr 40px 1.15fr 1.15fr 42px`）、［木取り］（`.pt.cut .pt-row`）は `36px 1.1fr 40px 1fr 1fr 64px`。セルの左右の余白は 5px（前は 6px）。厚みの欄は `.pt-thick`（14px・太字・真ん中）
- `ui/partsTable.ts`：`TableField` は `CellCol`（名前・厚み・W・H・枚数）。`thicknessText(t)`（空は ''）、`thicknessFromText(text)`（空は null、`parseNum` で 0 より大きい数はその数、0・`0.`・数でないものは `THICKNESS_MESSAGE` で断る。打っている途中の `2.` は 2）。テストつき
- `PartsTable` の厚みの入力：1回押して選ぶ・もう一度押して入力。キーは枚数と同じ形の `FormulaKeys`（`numeric` の `decimal: true`）。書きかけの文字（`thickDraft`）を持ち、キーを押すたびに `pressKey`（小数可）→ `thicknessFromText` → 入れられれば `updatePart` の `patch: { thickness }`（空の行なら `addPart` で部材を作る）。入れられない形（0 など）は保存せず、理由を式の欄のすぐ下に出す。その形のまま入力を終えると、保存してある厚みのまま「厚みは 0 より大きい数を入れてください。厚みは元に戻しました」
- 式の欄（`ui/fxBar.ts`）：`barField` は 厚み・W・H・枚数（範囲の左上が厚みなら `'T'`）。`partBar` の厚みはどのタブも厚みの数字（`text`）。［仕上がり］の入力中は書きかけの文字と右に「mm」。［調整］［木取り］の厚みは見るだけ（欄を押しても入力しない）
- 並べ替え：見出しの長押しの「厚み」は 大きい順・小さい順（`sortChoices` の名前以外と同じ。engine の `sortParts` の `T`）
- ［木取り］の表（`CutTable`）：厚みのセルも押すと枠が付き、式の欄に厚みを見るだけで出す

### 15.7 式で厚みを使う・木取りの画面の厚み（U-31。spec 26.1）

- `ui/formulaEdit.ts` の `refPiece(name, col)`：押したセルから式に入れる寸法（W・H・T の列は `天板.W`・`天板.T`、名前・枚数は null）。入れてよいかは今までどおり `canInsertRef`（25.7 と同じ決まり）。`refColorsOf`・`refCellsOf` は `parseRefText` が T を読むので、そのまま `天板.T` も色の枠の部材に数える（テストつき）
- `PartsTable` の `putRef`：W・H の入力中に、ほかの部材（同じ部材も）の厚みのセルを押したら `天板.T` を入れる。厚みのセルにも `refFrame`（色の点線の枠）。式の欄（`FormulaView`）では部材の寸法の塊として色つきで出る
- 木取りの画面（`KidoriScreen`）：`ui/kidoriView.ts` の `thicknessTag(t)`（「t18」。空は ''）・`withThickness(name, t)`（「天板 t18」）。配置図（`SheetDiagram`）の部材名は `labelOf` に厚みを足し、切り出しチェック（`SheetChecklist`）は `tagOf` で名前の横に出す。厚みは `partId` から今の部材を引く（固定した1枚も今の厚み。部材が無くなっていれば出さない）。「部材ごとの進み具合」には出さない（26.1 は配置図・切り出しチェックだけ）

### 15.8 「次へ」の進み方・名前を打つときのスクロール（U-32。spec 26.2・26.4）

- `ui/partsTable.ts` の `nextCell`：名前 → 次の行の名前、厚み → 次の行の厚み、W → H → 枚数 → 次の行の W（次の行は `inputRow(row + 1, partCount)`。最後の部材の次は空の行、空の行のままなら同じ空の行）。［調整］の `nextAdjustTabCell` は変えていない
- `PartsTable` の名前の欄の改行（`onNameKey`）：名前を確定してから `startInput(nextCell(...))`。次の行の名前の欄を描いて、押した操作の中で注目を移す（スマホのキーボードは出したまま。前の欄の `blur` はしない）
- スクロール（`ui/scroll.ts`。テストつき）：`visibleRange(view, stickyBottom, padTop)`（見えている範囲：上は止めたタブ・式の欄の下と visualViewport の上の下のほう、下は visualViewport の下とアプリのキーの上の上のほう）、`revealDelta(rect, band, margin)`（行を範囲に入れるスクロールの量）
- `useGrid.ts` の `useRevealRow`：選んだときに1回（なめらかに）、そのあとは visualViewport の `resize` のたび、選んでから 1.5 秒（`REVEAL_FOLLOW_MS`）の間は `scroll`（iPhone の Safari が見えている範囲を動かしたとき）のたびにも、すぐに合わせ直す
- `useGrid.ts` の `useKeyboardHeight(active)`：`innerHeight − visualViewport.height`。名前の入力中は表の下にこの高さの余白（`.pt-spacer`）を足す（iPhone の Safari・最近の Android の Chrome はキーボードが出ても画面が縮まないので、いちばん下の行もキーボードの上まで上げられるように）。`useRevealRow` の4つ目の引数に渡して、余白が付いたあとにも合わせ直す
- 厚み・W・H・枚数（アプリのキー）は今までどおり `usePadHeight`（キーの高さの余白）と `useRevealRow`（キーの上の端まで）

### 15.9 行をドラッグで並べ替える（U-36。spec 26.5・24.2）

- `ui/dragRows.ts`（テストつき）：`gapAt(y, rows, limit)`（指の位置から動かす先の行と行の間）、`targetGap(gap, top, rows)`（動かす行の中・すぐ上・すぐ下は null）、`rowShift(i, top, rows, to)`（ほかの行がよける向き。−1 上・1 下）
- `useGrid.ts` の番号の指の動き（`startMove`）を1つにまとめた：
  - 選んでいる行全体の番号（`moveRowsFrom`。24.2）は押してすぐ引ける（`immediate`）。そうでない部材の行の番号（`liftRowsFrom`）は、LONG_PRESS_MS（500ms）動かさずに押すと持ち上がる（`lift`）。持ち上がる前に指が動いたら何もしない（表のスクロール）
  - 持ち上げたとき・引き始めたとき、各行（`.pt-item`）の位置を測っておき（`measureRows`。transform を付ける前）、指の位置はその位置で比べる（動いて見える行の位置で比べると行き来するため）。持ち上げた行は `data-lift` と `translateY`（指の動き）、ほかの行は `rowShift × 持ち上げた行の高さ` の `translateY`（CSS の transition ですべる）。React はこの style・data 属性を持たないので描き直しで消えない
  - 指を離したとき：引いていれば `onMoveRows`（engine の `moveParts`）。並べ替える前に transform をすぐ外す（`transition: none`。新しい位置から戻ってくるように見えないよう）。持ち上げて動かさずに離したら長押しのメニュー（`onLongPress`）。すぐ離したら今までどおり番号を押した（行を選ぶ）
  - 持ち上げたあと・引いている間は、window の `touchmove`（passive: false）で `preventDefault`（番号の列は指でなぞるとスクロールする所なので）。Android の長押しの `contextmenu` は、番号を押している間はメニューを開かない（離したときに決める）
  - 表の上・下の端に近づけると、今までどおり `edgeDelta` で少しずつスクロールし、動かす先を測り直す
- `PartsTable`：`liftableRows(row)`（入力中・メニュー・並べ替えのメニューを開いている間・部材の無い行は null。選んでいる行全体の中の番号なら その行全部、外なら その行だけ）、`onLift`（持ち上げた行を選ぶ。選んでいた外の行は外れる）。［調整］［木取り］の表には付けない
- 24.2 の「動かす先の線」（`MoveLine`・`.pt-moveline`）はなくした（行そのものが動くため）。引いている間は取っ手を隠す

### 15.10 名前はそのまま貼る（画面）・同じ名前の出し方（U-33。spec 26.6・26.8）

- `cellSelect.ts`：部材の表（`PartsTable` のオートフィル・`CellMenu` の貼り付け）は `pasteText`・`fillText` に番号を振った数を渡さない（「番号を振りました」は出ない）。`RENAMED_NOTE` と引数 `renamed` は、調整寸法の表（`AdjustTable`。21.1 の丸つき数字「メラミン②」は今も番号を振る）のために残した
- 3つの表で `duplicateNameIds(job.parts)`（E-27）の部材の名前のセルに `.dup`（赤字と赤い波線）。読み上げにも「（同じ名前があります）」
- 範囲の左上が名前のセルで、その部材が同じ名前なら、式の欄のすぐ下に `DUPLICATE_NAME_MESSAGE`「同じ名前があります」（［仕上がり］は名前の入力中は出さない。入力中は今までどおり行の下の理由）。［木取り］の表は名前のセルも押せるようにした（`Picked.field` に `name`）
- `FormulaBar`：中身が無い（名前のセル）のに理由があるときは、空の欄（`.fx-bar.blank`。点線で同じ高さ）と理由を出す（表の位置がずれない）
- 打って同じ名前にしたときは今までどおり（`validatePartName` の「「棚板」という部材はすでにあります」）

### 15.11 色（U-34。spec 26.3・26.8）

- `CellMenu`：「行の色」「セルの色」の欄（赤・青・黄・なし）。`target`（`'row' | 'cell'`）は、長押しした所が番号なら row、セルなら cell（`PartsTable`・`PartAdjustTable` の `openMenu` が `menuTarget` に持つ）。row は `setRowColor`、cell は `setCellColor`（どちらも `range`）を dispatch して閉じ、「セルを赤にしました」「行の色を消しました」を出す。今の色が全部同じならそのボタンに印（`aria-pressed`。`commonColor`）。部材の無い行だけを選んでいるときは欄ごと押せない（`fieldset disabled`）
- 3つの表：各セルに `markClass(cellColor(part, 列))`（`.mk-red` など。engine の `cellColor` はセルの色 → 行の色）。番号のセルは行の色（`markClass(part.rowColor)`）。［木取り］の表も同じ class（見るだけ）。木取りの画面には出さない
- `ui/cellSelect.ts`：`PART_COLOR_LABEL`（赤・青・黄）・`markClass(color)`・`commonColor(values)`（テストつき）
- 色（`index.css`）：`--mark-red`・`--mark-blue`・`--mark-yellow`（ライトは淡い色、ダークは暗い色。字の色はそのまま）と、メニューのボタンの字の色 `--mark-*-ink`。`.pt-cell.mk-*` は `.pt-cell` のすぐ後ろに置き、選んだ範囲（`.rs`）・入力中（`.on`）・エラー（`.bad`）・選んだ行の番号（`.hl`）の色が上に重なるようにした（選んでいる間は選んだ色、外すと部材の色）

### 15.12 メモ（U-35。spec 26.3・26.8）

- `components/MemoSheet.tsx`：下から出るシート（`Sheet`）に、スマホのキーボードで打つ欄（`textarea`）と「やめる」「保存」。保存は `setPartMemo`（空白・改行だけなら engine がメモを消す）。`readOnly` のときは全文だけ（［木取り］の表）
- `CellMenu`：「メモ」（メモがあれば「メモを見る・直す」）。1つの部材を選んでいるときだけ押せる。押すとメニューを閉じて `onMemo(partId)`（`PartsTable`・`PartAdjustTable` がメモの欄を開く。入力中なら入力を終える）
- 名前のセルの右上の三角：`hasMemo(part)` のとき `.pt-name.memo::after`（`--warn` の色。3つの表）。読み上げに「（メモあり）」
- `FormulaBar` の `memo`・`onMemo`：式の欄のすぐ下の `.fx-below`（表に重ねる）に、エラー（`.fx-err`）の下にメモ（`.fx-memo`。`-webkit-line-clamp: 2` で2行まで「…」）。押すとメモの欄。中身の無い欄（名前のセル）でもメモがあれば点線の空の欄とメモを出す。どの部材のメモかは式の欄と同じ（範囲の左上・入力中のセルの行。［木取り］は押したセルの行）
- `useGrid.ts` の `stickyBottom()` は `.parts-sticky .fx-below` の下の端も数える（名前の入力中、行をメモ・エラーの下に見せる）

## 16. 第2.3版の変更（仕様書 27章）：戻る・進む

作業は `docs/tasks.md` の E-29・E-30・U-37・U-38。ここは planner の下書き（2026-11-13）。名前・形は作る人が決めてよく、作ったら実装に合わせて直す。決めきれない点は tasks.md の「第2.3版の未決事項」（案で進める）。

- **考え方**：履歴は操作の **前と後の中身をまるごと持つ**（スナップショット。差分や「逆の操作」は作らない）。部材・設定・固定した1枚・調整寸法の表は変えずに新しいオブジェクトを作る作り（immutable）なので、変わらない部分は前のオブジェクトを共有し、50回持ってもメモリは小さい
- **置き場所**：`src/store/history.ts`（React に依存しない純粋な関数。`reduce` と同じく Vitest でテストする）。今の `reduce` と reducer のテストは変えず、その外側で記録する
- **保存しない**：履歴は `StoreState` に持つが、`saveSaved` は `data`・`currentJobId` だけを書くので保存されない（27.3）。戻す・進むで `data` が変わるので、今の自動保存（`JobStore.tsx` の useEffect）がそのまま保存する
- **コピーしたセルは入れない**：`cellClip`・`adjustClip` は履歴に持たず、戻しても変わらない

### 16.1 履歴の形（E-29。`src/store/history.ts`。作った）

```ts
/** 仕事の中身のうち、戻すもの（名前・id・作った日・updatedAt は戻さない） */
export type JobBody = Pick<Job, 'parts' | 'settings' | 'frozenSheets'>
export interface JobChange { jobId: string; before: JobBody; after: JobBody }
export interface AdjustsChange { before: AdjustRow[]; after: AdjustRow[] }

export interface HistoryEntry {
  label: string                 // 何をしたか（E-30 の historyLabel。まとまりは最初の操作の名前）
  group: string | null          // まとめる印（opts.group）
  jobs: JobChange[]             // 変わった仕事ごとの前と後（切り取りの元がほかの仕事なら2つ）
  adjusts: AdjustsChange | null // 調整寸法の表の前と後。変わらなければ null
}

export interface History {
  past: HistoryEntry[]          // 古い順。最大 HISTORY_LIMIT（50）
  future: HistoryEntry[]        // 戻した分（次に進むものが最後）
  last: 'record' | 'move' | null // 最後にしたのが記録か戻す・進むか（消した直後・1回を外した直後は null）
  revision: number              // 戻す・進むのたびに +1（履歴を消しても戻さない）
}

// reducer.ts の StoreState に history: History を足した（initialState は空の履歴。saveSaved は書かない）

export interface DispatchOptions { group?: string; follow?: boolean }   // 両方あれば follow が先
export type HistoryResult = { ok: true; state: StoreState; label: string; notice: string } | { ok: false; message: string }

export const HISTORY_LIMIT = 50
export function emptyHistory(revision = 0): History
export function dispatchWithHistory(state: StoreState, action: StoreAction, env: Env, opts?: DispatchOptions): ReduceResult
export function undoHistory(state: StoreState, env: Env): HistoryResult   // 失敗は「戻せる操作がありません」
export function redoHistory(state: StoreState, env: Env): HistoryResult   // 失敗は「進める操作がありません」
export const canUndo = (h: History) => h.past.length > 0
export const canRedo = (h: History) => h.future.length > 0
```

- `reducer.ts` は `import type { History } from './history'` だけ（`history.ts` が `reduce` を使うので、実行時は読み込み合わない）。`initialState` の空の履歴は `emptyHistory()` と同じ形をその場で書いている
- action の種類（戻せる・記録しない・戻せない）は `Record<StoreAction['type'], …>` の表で持つ。action を足すと型のエラーになり、入れ忘れない

### 16.2 記録の決まり（E-29）

`dispatchWithHistory` は `reduce` を呼び、結果を次の順で扱う。

1. 失敗した操作・状態が変わらなかった操作は何もしない
2. 開いている仕事（`currentJobId`）が変わったら履歴を空にする（ほかの仕事を開く・閉じる・新しい仕事を作って開く・開いている仕事の削除。同じ仕事を開き直したときは消さない＝未決事項 1）
3. 記録しない操作（コピー・切り取り・知らせを閉じる）はそのまま（`last` も変えない）
4. `replaceData` はいつも履歴を空にする（中身が同じでも）
5. 仕事（両方にある仕事の `JobBody`）・調整寸法の表の **中身** を前後で比べる（同じオブジェクトならすぐ同じ。違えば中身を比べる）。何も変わっていなければ何もしない（同じ切り代を入れ直す、などは記録しない。先も消さない）
6. **戻せない操作** で、開いている仕事の中身か調整寸法の表が変わったら履歴を空にする（`addSample` がメラミン1 を足した、など。未決事項 2）。名前の変更・ほかの仕事のコピー・ほかの仕事の削除・開かずに作るは中身が変わらないので残る（`last` も変えない）
7. **戻せる操作**（下の表）は記録する
   - `opts.follow`：`last === 'record'` なら直前の1回に含める（前は最初のまま、後を新しくする）。それ以外は記録しない（先も消さない）
   - `opts.group` が直前の1回の `group` と同じで `last === 'record'`：直前の1回に含める（ほかの仕事・調整寸法が新しく変わればそれも足す）
   - それ以外：新しい1回を足し、`future` を空にし、`past` が 50 を超えたら古いものを捨てる
   - 含めた結果、前と後の中身が同じになった仕事・調整寸法の表は外し、何も残らなければ1回ごと外す（行を挿入して何も入れずに外した、同じ入力の中で元の値に戻した、など）。外したあとは `last = null`（次の follow・同じ印をほかの1回にまとめない）

| 種類 | action |
|---|---|
| 戻せる（部材の画面） | `addPart`・`updatePart`・`setPartAdjust`・`removePart`・`insertPart`・`setAllRotatable`・`sortParts`・`moveParts`・`duplicatePart`・`pasteCells`・`fillCells`・`clearCells`・`deleteRows`・`pastePartAdjustCells`・`fillPartAdjustCells`・`clearPartAdjustCells`・`setCellColor`・`setRowColor`・`setPartMemo`・`updateSettings`（切り代） |
| 戻せる（調整寸法の表。全部の仕事で共通） | `setAdjustCell`・`pasteAdjustCells`・`fillAdjustCells`・`clearAdjustCells`・`deleteAdjustRows`・`insertAdjustRow`・`addAdjust`・`updateAdjust`・`removeAdjusts` |
| 戻せる（木取りの画面） | `setSheet`（3×6／4×8／自由入力）・`updateSettings`（刃厚・端切り・切り代・切り方）・`setPartCheck`・`setPieceCheck` |
| 記録しない（仕事も調整寸法の表も変えない） | `copyCells`・`cutCells`・`copyPartAdjustCells`・`cutPartAdjustCells`・`copyAdjustCells`・`cutAdjustCells`・`dismissLoadError` |
| 戻せない（仕事の画面。27.2） | `createJob`・`openJob`・`renameJob`・`copyJob`・`deleteJob`・`addSample`・`replaceData` |

- 貼り付けで切り取りの元がほかの仕事のときは、その仕事も同じ1回に入る（戻すと両方戻る）。貼り付けでクリップが「ふつうのコピー」に変わるのは戻さない（未決事項 10）
- **戻す**：`past` の最後の1回を取り、`jobs` の各仕事の中身を `before` に置き換え（名前・id・作った日はそのまま。updatedAt は今の時刻＝未決事項 9。その仕事が消えていれば飛ばす）、`adjusts` があれば表を `before` に。その1回を `future` へ。`last = 'move'`、`revision + 1`。**進む** は逆（`after` に置き換え、`past` へ）
  - 記録した仕事が全部消えていて調整寸法の表も無い1回は、当てる所が無いので捨てて次の1回を戻す（進む）
- 固定した1枚（`frozenSheets`）・切り出しチェックも中身に入っているので、チェックを戻すと固定した1枚も「チェックした時の形」に戻る（27.2）

### 16.3 1回の名前と知らせる文（E-30。`src/store/historyLabel.ts`。作った）

`historyLabel(action, before: StoreState): string`。部材の呼び名は操作の前の表示名（`partLabelAt`。名前の無い部材は「#3」）。`dispatchWithHistory` が新しい1回を記録するときに付ける（まとまり・後片付けは最初の1回の名前のまま）。

| action | 名前 |
|---|---|
| `updatePart`（expr の W／H） | 棚板 の W ／ 棚板 の H（W・H の両方を渡しても、今の値と違う欄の名前） |
| `updatePart`（name・thickness・quantity） | 天板 の名前（前の名前）／ 棚板 の厚み ／ 棚板 の枚数 |
| `updatePart`（adjust・rotatable・finishedDone・memo・色） | 棚板 の調整 W ／ 棚板 の回転 ／ 棚板 の仕上がり ／ 棚板 のメモ ／ 棚板 の色 |
| `addPart`（空の行に入れた） | 入れた欄（名前・厚み・W・H・枚数の順で最初に入っている欄）で「#5 の W」「#5 の名前」など。何も入っていなければ「行の追加」 |
| `setPartAdjust` | 棚板 の調整 W |
| `insertPart`・`removePart`・`deleteRows`・`duplicatePart` | 行の挿入・行の削除・行の削除・複製 |
| `sortParts`・`moveParts` | 並べ替え・行の移動 |
| `pasteCells`・`fillCells`・`clearCells`（［調整］も同じ） | 貼り付け・オートフィル・クリア |
| `setCellColor`・`setRowColor`・`setPartMemo` | 色・色・棚板 のメモ |
| `setAllRotatable` | 全部回転してよい（オン・オフどちらも。画面のスイッチの名前） |
| 調整寸法の表の操作 | 調整寸法の表 |
| `setSheet` | 板のサイズ |
| `updateSettings` | 刃厚・端切り・切り代・切り方（渡した設定の名前。2つ以上なら「刃厚・端切り」のように「・」でつなぐ） |
| `setPartCheck`・`setPieceCheck` | 切り出しチェック |

- 文の形は仕様書 27.1 の例のとおり「部材の呼び名 ＋ 空白 ＋ の ＋ 欄」。欄が W・H（英字）で始まるときだけ「の」のあとに空白を入れる（棚板 の W／棚板 の厚み／棚板 の調整 H）
- 部材が見つからないとき（ふつうは起きない）は欄の名前だけ。`updatePart` で今の値と違う欄が無いときは「棚板 の中身」
- `historyNotice(kind: 'undo' | 'redo', label)`：「戻しました：棚板 の W」／「進めました：棚板 の W」（未決事項 6）。名前が空なら「戻しました」だけ
- `undoHistory`・`redoHistory` の結果に `label`（1回の名前）と `notice`（知らせる文）を入れる。画面は `notice` をそのまま出せばよい

### 16.4 dispatch とまとまり（U-37）

- `JobStore.tsx`：`dispatch(action, opts?)` は `dispatchWithHistory` を呼ぶ（id・時刻は今どおりここで1回だけ作る）。`undo()`・`redo()` は `undoHistory`・`redoHistory` を当て、知らせる文を返す。`JobStoreValue` に `undo`・`redo`・`canUndo`・`canRedo`・`historyRevision` を足す
- 「セルの入力を終えるまでが1回」（27.2）は、**入力を始めるたびに新しい印（`group`）を作って、その入力の中の dispatch 全部に渡す** やり方にする。「始める／終える」の action は作らない（終えるのを呼び忘れると、あとの操作が全部1回にまとまってしまうため。印なら、ほかの操作が間に入れば自然に切れる）
  - `PartsTable`：`selectCell` で名前・厚み・W・H・枚数の入力を始めたとき（「次へ」で進んだときも）に新しい印。`editExpr`・`pressQty`・`pressThick`・`commitName`・`addFromEmpty`・厚みを入力を始めたときの値に戻す `updatePart` に渡す
  - `PartAdjustTable`：`startInput` で新しい印。`editAdjust`（`putAdjust` も）に渡す
  - `CellMenu`：複数の部材の複製・回転・仕上がりのループは、押した1回ごとに新しい印
  - 何も入っていない行を外す後片付け（`PartsTable` の `removePart`、`AdjustTable` の `removeAdjusts`。どちらも useEffect）は `follow`
  - 印は `newId('group')` などでよい（中身に意味は無い）

### 16.5 ボタンと知らせる文（U-38）

- `components/UndoRedo.tsx`：「↶ 戻る」「↷ 進む」（44px 以上。`canUndo`・`canRedo` が false なら `disabled` で薄く）。押したら `undo()`・`redo()`、知らせる文をボタンの帯のすぐ下に重ねて出す（未決事項 6）
- 部材の画面：`.parts-sticky` のタブの右（`.parts-tabs` と横に並べる。375px に収める＝未決事項 8）。木取りの画面：見出しの行を新しい止める帯（`position: sticky`。`top` は `.topbar` の高さ。`useTopbarHeight` は共通の所へ移す）にして右に置く
- 戻す・進むのあと：`historyRevision` が変わったら、表は入力を終えて選んでいる範囲を外す（`useGrid` の `resetKey` に足す）。入力中に押したときは、ボタンを押した時点で表の外を押したことになり（`useOutsideEnd`）、入力を確定してから戻す（未決事項 5）
