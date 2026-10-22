// 仕事の画面（仕様書 10）：保存した仕事の一覧（名前・最後に変えた日・部材の数。新しい順）、
// 新しく作る・開く・名前を変える・コピー・削除（画面の中で確認）。kidori の JobsScreen.tsx をもとにしたもの。
// 共有とバックアップ（仕様書 15.3・15.4）：この仕事を送る・バックアップを書き出す・ファイルから取り込む
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { backupFileName, buildBackupFile } from '../../engine/transfer/backup'
import { MAX_TRANSFER_SIZE, READ_FAILED } from '../../engine/transfer/envelope'
import { importTransfer } from '../../engine/transfer/importFile'
import { readTransferFile, type TransferRead } from '../../engine/transfer/read'
import { buildJobFile, jobFileName } from '../../engine/transfer/share'
import type { Job } from '../../engine/types'
import { defaultJobName, newId } from '../../store/jobs'
import { useJobStore } from '../../store/useJobStore'
import { Help } from '../components/Help'
import { ImportDialog } from '../components/ImportDialog'
import { jobMeta, sortJobsNewestFirst } from '../jobList'
import { jsonFile, shareFile } from '../platform/shareSheet'
import { MAKE_FAILED, shareResultText } from '../transferView'

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
  /** 送る・書き出す・取り込むの知らせ。jobId があればその仕事の「この仕事を送る」の下、無ければ下の「共有とバックアップ」に出す */
  const [transferMsg, setTransferMsg] = useState<{ ok: boolean; text: string; jobId?: string } | null>(null)
  /** 読めたファイル（確認の画面を出している間） */
  const [pending, setPending] = useState<Extract<TransferRead, { ok: true }> | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const jobs = sortJobsNewestFirst(data.jobs)

  const reset = () => {
    setMode(null)
    setError(null)
    setNotice(null)
    setTransferMsg(null)
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

  /** この仕事を送る。共有シートを開けるよう、ファイルは押した操作の中で同期に作る */
  const send = (job: Job) => {
    reset()
    const file = jsonFile(buildJobFile(job, data.adjusts), jobFileName(job))
    if (!file) {
      setTransferMsg({ ok: false, text: MAKE_FAILED, jobId: job.id })
      return
    }
    void shareFile(file, job.name).then((r) => {
      const m = shareResultText(r, 'job')
      if (m) setTransferMsg({ ...m, jobId: job.id })
    })
  }

  /** バックアップを書き出す（全部の仕事と調整寸法）。送るときと同じく、ファイルは押した操作の中で作る */
  const exportBackup = () => {
    reset()
    const file = jsonFile(buildBackupFile(data), backupFileName(new Date()))
    if (!file) {
      setTransferMsg({ ok: false, text: MAKE_FAILED })
      return
    }
    void shareFile(file, 'kidori-lite のバックアップ').then((r) => {
      const m = shareResultText(r, 'backup')
      if (m) setTransferMsg(m)
    })
  }

  /** ファイルを選んだ：読んで確認を出す。読めなければ知らせるだけ（今のデータは変えない） */
  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    // 同じファイルをもう一度選べるよう、値を毎回空に戻す
    input.value = ''
    if (!file) return
    reset()
    const fail = () => setTransferMsg({ ok: false, text: READ_FAILED })
    if (file.size > MAX_TRANSFER_SIZE) {
      fail()
      return
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      fail()
      return
    }
    const r = readTransferFile(text)
    if (r.ok) setPending(r)
    else setTransferMsg({ ok: false, text: r.message })
  }

  /** 確認の「取り込む」「追加する」：今のデータに足して保存する。開いている仕事は変えない */
  const importPending = () => {
    const r = pending
    setPending(null)
    if (!r || !state.canSave) return
    try {
      const out = importTransfer(data, r.file, newId, new Date())
      const d = dispatch({ type: 'replaceData', data: out.data })
      setTransferMsg(d.ok ? { ok: true, text: out.message } : { ok: false, text: d.message })
    } catch {
      setTransferMsg({ ok: false, text: READ_FAILED })
    }
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
                  <button type="button" className="btn wide" onClick={() => send(job)}>
                    この仕事を送る
                  </button>
                  {transferMsg?.jobId === job.id && <TransferMessage msg={transferMsg} />}
                </>
              )}
            </div>
          )
        })}
      </div>

      <h3>
        <Help title="共有とバックアップ">
          「この仕事を送る」は、その仕事（設定・部材と、式で使っている調整寸法）を1つのファイルにして、LINE・メール・AirDrop などで送ります。切り出しチェックと仕上がりの完了は外して送ります。
          「バックアップを書き出す」は、全部の仕事と調整寸法を1つのファイルにします（「ファイル」に保存しておく、新しいスマホに移すなど）。
          「ファイルから取り込む」で、受け取ったファイルやバックアップのファイルを選ぶと、コピーとして仕事に足します（今の仕事は変わりません）。
          ファイルを持っている人は、誰でも中身を見られます。
        </Help>
      </h3>
      <div className="stack">
        <button type="button" className="btn wide" onClick={exportBackup}>
          バックアップを書き出す
        </button>
        <button type="button" className="btn wide" onClick={() => fileInput.current?.click()}>
          ファイルから取り込む
        </button>
        {/* accept は付けない（iPhone で .json が選べないことがあるため。kidori と同じ。中身で判断する） */}
        <input
          ref={fileInput}
          type="file"
          aria-label="取り込むファイル"
          style={{ display: 'none' }}
          onChange={(e) => void pickFile(e)}
        />
        {transferMsg && transferMsg.jobId === undefined && <TransferMessage msg={transferMsg} />}
      </div>

      {pending && (
        <ImportDialog read={pending} canSave={state.canSave} onImport={importPending} onCancel={() => setPending(null)} />
      )}
    </section>
  )
}

function TransferMessage({ msg }: { msg: { ok: boolean; text: string } }) {
  return (
    <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role={msg.ok ? 'status' : 'alert'} style={{ margin: 0 }}>
      {msg.text}
    </p>
  )
}
