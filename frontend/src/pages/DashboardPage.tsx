const statusCards = [
  { label: 'Active Entry Points', value: '4' },
  { label: 'Today Check-ins', value: '128' },
  { label: 'Pending Reviews', value: '7' },
];

export function DashboardPage() {
  return (
    <section className="page-stack" aria-labelledby="dashboard-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1 id="dashboard-title">Dashboard</h1>
        </div>
      </header>

      <div className="metric-grid">
        {statusCards.map((card) => (
          <article className="metric-card" key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <section className="content-panel" aria-labelledby="activity-title">
        <div>
          <p className="eyebrow">Live Readiness</p>
          <h2 id="activity-title">Eingress Dashboard</h2>
        </div>
        <p></p>
      </section>
    </section>
  );
}
