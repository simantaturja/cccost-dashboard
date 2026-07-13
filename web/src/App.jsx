import { useEffect, useState } from 'react';
import TabNav from './components/TabNav.jsx';
import Tiles from './components/Tiles.jsx';
import DailyChart from './components/DailyChart.jsx';
import ReportControl from './components/ReportControl.jsx';
import ClientsTable from './components/ClientsTable.jsx';
import ProjectsTable from './components/ProjectsTable.jsx';
import ModelsTable from './components/ModelsTable.jsx';
import AdvisorTable from './components/AdvisorTable.jsx';
import SessionsTable from './components/SessionsTable.jsx';
import Diagnostics from './components/Diagnostics.jsx';

const TABS = ['overview', 'breakdown', 'advisor', 'sessions'];

function currentTab() {
  const h = window.location.hash.slice(1);
  return TABS.includes(h) ? h : 'overview';
}

export default function App() {
  const [tab, setTab] = useState(currentTab());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onHash = () => setTab(currentTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    fetch('/api/data')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="app">
      <header className="masthead">
        <h1>
          <span className="mark" aria-hidden="true" />
          Claude Code Cost Dashboard
        </h1>
        {data && (
          <span className="stamp">
            generated {new Date(data.generatedAt).toLocaleString()}
          </span>
        )}
      </header>

      <TabNav tabs={TABS} active={tab} />

      {error && <div className="empty">Could not load data: {error}</div>}
      {!error && !data && <div className="empty">Loading usage data…</div>}

      {data && (
        <>
          {tab === 'overview' && (
            <>
              <Tiles summary={data.summary} roi={data.roi} />
              <h2 className="section-label">Daily spend — last 90 days</h2>
              <DailyChart daily={data.daily} />
              <h2 className="section-label">By client</h2>
              <ReportControl monthly={data.monthly} />
              <ClientsTable
                rows={data.byClient}
                monthly={data.monthly}
                totalCost={data.summary.totalCostUSD}
              />
            </>
          )}

          {tab === 'breakdown' && (
            <>
              <h2 className="section-label">By project</h2>
              <ProjectsTable rows={data.byProject} totalCost={data.summary.totalCostUSD} />
              <h2 className="section-label">By model</h2>
              <ModelsTable rows={data.byModel} totalCost={data.summary.totalCostUSD} />
            </>
          )}

          {tab === 'advisor' && (
            <>
              <h2 className="section-label">Efficiency advisor</h2>
              <AdvisorTable rows={data.advisor} />
            </>
          )}

          {tab === 'sessions' && (
            <>
              <h2 className="section-label">Sessions</h2>
              <SessionsTable sessions={data.sessions} />
            </>
          )}

          <Diagnostics summary={data.summary} generatedAt={data.generatedAt} />
        </>
      )}
    </div>
  );
}
