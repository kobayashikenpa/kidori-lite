// 初期値（設定・板・調整寸法・仕事・保存データ）と、調整寸法の表示名
// kidori の defaults.ts をもとに、材料（Board）の初期値と材料の厚みの表示を外したもの
import { exactText } from './round'
import { BOARD_SIZES, DEFAULT_SETTINGS, type Adjust, type AppData, type Job, type Settings, type Sheet } from './types'

/** 新しい仕事の板：4×8（1220×2430）。呼ぶたびに新しいオブジェクト */
export function defaultSheet(): Sheet {
  const [width, length] = BOARD_SIZES.shihachi
  return { sizeKind: 'shihachi', width, length }
}

/**
 * 板の妻手・長手をそろえる：小さい方を width（妻手）、大きい方を length（長手）にした写し。
 * 自由入力で逆に入れても（2430×1220 など）同じ板として計算するため。packJob・freezeSheet の頭でも必ず通す
 */
export function normalizeSheet(sheet: Sheet): Sheet {
  return { sizeKind: sheet.sizeKind, width: Math.min(sheet.width, sheet.length), length: Math.max(sheet.width, sheet.length) }
}

/** 自由入力の板（入れた順によらず、小さい方を妻手・大きい方を長手にする） */
export function customSheet(a: number, b: number): Sheet {
  return normalizeSheet({ sizeKind: 'custom', width: a, length: b })
}

/** 新しい仕事の設定：4×8・刃厚3・端切り5・切り代10・縦切り優先。呼ぶたびに新しいオブジェクト */
export function defaultSettings(): Settings {
  return { sheet: defaultSheet(), ...DEFAULT_SETTINGS }
}

/** 初めて開いたときの調整寸法：メラミン1・シート0.5（仕様書 4.1）。id は newId('adjust') */
export function defaultAdjusts(newId: (prefix: string) => string): Adjust[] {
  return [
    { id: newId('adjust'), name: 'メラミン', value: 1 },
    { id: newId('adjust'), name: 'シート', value: 0.5 },
  ]
}

/**
 * 新しい仕事（部材なし）。id・名前・時刻は引数で受ける（純粋関数）。
 * settings を渡せばその写しを使う（仕事のコピーで設定を引き継ぐとき）。無ければ初期値
 */
export function createJob(args: { id: string; name: string; now: string; settings?: Settings }): Job {
  const settings = args.settings
    ? { ...args.settings, sheet: { ...args.settings.sheet } }
    : defaultSettings()
  return {
    id: args.id,
    name: args.name,
    settings,
    parts: [],
    frozenSheets: [],
    createdAt: args.now,
    updatedAt: args.now,
  }
}

/** 初めて開いたときの保存データ：仕事なし・調整寸法は初期値・コピーしたセルなし */
export function defaultAppData(newId: (prefix: string) => string): AppData {
  return { version: 1, jobs: [], adjusts: defaultAdjusts(newId), cellClip: null }
}

/**
 * 調整寸法の表示名＝名前＋寸法（例：逃げ1、ほぞ15、シート0.5。「mm」は付けない。仕様書 4.1）。
 * 寸法そのものを式で使うので、寸法は丸めない（0.25 を 0.3 と見せない）。浮動小数の誤差（0.1 + 0.2 など）だけ消す。
 * kidori の nigeName
 */
export function adjustName(adjust: Pick<Adjust, 'name' | 'value'>): string {
  return `${adjust.name}${exactText(adjust.value)}`
}

/**
 * 表示名が重なるかの判定用のキー。名前の前後の空白を外し、表示名の全角・半角をそろえる。
 * 名前「逃げ1」寸法5 と 名前「逃げ」寸法15 は、どちらも「逃げ15」になり重なる
 */
export function adjustNameKey(adjust: Pick<Adjust, 'name' | 'value'>): string {
  return adjustName({ name: adjust.name.trim(), value: adjust.value }).normalize('NFKC')
}
