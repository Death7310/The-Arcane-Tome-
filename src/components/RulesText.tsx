import { Fragment, type ReactNode } from 'react';

/**
 * Renders rules text written in light Markdown (as the SRD and most rules documents are):
 * paragraphs, ***bold italic*** run-in headings, **bold**, *italic*, bullet lists and
 * simple | tables |. Built from React elements, never raw HTML, so imported text can't
 * inject markup.
 */
export function RulesText(props: { text: string; className?: string }) {
  const blocks = props.text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  return (
    <div className={['rules-text', props.className].filter(Boolean).join(' ')}>
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim());
        if (!lines.length) return null;
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        if (lines.length > 1 && lines.every((l) => l.trim().startsWith('|'))) {
          const rows = lines.filter((l) => !/^\s*\|[\s:|-]+\|\s*$/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
          return (
            <div className="table-wrap" key={i}>
              <table>
                <tbody>
                  {rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((cell, k) => (j === 0 ? <th key={k}>{inline(cell)}</th> : <td key={k}>{inline(cell)}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** ***x***, **x** and *x* (or _x_) inside a line. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(
      <b key={k++}>
        <i>{m[1]}</i>
      </b>,
    );
    else if (m[2]) out.push(<b key={k++}>{m[2]}</b>);
    else out.push(<i key={k++}>{m[3] ?? m[4]}</i>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
