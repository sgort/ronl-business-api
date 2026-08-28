// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotificatiesSection from './NotificatiesSection';

describe('NotificatiesSection', () => {
  it('renders the title, all three notification properties, and the flow diagram', () => {
    render(<NotificatiesSection />);

    expect(screen.getByRole('heading', { name: 'Notificaties' })).toBeInTheDocument();
    expect(screen.getByText('Team · Persoonlijk')).toBeInTheDocument();
    expect(screen.getByText('Dossier')).toBeInTheDocument();
    expect(screen.getByText('🔔 Volgen')).toBeInTheDocument();
    expect(screen.getByText('notifications.service · computeNotifications')).toBeInTheDocument();
  });
});
