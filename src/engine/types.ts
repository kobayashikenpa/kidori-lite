// kidori-lite の計算で使うデータの形と初期値。寸法はすべて mm の number。
// kidori の types.ts をもとに、材料（Board）・厚み・材料グループ（フラッシュ）・重ね切り・手持ち・端材の行を外したもの

/** 部材の寸法の軸（板の面の2つ）。回転しない部材は W を板の妻手、H を板の長手に合わせて置く */
export type Axis = 'W' | 'H'

export const AXES: readonly Axis[] = ['W', 'H']

/**
 * 式の参照の軸（第2.2版。仕様書 26.1）：W・H は部材の仕上がり寸法、T は部材の厚み（Part.thickness）。
 * 部材の寸法の軸（Axis）とは分ける（T は板に置く寸法ではない）
 */
export type RefAxis = Axis | 'T'

export const REF_AXES: readonly RefAxis[] = ['W', 'H', 'T']

// ---------- 入力 ----------

/** 切り方：縦切り優先 / 横切り優先（第1.4版で「おまかせ」をなくした。古いデータの 'auto' は読むときに 'vertical' にする。仕様書 18.2） */
export type CutMode = 'vertical' | 'horizontal'

/** 板のサイズの種類：3×6（サブロク）/ 4×8（シハチ）/ 自由入力 */
export type BoardSizeKind = 'saburoku' | 'shihachi' | 'custom'

/** 定尺板の大きさ［妻手, 長手］。4×8 は 1220×2430（kidori の 2440 とは違う。仕様書 4） */
export const BOARD_SIZES: Readonly<Record<Exclude<BoardSizeKind, 'custom'>, readonly [number, number]>> = {
  saburoku: [910, 1820],
  shihachi: [1220, 2430],
}

/** 板（仕事ごとに1種類） */
export interface Sheet {
  sizeKind: BoardSizeKind
  /** 妻手（mm） */
  width: number
  /** 長手（mm）。width ≦ length にそろえる */
  length: number
}

/** 仕事ごとの設定 */
export interface Settings {
  /** 板（初期値 4×8） */
  sheet: Sheet
  /** 刃厚（初期値 3。0 も可） */
  kerf: number
  /**
   * 端切り（初期値 5）。この幅は刃厚を含む。0 で端切りなし。
   * 縦切り優先は右の長手だけ、横切り優先は下の長手と右の妻手を落とす
   */
  trim: number
  /** 切り代（初期値 10）。W・H に同じ値を足す。部材ごとの上書きは無い */
  allowance: number
  /** 切り方（初期値 縦切り優先） */
  cutMode: CutMode
}

/** 設定の数値の初期値。板はオブジェクトなので含めない（新しい設定は defaults.ts の defaultSettings() で作る） */
export const DEFAULT_SETTINGS: Readonly<Omit<Settings, 'sheet'>> = {
  kerf: 3,
  trim: 5,
  allowance: 10,
  cutMode: 'vertical',
}

/**
 * 調整寸法（アプリ全体で1つの一覧）。逃げ・ほぞ・メラミン・シートなど。kidori の Nige と同じ形。
 * 表示名は「名前＋寸法」（adjustName。例：逃げ1、ほぞ15）。表示名が重なるものは登録しない（adjustNameKey で判定）
 */
export interface Adjust {
  /** アプリの中で重複しない。式からはこの id で参照する（{n:id}） */
  id: string
  /** 名前（例：逃げ、ほぞ）。空でない */
  name: string
  /** mm。0 より大きい */
  value: number
}

/** 部材 */
export interface Part {
  id: string
  /**
   * 仕事の中で重複不可（全角・半角の違いは同じとみなす）。式の参照に使う。
   * 空でもよい（第1.1版）。空どうしは重ならず、画面では「#3」（行番号）と出す（parts.ts の partLabel）。空の部材は式から参照できない
   */
  name: string
  /** 仕上がり寸法の入力（数値または式の文字列） */
  expr: Record<Axis, string>
  /**
   * 調整の式（第2.1版。仕様書 25.2）：仕上がり寸法に足し引きする値（W・H それぞれ）。
   * 使えるのは 数字・+ - * / ( )・調整寸法 {n:id} だけ（部材の寸法は使えない）。先頭の - で引き、+ か記号なしで足す。
   * 空の文字は「調整なし（0）」。調整後の寸法 ＝ 仕上がり ＋ 調整、木取り寸法 ＝ 調整後 ＋ 切り代（formula/adjustExpr・dimensions）。
   * 第2.0版までの保存データ・ファイルには無いので、読むときに W・H とも空にする（shape.ts の readJob）
   */
  adjust: Record<Axis, string>
  /**
   * 厚み（第2.2版。仕様書 26.1）：0 より大きい数（mm。小数可）か、空（null）。入れなくてもよい。
   * 木取りの並べ方（板）には使わない（W・H だけを板に置く）。式では「天板.T」でほかの部材から参照できる（E-25）。
   * 調整・切り代は足さない。第2.1版までの保存データ・ファイルには無いので、読むときに null にする（shape.ts の readJob）
   */
  thickness: number | null
  /** 枚数（0 は切り出さない寸法だけの行。null は枚数が空＝寸法は計算するが、木取り・必要な枚数・進み具合・比べに入れない） */
  quantity: number | null
  /** 回転してよい（W・H を入れ替えて置いてよい）。初期値 false */
  rotatable: boolean
  /** 仕上がりの完了のチェック。木取りの計算には影響しない */
  finishedDone: boolean
}

/** 仕事 */
export interface Job {
  id: string
  name: string
  settings: Settings
  /** 並び順＝画面の並び順 */
  parts: Part[]
  /** 固定した1枚（固定した順） */
  frozenSheets: FrozenSheet[]
  /** ISO 文字列 */
  createdAt: string
  updatedAt: string
}

/** 保存する全体 */
export interface AppData {
  version: 1
  jobs: Job[]
  /**
   * 調整寸法の表の行（アプリ全体で1つ。並び＝表の並び）。初めは メラミン1・シート0.5。
   * 第1.7版から書きかけの行（名前だけ・寸法だけ）も持つ（AdjustRow）。式で使えるのは名前と寸法がそろった行だけ（engine/adjusts の usableAdjusts）
   */
  adjusts: AdjustRow[]
  /** 最後にコピーしたセル（第1.2版。仕様書 16.1）。無ければ null。ほかの仕事でも貼れる */
  cellClip: CellClip | null
  /** 調整寸法の表で最後にコピーしたセル（第1.7版。部材の表の cellClip とは分ける）。無ければ null */
  adjustClip: AdjustClip | null
}

/**
 * 調整寸法の表の1行（第1.7版。仕様書 21.1）。書きかけ（名前だけ・寸法だけ）も持てる。
 * - name：空でもよい（前後の空白は外して持つ）
 * - value：0 より大きい数か、空（null）
 * 名前があり寸法が 0 より大きい行が、式で使える調整寸法（Adjust）。書きかけの行を使っている式は「削除した調整寸法」と同じエラーになる。
 * 名前も寸法も空の行は保存しない（表から外す）
 */
export interface AdjustRow {
  id: string
  name: string
  value: number | null
}

/** 調整寸法の表の欄（左から 名前・寸法）。範囲（CellRange）の left は 0＝名前・1＝寸法 */
export type AdjustCol = 'name' | 'value'
export const ADJUST_COLS: readonly AdjustCol[] = ['name', 'value']

/** 調整寸法の表のセルの位置。row は表の行（0 から。AppData.adjusts の位置。行の数以上は空の行） */
export interface AdjustCellPos {
  row: number
  col: AdjustCol
}

/**
 * 調整寸法の表でコピーしたセル（第1.7版）。cells[行][列] は名前か寸法の文字（寸法は数字の文字、空は ''）。
 * cut は切り取った元の範囲（表はアプリに1つなので仕事の id は持たない）。無ければふつうのコピー
 */
export interface AdjustClip {
  rows: number
  cols: number
  cells: string[][]
  cut?: CellRange
}

// ---------- セルのコピーと貼り付け（第1.2版。仕様書 16.1） ----------

/** 部材の表の欄（左から 名前・厚み・W・H・枚数。T は厚み。第2.2版で厚みを足した） */
export type CellCol = 'name' | 'T' | 'W' | 'H' | 'qty'
export const CELL_COLS: readonly CellCol[] = ['name', 'T', 'W', 'H', 'qty']

/**
 * 部材の表の列の並びの印（第2.2版）。コピーしたセル（CellClip.columns）に付け、読み込むときに今の並びと同じものだけを使う。
 * 列の並びが変わると印も変わるので、前の版で保存したクリップ（印なし・違う印）は捨てる（仕様書 26.8）
 */
export const CELL_COLS_KEY: string = CELL_COLS.join(',')

/** 部材の表のセルの位置。row は表の行（0 から。job.parts の位置。部材の数以上は空の行） */
export interface CellPos {
  row: number
  col: CellCol
}

/**
 * コピーしたセル（四角い形）。cells[行][列] はセルの中身の文字（名前・式は書いたまま・厚みと枚数は数字の文字。空は ''）。
 * 1つのセルなら rows = cols = 1
 */
export interface CellClip {
  rows: number
  cols: number
  cells: string[][]
  /**
   * 切り取ったときの元（第1.3版。仕様書 17.3）。貼ったときに元のセルを空にし、そのあとは消す（ふつうのコピーになる）。
   * 無ければふつうのコピー（第1.2版の保存データも無い）
   */
  cut?: CellCut
  /**
   * どのタブの欄から写したか（第2.1版。仕様書 25.2）。'adjust' は［調整］のタブ（W・H は調整の式）。
   * 無ければ［仕上がり］のタブ（第2.0版までの保存データも無い）。［仕上がり］と［調整］をまたいで貼ることはできない
   */
  source?: 'adjust'
  /**
   * 列の並びの印（第2.2版。CELL_COLS_KEY）。copyCells・cutCells・copyPartAdjustCells で作るクリップには必ず付ける。
   * 保存データを読むとき、この印が今の CELL_COLS_KEY と違う（無い）クリップは前の版のものとして捨てる（shape.ts の isCellClip）。
   * 貼り付け（pasteCells など）はこの印を見ない
   */
  columns?: string
}

/**
 * 部材の表の四角い範囲（第1.3版）。left は列の位置（0＝名前・1＝厚み・2＝W・3＝H・4＝枚数。第2.2版で厚みを足した）。1つのセルは rows = cols = 1。
 * 行全体は left 0・cols 5、列全体は top 0・rows 部材の数（engine/clipboard/cells の rowRange・columnRange）
 */
export interface CellRange {
  top: number
  left: number
  rows: number
  cols: number
}

/** 切り取った元：仕事の id と範囲 */
export interface CellCut {
  jobId: string
  range: CellRange
}

// ---------- 寸法の計算結果 ----------

export type DimensionErrorKind =
  | 'syntax' // 式が読めない
  | 'unknownRef' // 存在しない部材名を参照
  | 'noThickness' // 厚みが空の部材の厚み（部材名.T）を参照（第2.2版）
  | 'unknownAdjust' // 式が使っている調整寸法が削除されている
  | 'cycle' // 循環参照
  | 'nonPositive' // 計算結果が 0 以下
  | 'divideByZero' // 0 で割った

/**
 * エラーの欄（第2.1版）：finished＝［仕上がり］の W・H の式、adjust＝［調整］の W・H の調整の式。
 * 画面の［仕上がり］のタブは finished のエラーだけ、［調整］［木取り］のタブは両方を出す
 */
export type DimensionField = 'finished' | 'adjust'

export interface DimensionError {
  partId: string
  axis: Axis
  /** どの欄のエラーか（第2.1版）。仕上がりがエラーのときは調整後もエラーだが、調整の欄のエラーは足さない（調整の式そのものがおかしいときだけ adjust） */
  field: DimensionField
  kind: DimensionErrorKind
  /** 画面にそのまま出せる日本語 */
  message: string
  /** unknownRef・noThickness の部材名、cycle の部材名の並び */
  refs?: string[]
  /**
   * 入れている途中の形の式（syntax のときだけ。空・終わりが記号や「(」・かっこが閉じていない・「1.」。第1.4版。仕様書 18.5）。
   * 画面は入力中のセルのこのエラーを出さない。参照している寸法に伝わったエラー（from のあるもの）には付けない
   */
  incomplete?: true
  /**
   * エラーのある寸法を参照しているために計算できないとき、元のエラーがある寸法。
   * 自分の式にエラーがあるときは付かない
   */
  from?: { partId: string; axis: Axis }
}

export interface PartDimensions {
  partId: string
  /** 表示用の名前（名前が空なら「#行番号」。parts.ts の partLabelAt） */
  name: string
  /** 部材の枚数（null は枚数が空） */
  quantity: number | null
  /** 仕上がり寸法（式の計算結果）。エラーがあれば null */
  finished: Record<Axis, number> | null
  /** 調整後の寸法（仕上がり ＋ 調整。第2.1版。仕様書 25.1）。仕上がり・調整のどちらかにエラーがあれば null */
  adjusted: Record<Axis, number> | null
  /** 木取り寸法（調整後 ＋ 切り代。W・H それぞれに1回。第2.1版から調整後に足す）。エラーがあれば null */
  cut: Record<Axis, number> | null
  /** 軸ごとの仕上がり寸法（計算できた軸だけ）。片方の軸だけエラーのとき、式の隣に出す値（仕様書 5.2）に使う */
  finishedByAxis: Partial<Record<Axis, number>>
  /** 軸ごとの調整の値（足し引きする値。調整が空なら 0。調整の式が計算できた軸だけ。第2.1版） */
  adjustByAxis: Partial<Record<Axis, number>>
  /** 軸ごとの調整後の寸法（仕上がりと調整の両方が計算でき、0 より大きい軸だけ。第2.1版） */
  adjustedByAxis: Partial<Record<Axis, number>>
  /** 軸ごとの木取り寸法（調整後 ＋ 切り代。計算できた軸だけ） */
  cutByAxis: Partial<Record<Axis, number>>
  errors: DimensionError[]
}

export interface DimensionResult {
  /** 入力の並び順 */
  parts: PartDimensions[]
  /** 全部材のエラー */
  errors: DimensionError[]
}

// ---------- 木取りの結果（kidori と同じ形から材料・手持ちを外したもの） ----------

/**
 * 板の置き方（配置図の向き）。
 * - portrait（縦長、縦切り優先）：x は妻手方向 0〜width、y は長手方向 0〜length
 * - landscape（横長、横切り優先）：x は長手方向 0〜length、y は妻手方向 0〜width
 */
export type SheetOrientation = 'portrait' | 'landscape'

/**
 * 板の上の長方形。その板の置き方（SheetOrientation）の座標で、左下を原点とする（x は右が +、y は上が +）。
 * 配置図の上＝奥、右＝端切りをした側
 */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Placement extends Rect {
  /**
   * `${partId}#${連番}`。1枚の中でだけ重ならない。1枚をまたぐ区別は1枚の id と組にする
   * （固定した1枚の片を引いたあと、残りの片の連番は #1 からふり直すため、別の1枚に同じ pieceId があり得る）
   */
  pieceId: string
  partId: string
  /** 表示用の名前（並べたときの partLabel。名前が空なら「#行番号」） */
  name: string
  /** 部材の W を板の妻手方向に置いたとき false、W を長手方向に置いた（回転した）とき true（置き方によらない） */
  rotated: boolean
  /** 配置図に出す寸法（例："1810×410"） */
  sizeLabel: string
}

/** 配置図の上で 縦に切る（線が y 方向）/ 横に切る（線が x 方向）。縦長に置いたときは 縦＝長手と平行 */
export type CutDirection = 'vertical' | 'horizontal'

export interface CutStep {
  /** 1 から */
  no: number
  direction: CutDirection
  /** 切る線の位置：vertical なら x、horizontal なら y */
  at: number
  /** 切る範囲（この長方形を2つに分ける） */
  within: Rect
  /** 端切り / 帯を切る / 帯を切り分ける / 幅を切り揃える */
  kind: 'trim' | 'strip' | 'crosscut' | 'rip'
  /** 画面用の日本語（例：「右端から 410mm で縦に切る」） */
  label: string
}

export interface SheetLayout {
  /** 何枚目か（1 から）。計算した1枚は固定した1枚があっても 1 から（画面で通し番号を振り直す） */
  index: number
  /** 妻手 */
  boardWidth: number
  /** 長手 */
  boardLength: number
  /**
   * 配置図の向き。portrait なら図の大きさは boardWidth×boardLength、
   * landscape なら boardLength（横）×boardWidth（縦）。ほかの Rect はすべてこの向きの座標
   */
  orientation: SheetOrientation
  /** 端切りで落とす部分（切る順番と同じ並び）。端切り0 なら空 */
  trims: Rect[]
  /** 端切り後に使える範囲 */
  usable: Rect
  placements: Placement[]
  cuts: CutStep[]
  /** 端材 */
  scraps: Rect[]
  /** 部材（木取り寸法）の面積の合計 */
  usedArea: number
  /** 歩留まり 0〜1 */
  yieldRate: number
}

/** 入らない部材の理由。tooLarge：板のどの向きにも入らない */
export type UnplacedReason = 'tooLarge'

export interface PackingResult {
  /** 計算に使った板 */
  sheet: Sheet
  /** 実際に使った切り方（設定の切り方と同じ） */
  mode: 'vertical' | 'horizontal'
  /** 固定した1枚を除いた、計算した1枚 */
  sheets: SheetLayout[]
  /** 必要な板の枚数（固定した1枚を含む） */
  sheetCount: number
  /** 全体の歩留まり */
  yieldRate: number
  /** 板に収まらない部材（name は表示用の名前） */
  unplaced: { partId: string; name: string; reason: UnplacedReason }[]
  /** 寸法のエラーで計算から外した部材（name は表示用の名前。枚数が 0・空の部材は入れない） */
  skipped: { partId: string; name: string; reason: 'dimensionError' }[]
}

// ---------- 切りながら進める木取り ----------

/**
 * 固定した1枚（kidori の FrozenSheet から材料・重ね切りを外したもの）。1つ目の片にチェックしたときに、
 * 画面に出ていた1枚を写して作る。部材や設定が変わっても、この写しは変わらない
 */
export interface FrozenSheet {
  /** 仕事の中で重複しない */
  id: string
  /** 固定したときの板 */
  sheet: Sheet
  /** 固定したときの切り方 */
  mode: 'vertical' | 'horizontal'
  /** 固定したときの刃厚 */
  kerf: number
  /** 固定したときの端切り */
  trim: number
  /** 固定したときの1枚（深いコピー。index は使わない＝表示のときに振り直す） */
  layout: SheetLayout
  /** チェックした片の pieceId（layout.placements にあるものだけ・重複なし） */
  checked: string[]
  /** ISO */
  frozenAt: string
  /** すべての片にチェックした時刻（ISO）。あれば「切り終わり」 */
  completedAt?: string
}
