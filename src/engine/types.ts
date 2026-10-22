// kidori-lite の計算で使うデータの形と初期値。寸法はすべて mm の number。
// kidori の types.ts をもとに、材料（Board）・厚み・材料グループ（フラッシュ）・重ね切り・手持ち・端材の行を外したもの

/** 部材の寸法の軸（板の面の2つ）。回転しない部材は W を板の妻手、H を板の長手に合わせて置く */
export type Axis = 'W' | 'H'

export const AXES: readonly Axis[] = ['W', 'H']

// ---------- 入力 ----------

/** 切り方：縦切り優先 / 横切り優先 / おまかせ */
export type CutMode = 'vertical' | 'horizontal' | 'auto'

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
  /** 調整寸法（アプリ全体で1つ）。初めは メラミン1・シート0.5 */
  adjusts: Adjust[]
  /** 最後にコピーした部材。無ければ null */
  clipboard: CopiedPart[] | null
}

/** コピーした部材（id は持たない。式は式のまま。{n:id} の調整寸法はアプリ全体なのでそのまま使える） */
export type CopiedPart = Omit<Part, 'id' | 'finishedDone'>

// ---------- 寸法の計算結果 ----------

export type DimensionErrorKind =
  | 'syntax' // 式が読めない
  | 'unknownRef' // 存在しない部材名を参照
  | 'unknownAdjust' // 式が使っている調整寸法が削除されている
  | 'cycle' // 循環参照
  | 'nonPositive' // 計算結果が 0 以下
  | 'divideByZero' // 0 で割った

export interface DimensionError {
  partId: string
  axis: Axis
  kind: DimensionErrorKind
  /** 画面にそのまま出せる日本語 */
  message: string
  /** unknownRef の部材名、cycle の部材名の並び */
  refs?: string[]
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
  /** 木取り寸法（仕上がり ＋ 切り代。W・H それぞれに1回）。エラーがあれば null */
  cut: Record<Axis, number> | null
  /** 軸ごとの仕上がり寸法（計算できた軸だけ）。片方の軸だけエラーのとき、式の隣に出す値（仕様書 5.2）に使う */
  finishedByAxis: Partial<Record<Axis, number>>
  /** 軸ごとの木取り寸法（計算できた軸だけ） */
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
  /** 実際に使った切り方（おまかせなら選ばれたほう） */
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
  /** 固定したときの切り方（おまかせなら選ばれたほう） */
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
