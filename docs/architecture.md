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
      index.ts           packJob(job, dims, options?)：おまかせ・固定した1枚を除いた入口 ← kidori：packing/index.ts
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
      SettingsPanel.tsx  板のサイズ・刃厚・端切り・切り代・切り方
      AdjustList.tsx     調整寸法の一覧・追加（逃げ／ほぞ／自由入力）
      PartRow.tsx        部材の1行（式 ｜ 計算した寸法、仕上がりの完了）
      PartEditor.tsx     部材の編集（名前・W・H・枚数・回転・複製）
      FormulaInput.tsx   式の入力（ボタン・カーソル・部材｜調整寸法のタブ）← kidori の操作を参考
      Numpad.tsx         数字キー
      PastePreview.tsx   貼り付けの確認（第1.2版でなくした）
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
  cellClip: CellClip | null     // 最後にコピーしたセル（第1.2版。8.1。第1.1版までは clipboard: CopiedPart[] | null）
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
- 帯詰め・同じ幅の優先・右上から詰める・おまかせの比べ方・切る順番・端材（30mm 以上・大きい順）・歩留まりは kidori のまま
- 帯詰め（`guillotine.ts`）：`packGuillotine(pieces, usable, kerf, mode, sameWidthFirst = true)`。同じ幅を優先する並べ方（true）と、幅が収まる最初の帯に入れる並べ方（false。kidori 第2.4版まで）を持つ
- 並べ方の選び方（`guillotine.ts` の `chooseWay(fixed, run)`・`preferSameWidth`。kidori 17.13 の `packing/index.ts` から移した）：両方を計算し、入らない片が少ないほう → 板が少ないほう → 同じなら同じ幅を優先するほう。`packJob`（E-06）は kidori と同じく、並べ方ごとに（おまかせなら縦切り・横切りを選んでから）`chooseWay` で比べる
- 部材 → 片（`pieces.ts`）：`expandPieces(job, dims, frozen)` で部材ごとの片の並び（枚数0 は除く、寸法のエラーは `skipped`）、`piecesOf(runs, board, trim, mode)` で向きを決めて片にする（どう置いても入らない部材は `unplaced`＝tooLarge）。向きの判定は、おまかせなら広いほう（縦切り優先）の範囲（kidori と同じ。横切り優先で入らない片は並べるときに除かれ、おまかせの比べで数える）
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
| 式の入力 | 欄の上の1行に計算結果かエラー。下にボタン：「部材｜調整寸法」のタブ（部材は部材名 → W・H の2段階）、数字、`+ − × ÷ ( )`、←→、1字消す・全部消す |
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
- `referableParts(parts)`：式の「部材」のボタンに出す部材（名前のある部材だけ）
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
| `pasteCells(job, clip, cells, newId)` | `{ ok: true, job, pasted, skipped: { cell, reason, message }[] }`／`{ ok: false, message: '貼るセルを選んでください' }`。reason は `duplicateName`（同じ名前は貼れません）・`invalidName`（名前に使えない文字。validatePartName の文）・`notQuantity`（枚数には 0 以上の整数だけ貼れます） |
| `clearCells(job, cells)` | 中身を空に（枚数は null）。行の全部の欄が空になった部材（`parts.ts` の `isBlankPart`）は消す |
| `deleteRows(job, cells)` | 選んだセルのある行の部材をまとめて消す。`selectedPartIds(job, cells)` で消す部材の id（式で使われているかは `ui/partsTable` の `referencingOthers`＝`partsReferencing` で確かめる） |

- **貼り付け**：1×1 のコピーは選んだセル全部に同じもの。範囲のコピーは選んだセルの一番左上（いちばん上の行・いちばん左の列。四角でない選び方なら外枠の左上）から同じ形。枚数の右にはみ出す列は貼らない（貼れなかった数にも入れない）
- 空の行（部材の数以上）に貼ると部材を作る（`newId('part')`・名前と W・H は空・枚数は空・回転しない）。途中の空の行も、部材の後ろに上から詰めて足す（暫定）。空だけを貼った行は作らない
- 名前は前後の空白を外して入れる。貼ったあとに名前のある部材どうしで同じ名前（`normalizePartName`）になるものは貼らない：元のまま残る名前と重なる名前は貼らず、貼るものどうしで重なるときは上（左）の1つだけ貼る（入れ替え A・B → B・A は貼れる）。ほかの式の参照は書き換えない（名前の変更ではない）
- W・H は文字のまま式として入れる（読めなければ計算のエラー）。枚数は 0 以上の整数（全角の数字も）だけ、空は空に
- 貼って行の全部の欄が空になった部材は消す。1つも貼れなかったときは同じ仕事を返す
- **保存データ**：`store/storage.ts` の `parseAppData` は `cellClip` を `shape.ts` の `isCellClip` で確かめ、形が違えば null（仕事は読める）。第1.1版までの `clipboard` はあっても読んで捨てる。バックアップ・共有のファイルには入れない
- **store**（`reducer.ts`）：`{ type: 'copyCells', cells }`（`cellClip` を置き換える。仕事は変えない）、`{ type: 'pasteCells', cells }`（結果の `paste: { pasted, skipped }`）、`{ type: 'clearCells', cells }`、`{ type: 'deleteRows', cells }`（空の行だけなら「削除する行を選んでください」）。どれも `jobId` を省くと開いている仕事。古い `copyParts`・`pasteParts`・`removeParts` と `jobs.ts` の `removeParts` はなくした
- 画面の古い「選んでコピー」「貼り付け（◯件）」「選んで削除」と `PastePreview.tsx` は外した。新しい画面は U-14

### 8.2 枚数のキー・行を足す・調整寸法（U-15。spec 16.2・16.5・16.6）

- 枚数のキーも `FormulaKeys.tsx` を使う（`quantity: { onKey }` を渡すと数字・1字消す・全部消す だけ押せ、「部材｜調整寸法」のタブ・記号・◀▶・小数点は同じ場所に薄く出して押せない）。「閉じる」「次へ」は W・H・枚数で同じ部品（`PartsTable.tsx` の `PadActions`）
- 「調整寸法」のタブの「＋ 追加」：`FormulaKeys` の `onAddAdjust(draft)`（`PartsTable` が store の `addAdjust` を呼び、足した id を返す）。重なりの判定は `store/jobs.ts` の `validateAdjust`。足したら `{n:id}` をカーソルの位置に入れる
- 「＋ 5行足す」：`ui/partsTable.ts` の `tableRowCount(partCount, minRows)`・`addRowsMin`。足した行の下限は `sessionTableMinRows`／`setSessionTableMinRows`（モジュールの中の Map。仕事ごと・保存しない）
- 部材の画面の上のたたんだ欄は `AdjustPanel.tsx`（中身は `AdjustList.tsx`）
