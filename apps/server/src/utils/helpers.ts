import type { Context } from 'hono';

export function getClientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || '';
}

export function parsePagination(c: Context, defaults: { page?: number; pageSize?: number; maxPageSize?: number } = {}) {
  const { page: defaultPage = 1, pageSize: defaultPageSize = 20, maxPageSize = 100 } = defaults;
  const page = Math.max(1, parseInt(c.req.query('page') ?? String(defaultPage), 10));
  const pageSize = Math.min(maxPageSize, Math.max(1, parseInt(c.req.query('pageSize') ?? String(defaultPageSize), 10)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function getErrorMessage(e: unknown, fallback: string = 'Operation failed'): string {
  return e instanceof Error ? e.message : fallback;
}

export function formatZodError(error: { issues: { message: string }[] }): string {
  return error.issues.map(i => i.message).join(', ');
}

export function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

export function generateCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(row =>
    columns.map(c => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`)
      .join(',')
  ).join('\n');
  return header + '\n' + body;
}
