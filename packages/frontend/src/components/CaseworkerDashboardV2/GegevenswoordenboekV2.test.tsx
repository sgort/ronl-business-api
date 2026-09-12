// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GegevenswoordenboekV2 from './GegevenswoordenboekV2';

const BASE = 'https://skosmos.open-regels.nl/ronl';

describe('GegevenswoordenboekV2', () => {
  it('defaults the iframe to the NL base vocabulary URL', () => {
    const { container } = render(<GegevenswoordenboekV2 />);
    expect(container.querySelector('iframe')).toHaveAttribute('src', `${BASE}/nl/?embed=1`);
  });

  it('submitting a search term navigates the iframe to the encoded search URL', async () => {
    const user = userEvent.setup();
    const { container } = render(<GegevenswoordenboekV2 />);

    await user.type(screen.getByLabelText('Zoek in woordenboek'), 'zorg toeslag');
    await user.click(screen.getByRole('button', { name: 'Zoeken' }));

    expect(container.querySelector('iframe')).toHaveAttribute(
      'src',
      `${BASE}/nl/search?clang=nl&q=zorg%20toeslag&embed=1`
    );
  });

  it('submitting an empty search resets to the base URL', async () => {
    const user = userEvent.setup();
    const { container } = render(<GegevenswoordenboekV2 />);

    await user.type(screen.getByLabelText('Zoek in woordenboek'), '   ');
    await user.click(screen.getByRole('button', { name: 'Zoeken' }));

    expect(container.querySelector('iframe')).toHaveAttribute('src', `${BASE}/nl/?embed=1`);
  });

  it('switching language preserves the current search term', async () => {
    const user = userEvent.setup();
    const { container } = render(<GegevenswoordenboekV2 />);

    await user.type(screen.getByLabelText('Zoek in woordenboek'), 'permit');
    await user.click(screen.getByRole('button', { name: 'Zoeken' }));
    await user.click(screen.getByRole('button', { name: 'EN' }));

    expect(container.querySelector('iframe')).toHaveAttribute(
      'src',
      `${BASE}/en/search?clang=en&q=permit&embed=1`
    );
  });

  it("switching language with no active search goes to that language's base URL", async () => {
    const user = userEvent.setup();
    const { container } = render(<GegevenswoordenboekV2 />);

    await user.click(screen.getByRole('button', { name: 'EN' }));

    expect(container.querySelector('iframe')).toHaveAttribute('src', `${BASE}/en/?embed=1`);
  });

  it('the "open in new tab" link strips the embed query flag', () => {
    render(<GegevenswoordenboekV2 />);
    expect(screen.getByTitle('Open in nieuw tabblad')).toHaveAttribute('href', `${BASE}/nl/`);
  });
});
