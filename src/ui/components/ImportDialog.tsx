// ファイルから取り込むときの確認（仕様書 15.3・15.4）。共有：1つの仕事／バックアップ：仕事の数と名前。
// kidori の ui/components/ImportDialog.tsx を参考にしたもの
import type { TransferRead } from '../../engine/transfer/read'
import { importSummary } from '../transferView'
import { Sheet } from './Sheet'

interface Props {
  read: Extract<TransferRead, { ok: true }>
  /** 保存を止めているときは取り込めない */
  canSave: boolean
  onImport: () => void
  onCancel: () => void
}

export function ImportDialog({ read, canSave, onImport, onCancel }: Props) {
  const s = importSummary(read)
  return (
    <Sheet title="ファイルから取り込む" onClose={onCancel}>
      <div className="stack">
        <p className="import-title">{s.title}</p>
        {s.names.length > 0 && (
          <ul className="import-names">
            {s.names.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
            {s.rest > 0 && <li className="import-rest">ほか {s.rest}件</li>}
          </ul>
        )}
        <p className="lead" style={{ margin: 0 }}>
          今の仕事は変わりません。コピーとして新しい仕事に足します
        </p>
        {!canSave && <p className="msg err">保存できない状態なので取り込めません</p>}
        <div className="foot">
          <button type="button" className="btn" onClick={onCancel}>
            やめる
          </button>
          <button type="button" className="btn primary" disabled={!canSave} onClick={onImport}>
            {s.action}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
