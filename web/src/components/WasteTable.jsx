import { shortProject } from '../format.js';

// Exact counts only — token usage is per-message, not per-tool-block, so there
// is no honest per-tool dollar figure to show here.
export default function WasteTable({ rows }) {
  if (!rows || (!rows.erroredToolCalls && !rows.redundantReads)) {
    return <div className="empty">No repeated waste detected.</div>;
  }

  return (
    <>
      <p className="waste-summary">
        {rows.erroredToolCalls.toLocaleString('en-US')} errored tool calls ·{' '}
        {rows.redundantReads.toLocaleString('en-US')} redundant file reads across{' '}
        {rows.duplicateFileCount.toLocaleString('en-US')} file
        {rows.duplicateFileCount === 1 ? '' : 's'}. Counts only — no cost estimate,
        since token usage is logged per message, not per tool call.
      </p>

      {rows.erroredByTool.length > 0 && (
        <>
          <h2 className="section-label">Errored tool calls by tool</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th className="num">Errors</th>
                </tr>
              </thead>
              <tbody>
                {rows.erroredByTool.map((t) => (
                  <tr key={t.name}>
                    <td>{t.name}</td>
                    <td className="num">{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows.topDuplicateFiles.length > 0 && (
        <>
          <h2 className="section-label">Most re-read files</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th className="num">Redundant reads</th>
                </tr>
              </thead>
              <tbody>
                {rows.topDuplicateFiles.map((f) => (
                  <tr key={f.path}>
                    <td title={f.path}>{shortProject(f.path)}</td>
                    <td className="num">{f.extraReads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows.byProject.length > 0 && (
        <>
          <h2 className="section-label">By project</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="num">Errored calls</th>
                  <th className="num">Redundant reads</th>
                </tr>
              </thead>
              <tbody>
                {rows.byProject.map((p) => (
                  <tr key={p.project}>
                    <td title={p.project}>{shortProject(p.project)}</td>
                    <td className="num">{p.erroredToolCalls}</td>
                    <td className="num">{p.redundantReads}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
