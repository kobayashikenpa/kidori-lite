// 仕事の画面（U-03 で一覧・名前の変更・コピー・削除を作る）
import { useJobStore } from '../../store/useJobStore'
import { Help } from '../components/Help'

export function JobsScreen({ onOpened }: { onOpened: () => void }) {
  const { dispatch } = useJobStore()
  return (
    <section>
      <h2>
        <Help title="仕事">仕事はこのスマホの中に保存されます。</Help>
      </h2>
      <button
        type="button"
        className="btn primary wide"
        onClick={() => {
          if (dispatch({ type: 'createJob' }).ok) onOpened()
        }}
      >
        ＋ 新しい仕事を作る
      </button>
    </section>
  )
}
