// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditSection from './AuditSection';
import type { AuditLogRecord } from '../../services/api';

const mockBusinessApi = vi.hoisted(() => ({
  admin: { auditLogs: vi.fn() },
}));
vi.mock('../../services/api', () => ({ businessApi: mockBusinessApi }));

const adminUser = { sub: '1', roles: ['admin'] } as never;

function makeLog(overrides: Partial<AuditLogRecord> = {}): AuditLogRecord {
  return {
    id: 1,
    timestamp: '2026-07-01T10:00:00Z',
    tenant_id: 'almere',
    user_id: 'abcdef1234567890',
    action: 'process.start',
    resource_type: null,
    resource_id: null,
    details: null,
    result: 'success',
    error_message: null,
    request_id: null,
    ...overrides,
  };
}

function page(
  items: AuditLogRecord[],
  overrides: Partial<{ total: number; hasMore: boolean }> = {}
) {
  return {
    success: true,
    data: {
      items,
      pagination: {
        limit: 50,
        offset: 0,
        total: overrides.total ?? items.length,
        hasMore: overrides.hasMore ?? false,
      },
    },
  };
}

beforeEach(() => {
  mockBusinessApi.admin.auditLogs.mockResolvedValue(page([]));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuditSection', () => {
  it('shows an access-restricted panel for a non-admin user and never fetches the audit log', () => {
    render(<AuditSection activeTab="audit-overzicht" user={{ sub: '1', roles: [] } as never} />);
    expect(screen.getByText('Toegang beperkt')).toBeInTheDocument();
    expect(mockBusinessApi.admin.auditLogs).not.toHaveBeenCalled();
  });

  it('does not fetch the audit log for a user with no roles at all', () => {
    render(<AuditSection activeTab="audit-overzicht" user={null} />);
    expect(screen.getByText('Toegang beperkt')).toBeInTheDocument();
    expect(mockBusinessApi.admin.auditLogs).not.toHaveBeenCalled();
  });

  it('starts fetching once a user gains the admin role after mount', async () => {
    mockBusinessApi.admin.auditLogs.mockResolvedValue(page([makeLog()]));
    const { rerender } = render(
      <AuditSection activeTab="audit-overzicht" user={{ sub: '1', roles: [] } as never} />
    );
    expect(mockBusinessApi.admin.auditLogs).not.toHaveBeenCalled();

    rerender(<AuditSection activeTab="audit-overzicht" user={adminUser} />);

    expect(await screen.findByText('almere')).toBeInTheDocument();
  });

  it('audit-overzicht renders a row with tenant, truncated user id, action, and result', async () => {
    mockBusinessApi.admin.auditLogs.mockResolvedValue(page([makeLog()]));
    render(<AuditSection activeTab="audit-overzicht" user={adminUser} />);

    expect(await screen.findByText('almere')).toBeInTheDocument();
    expect(screen.getByText('abcdef12…')).toBeInTheDocument();
    expect(screen.getByText('process.start')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
  });

  it('audit-details renders the details dl, or an em dash when there are none', async () => {
    mockBusinessApi.admin.auditLogs.mockResolvedValue(
      page([makeLog({ id: 1, details: { processKey: 'pk1' } }), makeLog({ id: 2, details: null })])
    );
    render(<AuditSection activeTab="audit-details" user={adminUser} />);

    expect(await screen.findByText('processKey')).toBeInTheDocument();
    expect(screen.getByText('pk1')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows an error state and "Opnieuw proberen" retries the load', async () => {
    mockBusinessApi.admin.auditLogs.mockResolvedValue({ success: false });
    const user = userEvent.setup();
    render(<AuditSection activeTab="audit-overzicht" user={adminUser} />);

    expect(await screen.findByText('Auditlog kon niet worden geladen.')).toBeInTheDocument();

    mockBusinessApi.admin.auditLogs.mockResolvedValue(page([makeLog()]));
    await user.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

    expect(await screen.findByText('almere')).toBeInTheDocument();
  });

  it('"Meer laden" loads the next page with an offset and appends rows', async () => {
    mockBusinessApi.admin.auditLogs.mockResolvedValue(
      page([makeLog({ id: 1, action: 'first' })], { total: 2, hasMore: true })
    );
    const user = userEvent.setup();
    render(<AuditSection activeTab="audit-overzicht" user={adminUser} />);

    await screen.findByText('first');
    mockBusinessApi.admin.auditLogs.mockResolvedValue(
      page([makeLog({ id: 2, action: 'second' })], { total: 2, hasMore: false })
    );
    await user.click(screen.getByRole('button', { name: 'Meer laden' }));

    expect(mockBusinessApi.admin.auditLogs).toHaveBeenLastCalledWith(50, 50);
    expect(await screen.findByText('second')).toBeInTheDocument();
    expect(screen.getByText('first')).toBeInTheDocument();
  });

  it('"Vernieuwen" reloads from offset 0', async () => {
    render(<AuditSection activeTab="audit-overzicht" user={adminUser} />);
    await screen.findByText('0 records in totaal');

    const user = userEvent.setup();
    mockBusinessApi.admin.auditLogs.mockClear();
    await user.click(screen.getByRole('button', { name: 'Vernieuwen' }));

    expect(mockBusinessApi.admin.auditLogs).toHaveBeenCalledWith(50, 0);
  });
});
