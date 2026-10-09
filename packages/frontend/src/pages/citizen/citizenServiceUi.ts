import type { CitizenServiceId } from '@ronl/shared';

/**
 * How each citizen service looks as a card. Which services a citizen gets,
 * and where they land, is the registry's (CITIZEN_SERVICES in @ronl/shared)
 * and GET /v1/process/available's; this is only the face (#344).
 */
export const CITIZEN_SERVICE_UI: Record<
  CitizenServiceId,
  { label: string; description: string; icon: string }
> = {
  zorgtoeslag: {
    label: 'Zorgtoeslag',
    description: 'Bereken uw recht op zorgtoeslag op basis van inkomen en persoonlijke situatie.',
    icon: '💊',
  },
  vergunningen: {
    label: 'Vergunningen',
    description: 'Vraag vergunningen aan voor bouw, verbouw of evenementen.',
    icon: '📋',
  },
  subsidies: {
    label: 'Subsidies',
    description: 'Overzicht van beschikbare subsidies voor uw situatie.',
    icon: '💶',
  },
  heusdenpas: {
    label: 'Heusdenpas',
    description: 'Vraag de Heusdenpas en het Kindpakket aan bij een laag inkomen.',
    icon: '🎟️',
  },
};
