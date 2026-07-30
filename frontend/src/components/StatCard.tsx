type Props = { label: string; value: string; delay?: number }

export function StatCard({ label, value, delay = 0 }: Props) {
  return (
    <article
      className="glass animate-fade-up rounded-2xl p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <small className="text-xs uppercase tracking-[0.14em] text-[#7c879f]">{label}</small>
      <div className="animate-count mt-2 text-2xl font-semibold text-[#f6e3aa]">{value}</div>
    </article>
  )
}
