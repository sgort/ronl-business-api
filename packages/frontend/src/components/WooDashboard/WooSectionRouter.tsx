import type { WooTabId } from '../../pages/woo/modes.config';
import { wooFilterRows, type WooFilters, type WooRegisterRow } from '../../pages/woo/woo.data';
import { WOO_REGISTER } from '../../pages/woo/woo.data';
import Overzicht from './Overzicht';
import Verzoeken from './Verzoeken';
import Tijdigheid from './Tijdigheid';
import Proces from './Proces';
import Publicatie from './Publicatie';
import Bezwaar from './Bezwaar';
import Register from './Register';

interface Props {
  tab: WooTabId;
  registerOpen: boolean;
  filters: WooFilters;
  onResetFilters: () => void;
}

export default function WooSectionRouter({ tab, registerOpen, filters, onResetFilters }: Props) {
  if (registerOpen) {
    const rows: WooRegisterRow[] = wooFilterRows(WOO_REGISTER, filters);
    return <Register rows={rows} filters={filters} onReset={onResetFilters} />;
  }
  if (tab === 'overzicht') return <Overzicht />;
  if (tab === 'verzoeken') return <Verzoeken />;
  if (tab === 'tijdigheid') return <Tijdigheid />;
  if (tab === 'proces') return <Proces />;
  if (tab === 'publicatie') return <Publicatie />;
  return <Bezwaar />;
}
