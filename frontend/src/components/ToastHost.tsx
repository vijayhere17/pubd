import { useToast } from '../store/toast'

export function ToastHost() {
  const { toasts, remove } = useToast()
  return (
    <div className="fixed right-4 top-4 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-fade-up rounded-xl border px-4 py-3 text-sm shadow-xl ${
            t.type === 'success'
              ? 'border-emerald-400/30 bg-emerald-950/90 text-emerald-100'
              : t.type === 'error'
                ? 'border-rose-400/30 bg-rose-950/90 text-rose-100'
                : 'border-[rgba(217,169,79,0.3)] bg-[#0d1730]/95 text-[#eef2fa]'
          }`}
          onClick={() => remove(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
