/**
 * Daily views as bars. Server-rendered, no chart library. The data is also available as a table
 * (visually hidden) so screen-reader users get exact numbers. Heights are relative to the busiest day in the range.
 */
export function DailyBars({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <figure className="bars">
      <div className="bars__plot" aria-hidden="true">
        {data.map((d) => (
          <span key={d.date} className="bars__col" title={`${d.date}: ${d.count}`}>
            <span className="bars__bar" style={{ height: `${d.count === 0 ? 0 : Math.max(3, Math.round((d.count / max) * 100))}%` }} />
          </span>
        ))}
      </div>
      <div className="bars__axis" aria-hidden="true"><span>{data[0]?.date}</span><span>{data[data.length - 1]?.date}</span></div>
      <figcaption className="muted">Views per day (UTC). Tallest day: {max === 1 && data.every((d) => d.count === 0) ? "none" : max}.</figcaption>
      <table className="visually-hidden">
        <caption>Views per day</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Views</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.date}><th scope="row">{d.date}</th><td>{d.count}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
