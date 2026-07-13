export default function Diagnostics({ summary, generatedAt }) {
  return (
    <p className="footnote">
      Plan multiple is API-equivalent value, not billing ·{' '}
      {summary.malformedLines} malformed lines skipped ·{' '}
      {summary.unknownModelMessages} messages with unknown model priced at $0 ·{' '}
      generated {new Date(generatedAt).toLocaleString()}
    </p>
  );
}
