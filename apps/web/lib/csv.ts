interface CsvColumn {
  key: string;
  label: string;
  transform?: (value: unknown) => string;
}

export function downloadCsv(rows: any[], columns: CsvColumn[], filename: string) {
  const header = columns.map(c => c.label).join(',');
  const body = rows.map((row: Record<string, unknown>) =>
    columns.map(c => {
      const val = c.transform ? c.transform(row[c.key]) : String(row[c.key] ?? '');
      return `"${val.replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\n');
  const csv = '\uFEFF' + header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
