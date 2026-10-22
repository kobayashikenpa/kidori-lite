// 部材の編集シート（仕様書 5・5.4）：名前（スマホのキーボード）・W・H（式の入力）・枚数（数字キー）・回転・複製・削除。
// 書いている途中は下書きに持ち、「保存する」で仕事に入れる。寸法の計算は engine（computeDimensions）に任せる
import { useMemo, useState } from 'react'
import { computeDimensions } from '../../engine/dimensions'
import { partsReferencing } from '../../engine/dimensions/resolve'
import { validatePartName } from '../../engine/formula/tokenize'
import { partLabel, referableParts } from '../../engine/parts'
import { AXES, type Axis, type Part } from '../../engine/types'
import { newPart } from '../../store/jobs'
import { useJobStore } from '../../store/useJobStore'
import { parseNum } from '../format'
import { closeKeyboard } from '../keyboard'
import { FormulaInput } from './FormulaInput'
import { Help } from './Help'
import { KeypadField } from './KeypadField'
import { Segmented } from './Segmented'
import { Sheet } from './Sheet'

/** 新しく足す部材の下書きの id（保存のときに本当の id を作る） */
const DRAFT_ID = 'draft-new-part'

interface Props {
  /** 編集する部材。null なら新しく足す */
  partId: string | null
  onClose: () => void
  /** 複製したあと、その部材の編集に移る */
  onOpenPart: (partId: string) => void
}

type Rotate = 'fixed' | 'free'
const ROTATE_OPTIONS: { value: Rotate; label: string }[] = [
  { value: 'fixed', label: '回転しない' },
  { value: 'free', label: '回転してよい' },
]

export function PartEditor({ partId, onClose, onOpenPart }: Props) {
  const { job, data, dispatch } = useJobStore()
  const original = job?.parts.find((p) => p.id === partId) ?? null
  const [draft, setDraft] = useState<Part>(() => original ?? newPart(DRAFT_ID))
  const [qtyText, setQtyText] = useState(() => String((original ?? newPart(DRAFT_ID)).quantity ?? ''))
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'delete' | 'discard' | null>(null)
  // ボタンの並びを開いている欄（1つだけ）
  const [padAxis, setPadAxis] = useState<Axis | null>(null)
  const adjusts = data.adjusts

  // 入力中の内容で寸法を計算し直す（計算は engine に任せる）
  const draftJob = useMemo(() => {
    if (!job) return null
    const parts = original ? job.parts.map((p) => (p.id === original.id ? draft : p)) : [...job.parts, draft]
    return { ...job, parts }
  }, [job, original, draft])
  const dims = useMemo(() => (draftJob ? computeDimensions(draftJob, adjusts) : null), [draftJob, adjusts])
  if (!job || !draftJob || !dims) return null
  const mine = dims.parts.find((p) => p.partId === draft.id)
  const others = job.parts.filter((p) => p.id !== draft.id)
  const finishedOf = (id: string) => dims.parts.find((p) => p.partId === id)?.finishedByAxis ?? {}

  const patch = (p: Partial<Part>) => {
    setDraft((d) => ({ ...d, ...p }))
    setError(null)
    setConfirm(null)
  }

  const name = draft.name.trim()
  const nameError = validatePartName(
    name,
    others.map((p) => p.name),
  )
  const qty = parseNum(qtyText)
  // 枚数は空でもよい（第1.1版：計算に入れない）。W・H も表と同じく空のまま保存できる
  const qtyError =
    qty !== null && (Number.isNaN(qty) || !Number.isInteger(qty) || qty < 0) ? '枚数は 0 以上の整数を入れてください' : null
  const blocker = nameError ?? qtyError
  const dirty =
    !original ||
    original.name !== draft.name ||
    original.expr.W !== draft.expr.W ||
    original.expr.H !== draft.expr.H ||
    original.rotatable !== draft.rotatable ||
    original.quantity !== qty

  /** 保存する。できたら true */
  const save = (): boolean => {
    if (blocker) {
      // 名前の理由は名前の欄の下に出ているので、重ねて出さない
      setError(blocker === nameError && name !== '' ? null : blocker)
      return false
    }
    const fields = { name, expr: { ...draft.expr }, quantity: qty, rotatable: draft.rotatable }
    const r = original
      ? dispatch({ type: 'updatePart', partId: original.id, patch: fields })
      : dispatch({ type: 'addPart', part: { ...fields, finishedDone: false } })
    if (!r.ok) {
      setError(r.message)
      return false
    }
    return true
  }

  const saveAndClose = () => {
    setPadAxis(null)
    if (save()) onClose()
  }

  const requestClose = () => {
    if (dirty && (original || name !== '' || draft.expr.W !== '' || draft.expr.H !== '')) {
      setPadAxis(null)
      setConfirm('discard')
    } else onClose()
  }

  const duplicate = () => {
    if (!original) return
    // 書きかけがあれば先に保存してから写す
    if (dirty && !save()) return
    const r = dispatch({ type: 'duplicatePart', partId: original.id })
    if (!r.ok) {
      setError(r.message)
      return
    }
    if (r.id) onOpenPart(r.id)
  }

  const remove = () => {
    if (!original) return
    const r = dispatch({ type: 'removePart', partId: original.id })
    if (r.ok) onClose()
    else setError(r.message)
  }

  const referencing = original ? partsReferencing(job.parts, original.id) : []

  return (
    <Sheet title={original ? `部材の編集：${partLabel(job, original.id)}` : '部材を追加'} onClose={requestClose}>
      <div className="field">
        <label className="label" htmlFor="part-name">
          名前
        </label>
        <input
          id="part-name"
          className={`input${name !== '' && nameError ? ' bad' : ''}`}
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          value={draft.name}
          placeholder="例：棚板"
          onFocus={() => setPadAxis(null)}
          onChange={(e) => patch({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') closeKeyboard()
          }}
        />
        {name !== '' && nameError && (
          <p className="msg err field-msg" role="alert">
            {nameError}
          </p>
        )}
      </div>

      <section className="fin-group" aria-label="仕上がり寸法">
        <h3 className="fin-head">
          <Help title="仕上がり寸法">
            数値か式を、下のボタンで入れます。ほかの部材の寸法は［部材］で部材名 → W・H の順に選び、逃げ・メラミンなどは［調整寸法］から選びます。木取り寸法は、これに切り代を足した寸法です。
          </Help>
        </h3>
        {AXES.map((axis) => (
          <FormulaInput
            key={axis}
            axis={axis}
            value={draft.expr[axis]}
            onChange={(v) => patch({ expr: { ...draft.expr, [axis]: v } })}
            adjusts={adjusts}
            parts={referableParts(others)}
            finishedOf={finishedOf}
            finished={mine?.finishedByAxis[axis] ?? null}
            errors={mine?.errors.filter((e) => e.axis === axis) ?? []}
            open={padAxis === axis}
            onOpenChange={(o) => setPadAxis(o ? axis : padAxis === axis ? null : padAxis)}
          />
        ))}
      </section>

      <div className="field">
        <Help className="label" title="枚数">
          枚数 0 は切り出さない、寸法だけの行です（例：全体）
        </Help>
        <KeypadField
          label="枚数"
          integer
          unit="枚"
          text={qtyText}
          bad={qtyError !== null}
          onText={(t) => {
            setQtyText(t)
            setError(null)
            setConfirm(null)
          }}
        />
      </div>

      <div className="field">
        <Help className="label" title="回転">
          回転しない：W を板の妻手（短い辺）、H を板の長手（長い辺）に合わせて置きます。回転してよい：W・H を入れ替えて置いてもよい部材です
        </Help>
        <Segmented<Rotate>
          ariaLabel="回転"
          value={draft.rotatable ? 'free' : 'fixed'}
          options={ROTATE_OPTIONS}
          onChange={(v) => patch({ rotatable: v === 'free' })}
        />
      </div>

      {original && (
        <div className="field">
          <Help className="label" title="仕上がりの完了">
            仕上げ終わった部材の印です。印を付けた行は表でグレーになります（木取りの計算には影響しません）。押すとすぐ変わります
          </Help>
          <Segmented<'open' | 'done'>
            ariaLabel="仕上がりの完了"
            value={original.finishedDone ? 'done' : 'open'}
            options={[
              { value: 'open', label: 'まだ' },
              { value: 'done', label: '仕上がった' },
            ]}
            onChange={(v) => {
              const r = dispatch({ type: 'updatePart', partId: original.id, patch: { finishedDone: v === 'done' } })
              if (!r.ok) setError(r.message)
            }}
          />
        </div>
      )}

      {error && (
        <p className="msg err" role="alert">
          {error}
        </p>
      )}

      {confirm === 'discard' ? (
        <div className="confirm-box stack" role="alertdialog" aria-label="閉じるときの確認">
          <p className="confirm-text">変えた内容を保存していません。</p>
          <div className="foot">
            <button type="button" className="btn" onClick={() => setConfirm(null)}>
              編集に戻る
            </button>
            <button type="button" className="btn danger" onClick={onClose}>
              保存せずに閉じる
            </button>
          </div>
          <button type="button" className="btn primary wide" onClick={saveAndClose}>
            保存して閉じる
          </button>
        </div>
      ) : (
        <div className="foot">
          <button type="button" className="btn primary" aria-disabled={blocker !== null} onClick={saveAndClose}>
            {original ? '保存する' : '追加する'}
          </button>
        </div>
      )}

      {original &&
        (confirm === 'delete' ? (
          <div className="confirm-box stack" role="alertdialog" aria-label="部材の削除の確認">
            {referencing.length > 0 && (
              <p className="confirm-text">
                <b>{referencing.map((r) => `${r.name}（${r.axes.join('・')}）`).join('・')}</b>{' '}
                の式がこの部材の寸法を使っています。削除すると、その式はエラーになります。
              </p>
            )}
            <p className="confirm-text">「{partLabel(job, original.id)}」を削除しますか？</p>
            <div className="foot">
              <button type="button" className="btn" onClick={() => setConfirm(null)}>
                やめる
              </button>
              <button type="button" className="btn danger solid" onClick={remove}>
                削除する
              </button>
            </div>
          </div>
        ) : (
          <div className="foot part-sub-actions">
            <button type="button" className="btn" onClick={duplicate}>
              複製
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setPadAxis(null)
                setConfirm('delete')
              }}
            >
              削除
            </button>
          </div>
        ))}
    </Sheet>
  )
}
