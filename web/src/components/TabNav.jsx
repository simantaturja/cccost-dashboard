const LABELS = {
  overview: 'Overview',
  breakdown: 'Breakdown',
  advisor: 'Advisor',
  sessions: 'Sessions',
};

export default function TabNav({ tabs, active }) {
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <button
          key={t}
          className={'tab' + (t === active ? ' is-active' : '')}
          aria-current={t === active ? 'page' : undefined}
          onClick={() => {
            window.location.hash = t;
          }}
        >
          {LABELS[t]}
        </button>
      ))}
    </nav>
  );
}
