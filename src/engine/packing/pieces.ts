// 部材から作る「片」の型（kidori の packing/pieces.ts の Orientation・Piece から、材料・木目・手持ちの形 shape を外したもの）。
// E-05 では帯詰め（guillotine.ts）が使う型だけを置く。部材から片を作る処理・回転の向き・入らない片は E-06 で作る

/**
 * 板の辺に対する片の向き（置き方＝縦長／横長によらない）。x：妻手方向の大きさ、y：長手方向の大きさ。
 * 回転しない部材は x ＝ 木取り W、y ＝ 木取り H。横長に置く横切り優先では、配置図の横が y、縦が x になる（guillotine.ts の frameOf で直す）
 */
export interface Orientation {
  x: number
  y: number
  /** 部材の W を板の長手方向に置いた（回転した）とき true */
  rotated: boolean
}

/** 切り出す片（部材の1枚ぶん） */
export interface Piece {
  /** `${partId}#${連番}` */
  pieceId: string
  partId: string
  name: string
  /** 配置図に出す寸法（木取り寸法の W×H） */
  sizeLabel: string
  /** 置いてよい向き（使える範囲に入るものだけ）。回転してよい部材は2つになることがある */
  orientations: Orientation[]
}
