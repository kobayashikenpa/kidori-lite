// 仕事の画面（仕様書 10）：保存した仕事の一覧（名前・最後に変えた日・部材の数。新しい順）、
// 新しく作る・開く・名前を変える・コピー・削除（画面の中で確認）。kidori の JobsScreen.tsx をもとにしたもの
import { useState, type FormEvent } from 'react'
import type { Job } from '../../engine/types'
import { defaultJobName } from '../../store/jobs'
import { useJobStore } from '../../store/useJobStore'
import { Help } from '../components/Help'
import { jobMeta, sortJobsNewestFirst } from '../jobList'

/** 一覧の1件で、いま何をしているか */
type Mode = { kind: 'rename'; jobId: string } | { kind: 'delete'; jobId: string } | null

export function JobsScreen({ onOpened }: { onOpened: () => void }) {
  const { data, state, dispatch } = useJobStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [mode, setMode] = useState<Mode>(null)
  const [renameText, setRenameText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const jobs = sortJobsNewestFirst(data.jobs)

  const reset = () => {
    setMode(null)
    setError(null)
    setNotice(null)
  }

  const open = (id: string) => {
    if (dispatch({ type: 'openJob', id }).ok) onOpened()
  }

  const startCreate = () => {
    reset()
    setNewName(defaultJobName(new Date()))
    setCreating(true)
  }

  const create = (e: FormEvent) => {
    e.preventDefault()
    const r = dispatch({ type: 'createJob', name: newName, open: true })
    if (!r.ok) {
      setError(r.message)
      return
    }
    setCreating(false)
    setNewName('')
    onOpened()
  }

  const startRename = (job: Job) => {
    reset()
    setCreating(false)
    setRenameText(job.name)
    setMode({ kind: 'rename', jobId: job.id })
  }

  const submitRename = (e: FormEvent, jobId: string) => {
    e.preventDefault()
    const r = dispatch({ type: 'renameJob', jobId, name: renameText })
    if (!r.ok) {
      setError(r.message)
      return
    }
    reset()
  }

  const copy = (job: Job) => {
    reset()
    const r = dispatch({ type: 'copyJob', jobId: job.id })
    if (!r.ok) {
      setError(r.message)
      return
    }
    const made = r.state.data.jobs.find((j) => j.id === r.id)
    setNotice(`「${made?.name ?? ''}」を作りました。一番上に出ています`)
  }

  const remove = (job: Job) => {
    const r = dispatch({ type: 'deleteJob', jobId: job.id })
    reset()
    if (r.ok) setNotice(`「${job.name}」を消しました`)
  }

  return (
    <section>
      <h2>
        <Help title="仕事">
          仕事は1回の木取りの入力のまとまり（設定と部材）です。このスマホの中に自動で保存されます。新しい仕事はいつも初めの設定から始まり、コピーした仕事は元の設定を引き継ぎます。
        </Help>
      </h2>

      {creating ? (
        <form className="card stack" onSubmit={create}>
          <div className="field">
            <label className="label" htmlFor="new-job-name">
              新しい仕事の名前
            </label>
            <input
              id="new-job-name"
              className="input"
              value={newName}
              enterKeyHint="done"
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          {error && <p className="msg err">{error}</p>}
          <div className="foot">
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              やめる
            </button>
            <button type="submit" className="btn primary">
              作って開く
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn primary wide" onClick={startCreate}>
          ＋ 新しい仕事を作る
        </button>
      )}

      {notice && (
        <p className="msg ok banner" role="status">
          {notice}
        </p>
      )}

      <h3>保存した仕事（{jobs.length}件）</h3>
      {jobs.length === 0 && <p className="lead">まだ仕事がありません。上の「＋ 新しい仕事を作る」から始めてください。</p>}
      <div className="stack">
        {jobs.map((job) => {
          const isOpen = job.id === state.currentJobId
          const renaming = mode?.kind === 'rename' && mode.jobId === job.id
          const deleting = mode?.kind === 'delete' && mode.jobId === job.id
          return (
            <div key={job.id} className={`card job-item${isOpen ? ' open' : ''}`}>
              <div className="job-head">
                <span className="job-name">{job.name}</span>
                {isOpen && <span className="chip ok">開いている</span>}
              </div>
              <p className="job-meta">
                {jobMeta(job)}
              </p>

              {renaming ? (
                <form className="stack" onSubmit={(e) => submitRename(e, job.id)}>
                  <div className="field">
                    <label className="label" htmlFor={`rename-${job.id}`}>
                      新しい名前
                    </label>
                    <input
                      id={`rename-${job.id}`}
                      className={`input${error ? ' bad' : ''}`}
                      value={renameText}
                      enterKeyHint="done"
                      onChange={(e) => {
                        setRenameText(e.target.value)
                        setError(null)
                      }}
                    />
                  </div>
                  {error && <p className="msg err">{error}</p>}
                  <div className="foot">
                    <button type="button" className="btn" onClick={reset}>
                      やめる
                    </button>
                    <button type="submit" className="btn primary">
                      名前を決める
                    </button>
                  </div>
                </form>
              ) : deleting ? (
                <div className="stack confirm-box" role="alert">
                  <p style={{ margin: 0 }}>
                    「{job.name}」を消しますか？{isOpen && 'いま開いている仕事です。'}設定と部材の入力もすべて消えます。
                    <strong>元に戻せません。</strong>
                  </p>
                  <div className="foot">
                    <button type="button" className="btn" onClick={reset}>
                      やめる
                    </button>
                    <button type="button" className="btn danger solid" onClick={() => remove(job)}>
                      消す
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button type="button" className="btn primary wide" onClick={() => open(job.id)}>
                    {isOpen ? '続きを開く' : '開く'}
                  </button>
                  <div className="job-actions">
                    <button type="button" className="btn" onClick={() => startRename(job)}>
                      名前を変える
                    </button>
                    <button type="button" className="btn" onClick={() => copy(job)}>
                      コピー
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      onClick={() => {
                        reset()
                        setMode({ kind: 'delete', jobId: job.id })
                      }}
                    >
                      削除
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
