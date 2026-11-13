// 参照の依存関係の整理：計算順（参照先が先）・存在しない部材・循環参照
// kidori の dimensions/resolve.ts をもとに、寸法の軸を W・H の2つにしたもの
import { refsOf } from '../formula/evaluate'
import { parse, type Expr } from '../formula/parse'
import { normalizePartName } from '../formula/tokenize'
import { hasName, partLabels } from '../parts'
import { AXES, type Adjust, type Axis, type DimensionError, type Part } from '../types'

/** 部材の1つの寸法（部材.W など） */
export interface DimRef {
  partId: string
  axis: Axis
}

/** 1つの寸法の式を読んだ結果 */
export interface DimNode extends DimRef {
  /** 構文木。読めない式なら null */
  ast: Expr | null
  /** 参照している寸法（存在する部材だけ） */
  deps: DimRef[]
  /**
   * 厚み（部材名.T。第2.2版）を参照している部材の id（存在する部材だけ。重なりなし・出てきた順）。
   * 厚みは式ではなく数字なので、計算順・循環の辿り（deps）には入れない。部材の削除の前の確認（partsReferencing）に使う
   */
  thicknessDeps: string[]
}

export interface Resolution {
  /** 寸法ごとの式。キーは dimKey(partId, axis) */
  nodes: Map<string, DimNode>
  /** すべての寸法の計算順。参照先が先に並ぶ（循環している寸法も含む） */
  order: DimRef[]
  /** 式そのもののエラー（syntax・unknownRef・noThickness・cycle。仕上がりの欄なので field はいつも finished）。部材の並び順 → W・H の順 */
  errors: DimensionError[]
}

export function dimKey(partId: string, axis: Axis): string {
  return `${partId}:${axis}`
}

/**
 * 部材の式から依存関係を作り、計算順と、存在しない部材・循環参照を求める。
 * adjusts（アプリ全体の調整寸法）は、式のエラーの文に調整寸法の表示名を出すため（第1.4版）。
 * 厚みの参照（部材名.T。第2.2版）は依存関係に入れず、参照先の部材が無ければ unknownRef、厚みが空なら noThickness
 * （「天板 の厚みが入っていません」）にする
 */
export function resolve(parts: readonly Part[], adjusts?: readonly Adjust[]): Resolution {
  // そろえた部材名 → 部材（名前は重複しない前提。重複していれば先のものを使う）。名前の無い部材は参照できない
  const byName = new Map<string, Part>()
  for (const p of parts) {
    if (!hasName(p)) continue
    const key = normalizePartName(p.name)
    if (!byName.has(key)) byName.set(key, p)
  }
  // 表示用の名前（名前が空なら #行番号）
  const nameOf = partLabels(parts)

  const nodes = new Map<string, DimNode>()
  const ownErrors = new Map<string, DimensionError[]>()
  const addError = (e: DimensionError) => {
    const key = dimKey(e.partId, e.axis)
    ownErrors.set(key, [...(ownErrors.get(key) ?? []), e])
  }

  for (const p of parts) {
    for (const axis of AXES) {
      // 仕上がりの式（調整寸法は使えない。第2.1版 仕様書 25.4）
      const parsed = parse(p.expr[axis], adjusts, { kind: 'finished' })
      if (!parsed.ok) {
        nodes.set(dimKey(p.id, axis), { partId: p.id, axis, ast: null, deps: [], thicknessDeps: [] })
        addError({ partId: p.id, axis, field: 'finished', kind: 'syntax', message: parsed.error.message, ...(parsed.error.incomplete ? { incomplete: true } : {}) })
        continue
      }
      const deps: DimRef[] = []
      const thicknessDeps: string[] = []
      const unknown: string[] = []
      const noThickness: string[] = []
      for (const ref of refsOf(parsed.ast)) {
        const target = byName.get(ref.part)
        if (!target) {
          if (!unknown.includes(ref.part)) unknown.push(ref.part)
        } else if (ref.axis === 'T') {
          // 厚みは数字なので計算順・循環の辿りに入れない（第2.2版）
          if (!thicknessDeps.includes(target.id)) thicknessDeps.push(target.id)
          if (target.thickness === null && !noThickness.includes(target.name)) noThickness.push(target.name)
        } else {
          deps.push({ partId: target.id, axis: ref.axis })
        }
      }
      nodes.set(dimKey(p.id, axis), { partId: p.id, axis, ast: parsed.ast, deps, thicknessDeps })
      if (unknown.length > 0) {
        addError({
          partId: p.id,
          axis,
          field: 'finished',
          kind: 'unknownRef',
          message: unknown.map((n) => `「${n}」という部材はありません`).join('。'),
          refs: unknown,
        })
      }
      if (noThickness.length > 0) {
        addError({
          partId: p.id,
          axis,
          field: 'finished',
          kind: 'noThickness',
          message: noThickness.map(noThicknessMessage).join('。'),
          refs: noThickness,
        })
      }
    }
  }

  // 強連結成分（Tarjan の方法）。成分は「参照先が先」の順に見つかるので、それをそのまま計算順にする
  const order: DimRef[] = []
  const keyIndex = new Map([...nodes.keys()].map((k, i) => [k, i]))
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  let counter = 0

  const label = (key: string) => {
    const n = nodes.get(key)!
    return `${nameOf.get(n.partId)}.${n.axis}`
  }

  /** 成分の中で start から start に戻る最短の道（BFS） */
  const cyclePath = (start: string, members: Set<string>): string[] => {
    const prev = new Map<string, string>()
    const queue = [start]
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i]
      for (const d of nodes.get(cur)!.deps) {
        const k = dimKey(d.partId, d.axis)
        if (!members.has(k)) continue
        if (k === start) {
          const path = [cur]
          while (path[0] !== start) path.unshift(prev.get(path[0])!)
          return [...path, start]
        }
        if (!prev.has(k)) {
          prev.set(k, cur)
          queue.push(k)
        }
      }
    }
    return [start, start]
  }

  const visit = (key: string): void => {
    index.set(key, counter)
    low.set(key, counter)
    counter++
    stack.push(key)
    onStack.add(key)
    for (const d of nodes.get(key)!.deps) {
      const k = dimKey(d.partId, d.axis)
      if (!index.has(k)) {
        visit(k)
        low.set(key, Math.min(low.get(key)!, low.get(k)!))
      } else if (onStack.has(k)) {
        low.set(key, Math.min(low.get(key)!, index.get(k)!))
      }
    }
    if (low.get(key) !== index.get(key)) return

    const members: string[] = []
    let k: string
    do {
      k = stack.pop()!
      onStack.delete(k)
      members.push(k)
    } while (k !== key)
    // 成分の中は部材の並び順に
    members.sort((a, b) => keyIndex.get(a)! - keyIndex.get(b)!)

    const self = nodes.get(key)!
    const isCycle = members.length > 1 || self.deps.some((d) => dimKey(d.partId, d.axis) === key)
    const memberSet = new Set(members)
    for (const m of members) {
      const n = nodes.get(m)!
      order.push({ partId: n.partId, axis: n.axis })
      if (!isCycle) continue
      const path = cyclePath(m, memberSet)
      const names = [...new Set(path.map((p) => nameOf.get(nodes.get(p)!.partId)!))]
      addError({
        partId: n.partId,
        axis: n.axis,
        field: 'finished',
        kind: 'cycle',
        message: `循環参照になっています（${path.map(label).join(' → ')}）`,
        refs: names,
      })
    }
  }

  for (const key of nodes.keys()) if (!index.has(key)) visit(key)

  const errors = [...nodes.keys()].flatMap((key) => ownErrors.get(key) ?? [])
  return { nodes, order, errors }
}

/** 厚みが空の部材の厚み（部材名.T）を使っているときのエラーの文（第2.2版。仕様書 26.1） */
export function noThicknessMessage(name: string): string {
  return `${name} の厚みが入っていません`
}

/**
 * その部材の寸法・厚み（第2.2版）を式で使っている、ほかの部材（部材の並び順。軸は使っている側の式の W→H。name は表示用の名前）。
 * 部材の削除の前の確認に使う
 */
export function partsReferencing(parts: readonly Part[], partId: string): { partId: string; name: string; axes: Axis[] }[] {
  const { nodes } = resolve(parts)
  const labels = partLabels(parts)
  const out: { partId: string; name: string; axes: Axis[] }[] = []
  for (const p of parts) {
    if (p.id === partId) continue
    const axes = AXES.filter((a) => {
      const n = nodes.get(dimKey(p.id, a))
      return !!n && (n.deps.some((d) => d.partId === partId) || n.thicknessDeps.includes(partId))
    })
    if (axes.length > 0) out.push({ partId: p.id, name: labels.get(p.id)!, axes })
  }
  return out
}
