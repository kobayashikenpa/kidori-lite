// 調整寸法の一覧と追加（仕様書 4.1）。設定の中に置く。調整寸法はアプリ全体で1つの一覧。
// 一覧は1行ずつ 表示名・編集・削除。一括削除は「選んで削除」→ チェック → まとめて削除。
// 追加は名前を［逃げ］［ほぞ］［自由入力］から選び、寸法を数字キーで入れて「追加」。
// 名前・寸法の変更と削除は、使っている仕事があれば「◯件の仕事で使っています」と仕事と部材を示して確認する。
// kidori の NigeEditor.tsx・SettingsList.tsx を参考に作り直したもの
import { usableAdjusts } from '../../engine/adjusts'
import { useState } from 'react'
import { adjustName } from '../../engine/defaults'
import { adjustUsages, adjustUsagesOf, type AdjustUsage } from '../../engine/formula/usages'
import { exactText } from '../../engine/round'
import type { Adjust } from '../../engine/types'
import { validateAdjust, type AdjustDraft } from '../../store/jobs'
import { useJobStore } from '../../store/useJobStore'
import { parseNum } from '../format'
import { closeKeyboard } from '../keyboard'
import { ADJUST_PRESETS, groupUsages } from '../settings'
import { KeypadField } from './KeypadField'

type Mode =
  | { kind: 'list' }
  | { kind: 'edit'; id: string }
  /** 変更の確認（使っている仕事があるとき） */
  | { kind: 'editConfirm'; id: string; draft: AdjustDraft }
  | { kind: 'remove'; id: string }
  | { kind: 'select' }
  | { kind: 'selectConfirm' }

export function AdjustList() {
  const { data, dispatch } = useJobStore()
  const adjusts = usableAdjusts(data.adjusts)
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // 消えた調整寸法は選んだものから外す（並びは一覧の順）
  const chosen = adjusts.filter((a) => selected.includes(a.id)).map((a) => a.id)
  const selecting = mode.kind === 'select' || mode.kind === 'selectConfirm'

  const toList = () => {
    setMode({ kind: 'list' })
    setError(null)
  }
  const stopSelect = () => {
    setSelected([])
    toList()
  }

  const update = (id: string, draft: AdjustDraft): string | null => {
    const r = dispatch({ type: 'updateAdjust', adjustId: id, ...draft })
    if (!r.ok) return r.message
    toList()
    return null
  }

  /** 編集の「変える」。使っている仕事があれば先に確認する */
  const submitEdit = (a: Adjust, draft: AdjustDraft): string | null => {
    if (draft.name === a.name && draft.value === a.value) {
      toList()
      return null
    }
    if (adjustUsages(data, a.id).length > 0) {
      setMode({ kind: 'editConfirm', id: a.id, draft })
      return null
    }
    return update(a.id, draft)
  }

  const remove = (ids: string[]) => {
    const r = dispatch({ type: 'removeAdjusts', adjustIds: ids })
    if (!r.ok) {
      setError(r.message)
      return
    }
    setSelected([])
    toList()
  }

  const row = (a: Adjust) => {
    const name = adjustName(a)
    if (selecting) {
      const on = chosen.includes(a.id)
      return (
        <button
          key={a.id}
          type="button"
          role="checkbox"
          aria-checked={on}
          className={`adjust-row adjust-check${on ? ' on' : ''}`}
          onClick={() => {
            setMode({ kind: 'select' })
            setSelected((cur) => (cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id]))
          }}
        >
          <span className="check-box" aria-hidden="true">
            {on ? '✓' : ''}
          </span>
          <span className="adjust-name">{name}</span>
        </button>
      )
    }
    if (mode.kind === 'edit' && mode.id === a.id) {
      return (
        <div key={a.id} className="adjust-box" aria-label={`${name} を編集`}>
          <AdjustForm
            adjusts={adjusts}
            initial={a}
            submitLabel="変える"
            onSubmit={(d) => submitEdit(a, d)}
            onCancel={toList}
          />
        </div>
      )
    }
    if (mode.kind === 'editConfirm' && mode.id === a.id) {
      const usages = adjustUsages(data, a.id)
      const after = adjustName(mode.draft)
      return (
        <div key={a.id} className="adjust-box confirm-box stack" role="alertdialog" aria-label={`${name} の変更の確認`}>
          <UsageNotice usages={usages} />
          <p className="confirm-text">
            「{name}」を「{after}」に変えますか？使っている式の表示と値も変わります。
          </p>
          {error && <p className="msg err">{error}</p>}
          <div className="foot">
            <button type="button" className="btn" onClick={() => setMode({ kind: 'edit', id: a.id })}>
              やめる
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const err = update(a.id, mode.draft)
                if (err) setError(err)
              }}
            >
              変える
            </button>
          </div>
        </div>
      )
    }
    if (mode.kind === 'remove' && mode.id === a.id) {
      const usages = adjustUsages(data, a.id)
      return (
        <div key={a.id} className="adjust-box confirm-box stack" role="alertdialog" aria-label={`${name} の削除の確認`}>
          {usages.length > 0 && <UsageNotice usages={usages} />}
          <p className="confirm-text">
            「{name}」を削除しますか？
            {usages.length > 0 && '使っている式は「削除した調整寸法」のエラーになります。'}
          </p>
          {error && <p className="msg err">{error}</p>}
          <div className="foot">
            <button type="button" className="btn" onClick={toList}>
              やめる
            </button>
            <button type="button" className="btn danger solid" onClick={() => remove([a.id])}>
              削除する
            </button>
          </div>
        </div>
      )
    }
    return (
      <div key={a.id} className="adjust-row">
        <span className="adjust-name">{name}</span>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            closeKeyboard()
            setError(null)
            setMode({ kind: 'edit', id: a.id })
          }}
        >
          編集
        </button>
        <button
          type="button"
          className="btn small danger"
          onClick={() => {
            setError(null)
            setMode({ kind: 'remove', id: a.id })
          }}
        >
          削除
        </button>
      </div>
    )
  }

  const bulkUsages = mode.kind === 'selectConfirm' ? adjustUsagesOf(data, chosen) : []

  return (
    <div className="stack adjust-list" role="group" aria-label="調整寸法の一覧">
      {adjusts.length === 0 && <p className="lead adjust-empty">調整寸法がまだありません。</p>}
      {selecting && <p className="lead adjust-empty">削除する調整寸法を選んでください（いくつでも選べます）。</p>}
      {adjusts.length > 0 && <div className="adjust-rows">{adjusts.map(row)}</div>}

      {selecting ? (
        mode.kind === 'selectConfirm' && chosen.length > 0 ? (
          <div className="adjust-box confirm-box stack" role="alertdialog" aria-label="選んだ調整寸法の削除の確認">
            {bulkUsages.length > 0 && <UsageNotice usages={bulkUsages} adjusts={adjusts} />}
            <p className="confirm-text">
              選んだ{chosen.length}件（{adjusts.filter((a) => chosen.includes(a.id)).map(adjustName).join('・')}）を削除しますか？
              {bulkUsages.length > 0 && '使っている式は「削除した調整寸法」のエラーになります。'}
            </p>
            {error && <p className="msg err">{error}</p>}
            <div className="foot">
              <button type="button" className="btn" onClick={() => setMode({ kind: 'select' })}>
                やめる
              </button>
              <button type="button" className="btn danger solid" onClick={() => remove(chosen)}>
                削除する
              </button>
            </div>
          </div>
        ) : (
          <div className="foot">
            <button type="button" className="btn" onClick={stopSelect}>
              やめる
            </button>
            <button
              type="button"
              className="btn danger solid"
              disabled={chosen.length === 0}
              onClick={() => setMode({ kind: 'selectConfirm' })}
            >
              選んだ{chosen.length}件を削除
            </button>
          </div>
        )
      ) : (
        <>
          {adjusts.length > 0 && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                setSelected([])
                setError(null)
                setMode({ kind: 'select' })
              }}
            >
              選んで削除
            </button>
          )}
          <div className="adjust-box stack" aria-label="調整寸法を追加">
            <span className="label adjust-add-title">調整寸法を追加</span>
            <AdjustForm
              key={adjusts.length}
              adjusts={adjusts}
              initial={null}
              submitLabel="追加"
              onSubmit={(d) => {
                const r = dispatch({ type: 'addAdjust', ...d })
                return r.ok ? null : r.message
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}

/** 「◯件の仕事で使っています」と、仕事ごとの部材（adjusts を渡すと、部材ごとに使っている調整寸法も） */
function UsageNotice({ usages, adjusts }: { usages: readonly (AdjustUsage & { adjustIds?: string[] })[]; adjusts?: readonly Adjust[] }) {
  const groups = groupUsages(usages, adjusts)
  return (
    <div className="usage">
      <p className="usage-head">{groups.length}件の仕事で使っています</p>
      <ul className="usage-list">
        {groups.map((g) => (
          <li key={g.jobId}>
            <span className="usage-job">{g.jobName}</span>：{g.parts.join('、')}
          </li>
        ))}
      </ul>
    </div>
  )
}

type NameChoice = (typeof ADJUST_PRESETS)[number] | 'free'

function initialChoice(a: Adjust | null): NameChoice | null {
  if (!a) return null
  return (ADJUST_PRESETS as readonly string[]).includes(a.name) ? (a.name as NameChoice) : 'free'
}

/**
 * 調整寸法の名前と寸法の入力（追加・編集で共通）。名前か寸法が空、表示名が重なるときは押せない。
 * onSubmit がだめな理由を返したら出す。追加のあとは呼ぶ側が key を替えて空に戻す
 */
function AdjustForm({
  adjusts,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  adjusts: readonly Adjust[]
  initial: Adjust | null
  submitLabel: string
  onSubmit: (draft: AdjustDraft) => string | null
  onCancel?: () => void
}) {
  const [choice, setChoice] = useState<NameChoice | null>(initialChoice(initial))
  const [freeName, setFreeName] = useState(initial && initialChoice(initial) === 'free' ? initial.name : '')
  const [text, setText] = useState(initial ? exactText(initial.value) : '')
  const [error, setError] = useState<string | null>(null)

  const name = choice === null ? '' : choice === 'free' ? freeName.trim() : choice
  const value = parseNum(text)
  // 押せないときの理由（空のときは理由を出さず、ボタンを押せなくするだけ）
  let problem: string | null = null
  let quiet = false
  if (name === '' || value === null) quiet = true
  else if (Number.isNaN(value) || value <= 0) problem = '寸法は 0 より大きい数を入れてください'
  else problem = validateAdjust(adjusts, { name, value }, initial?.id)
  const canSubmit = !quiet && problem === null
  const shown = error ?? problem

  const submit = () => {
    if (!canSubmit || value === null) return
    closeKeyboard()
    const err = onSubmit({ name, value })
    setError(err)
  }

  const pick = (c: NameChoice) => {
    setChoice(c)
    setError(null)
  }

  return (
    <div className="stack adjust-form">
      <div className="field">
        <span className="label">名前</span>
        <div className="seg" role="group" aria-label="名前">
          {ADJUST_PRESETS.map((p) => (
            <button key={p} type="button" aria-pressed={choice === p} onClick={() => pick(p)}>
              {p}
            </button>
          ))}
          <button type="button" aria-pressed={choice === 'free'} onClick={() => pick('free')}>
            自由入力
          </button>
        </div>
        {choice === 'free' && (
          <input
            className="input"
            aria-label="名前（自由入力）"
            value={freeName}
            placeholder="例：メラミン"
            enterKeyHint="done"
            onChange={(e) => {
              setFreeName(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') closeKeyboard()
            }}
          />
        )}
      </div>
      <div className="field">
        <span className="label">寸法</span>
        <KeypadField
          label="寸法"
          text={text}
          placeholder="例：1"
          bad={value !== null && (Number.isNaN(value) || value <= 0)}
          onText={(t) => {
            setText(t)
            setError(null)
          }}
        />
      </div>
      {!quiet && name !== '' && value !== null && !Number.isNaN(value) && value > 0 && (
        <p className="adjust-preview">
          表示：<strong>{adjustName({ name, value })}</strong>
        </p>
      )}
      {shown && (
        <p className="msg err" role="alert">
          {shown}
        </p>
      )}
      <div className="foot">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            やめる
          </button>
        )}
        <button type="button" className="btn primary" disabled={!canSubmit} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
