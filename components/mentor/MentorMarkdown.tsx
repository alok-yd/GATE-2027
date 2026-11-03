import React from 'react';

interface MentorMarkdownProps {
  content: string;
  className?: string;
}

const renderInline = (value: string, prefix: string): React.ReactNode[] => {
  const tokenPattern = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  const pieces = value.split(tokenPattern);

  return pieces.map((piece, index) => {
    const key = `${prefix}_${index}`;
    if (!piece) return null;
    if ((piece.startsWith('**') && piece.endsWith('**')) || (piece.startsWith('__') && piece.endsWith('__'))) {
      return <strong key={key} className="font-bold">{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith('`') && piece.endsWith('`')) {
      return (
        <code key={key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-indigo-700">
          {piece.slice(1, -1)}
        </code>
      );
    }
    if (piece.startsWith('~~') && piece.endsWith('~~')) {
      return <del key={key}>{piece.slice(2, -2)}</del>;
    }
    if (
      (piece.startsWith('*') && piece.endsWith('*')) ||
      (piece.startsWith('_') && piece.endsWith('_'))
    ) {
      return <em key={key}>{piece.slice(1, -1)}</em>;
    }
    return <React.Fragment key={key}>{piece}</React.Fragment>;
  });
};

const isTableDivider = (line: string) =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

const splitTableRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

const isBullet = (line: string) => /^\s*[-*+]\s+/.test(line);
const isNumbered = (line: string) => /^\s*\d+[.)]\s+/.test(line);

export const MentorMarkdown: React.FC<MentorMarkdownProps> = ({ content, className = '' }) => {
  const lines = (content || '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const language = line.replace(/^\s*```/, '').trim();
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !/^\s*```/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <div key={`code_${blocks.length}`} className="my-3 overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
          {language && (
            <div className="border-b border-slate-700 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {language}
            </div>
          )}
          <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-slate-100">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      continue;
    }

    const heading = line.match(/^\s*(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].replace(/\s+#+\s*$/, '');
      const headingClass =
        level === 1
          ? 'mt-4 text-xl font-extrabold'
          : level === 2
            ? 'mt-4 text-lg font-extrabold'
            : level === 3
              ? 'mt-3 text-base font-bold'
              : 'mt-3 text-sm font-bold';
      blocks.push(
        <h3 key={`heading_${blocks.length}`} className={`${headingClass} text-slate-900 first:mt-0`}>
          {renderInline(text, `h_${blocks.length}`)}
        </h3>
      );
      index += 1;
      continue;
    }

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      blocks.push(<hr key={`hr_${blocks.length}`} className="my-3 border-slate-200" />);
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote_${blocks.length}`} className="my-2 border-l-4 border-indigo-300 pl-3 text-slate-600">
          {quoteLines.map((quote, quoteIndex) => (
            <p key={quoteIndex}>{renderInline(quote, `q_${blocks.length}_${quoteIndex}`)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (
      index + 1 < lines.length &&
      line.includes('|') &&
      isTableDivider(lines[index + 1])
    ) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push(
        <div key={`table_${blocks.length}`} className="my-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-slate-100 text-slate-800">
              <tr>
                {headers.map((header, headerIndex) => (
                  <th key={headerIndex} className="border-b border-slate-200 px-3 py-2 font-bold">
                    {renderInline(header, `th_${blocks.length}_${headerIndex}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 ? 'bg-white' : 'bg-slate-50'}>
                  {headers.map((_, cellIndex) => (
                    <td key={cellIndex} className="border-t border-slate-100 px-3 py-2 align-top text-slate-700">
                      {renderInline(row[cellIndex] || '', `td_${blocks.length}_${rowIndex}_${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (isBullet(line) || isNumbered(line)) {
      const ordered = isNumbered(line);
      const items: string[] = [];
      while (index < lines.length && (ordered ? isNumbered(lines[index]) : isBullet(lines[index]))) {
        items.push(lines[index].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, ''));
        index += 1;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag
          key={`list_${blocks.length}`}
          className={`my-2 space-y-1 pl-5 text-sm ${ordered ? 'list-decimal' : 'list-disc'}`}
        >
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item, `li_${blocks.length}_${itemIndex}`)}</li>
          ))}
        </ListTag>
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^\s*```/.test(lines[index]) &&
      !/^\s*#{1,4}\s+/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !isBullet(lines[index]) &&
      !isNumbered(lines[index]) &&
      !/^\s*(---+|___+|\*\*\*+)\s*$/.test(lines[index]) &&
      !(index + 1 < lines.length && lines[index].includes('|') && isTableDivider(lines[index + 1]))
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={`p_${blocks.length}`} className="my-2 whitespace-pre-wrap text-sm leading-6 text-inherit first:mt-0 last:mb-0">
        {renderInline(paragraph.join('\n'), `p_${blocks.length}`)}
      </p>
    );
  }

  return <div className={`mentor-markdown min-w-0 break-words ${className}`}>{blocks}</div>;
};

export default MentorMarkdown;
