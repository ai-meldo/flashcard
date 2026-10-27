// CSV format for one pile:
//   line 1      pile title
//   line 2..n   front,back   (comma or semicolon; detected automatically)
// Fields containing a delimiter, a quote or a line break are wrapped in "double quotes",
// and a quote inside a quoted field is written twice ("").

const DELIMITERS = [',', ';']; // order matters: comma wins a tie

function normalise(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function splitRows(text, delimiter) {
  const rows = [];
  let fields = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
    } else if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
    } else if (ch === delimiter) {
      fields.push(field);
      field = '';
    } else if (ch === '\n') {
      fields.push(field);
      rows.push({ line: rowLine, fields });
      fields = [];
      field = '';
      line++;
      rowLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== '' || fields.length) {
    fields.push(field);
    rows.push({ line: rowLine, fields });
  }
  return { rows, unclosedAt: inQuotes ? rowLine : null };
}

// Trim every field, drop trailing empty fields (e.g. "a,b," from Excel), drop blank lines.
function cleanRows(rows) {
  return rows
    .map((r) => {
      const fields = r.fields.map((f) => f.trim());
      while (fields.length && fields[fields.length - 1] === '') fields.pop();
      return { line: r.line, fields };
    })
    .filter((r) => r.fields.length);
}

const isCard = (row) => row.fields.length === 2 && row.fields[0] !== '' && row.fields[1] !== '';

/**
 * Parse one pile from CSV text.
 * Returns { title, cards: [{front, back}], skipped: [{line, text}], delimiter }.
 * title is '' when the first line already looks like a card (caller picks a fallback).
 */
export function parsePile(text) {
  const src = normalise(text);

  let best = null;
  for (const delimiter of DELIMITERS) {
    const { rows, unclosedAt } = splitRows(src, delimiter);
    const cleaned = cleanRows(rows);
    const score = cleaned.filter(isCard).length;
    if (!best || score > best.score) best = { delimiter, rows: cleaned, score, unclosedAt };
  }

  const { delimiter, rows, unclosedAt } = best;
  if (!rows.length) throw new Error('The file is empty.');
  if (unclosedAt) throw new Error(`Line ${unclosedAt}: a quote (") is opened but never closed.`);

  let title = '';
  let cardRows = rows;
  if (!isCard(rows[0])) {
    title = rows[0].fields.filter(Boolean).join(`${delimiter} `);
    cardRows = rows.slice(1);
  }

  const cards = [];
  const skipped = [];
  for (const row of cardRows) {
    if (isCard(row)) cards.push({ front: row.fields[0], back: row.fields[1] });
    else skipped.push({ line: row.line, text: row.fields.join(delimiter) });
  }
  return { title, cards, skipped, delimiter };
}

// Quote both delimiters so a file stays unambiguous whichever one a reader expects.
const NEEDS_QUOTES = /[",;\n]/;
const toField = (value) => (NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Serialise one pile in the same format parsePile reads. */
export function serializePile(title, cards, delimiter = ',') {
  const lines = [toField(title), ...cards.map((c) => toField(c.front) + delimiter + toField(c.back))];
  return lines.join('\n') + '\n';
}

export function fileNameFor(title) {
  const safe = title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').trim();
  return `${safe || 'pile'}.csv`;
}
