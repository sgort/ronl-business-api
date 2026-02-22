import { brpApi } from './brp.api';
import type { BRPEvent, BRPPersonHistoricalData, PersonState } from '../types/brp.types';

/**
 * Calculate historical person state at a specific date
 * This simulates what the person's data would have looked like at that point in time
 */
export function calculateHistoricalState(
  currentState: PersonState,
  targetDate: Date
): PersonState | null {
  const birthDate = new Date(currentState.geboorte.datum.datum);

  // Person not born yet
  if (targetDate < birthDate) {
    return null;
  }

  // Calculate age at target date
  const age = Math.floor(
    (targetDate.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
  );

  // Start with basic person data
  const historicalState: PersonState = {
    ...currentState,
    leeftijd: age,
  };

  // Filter partners based on marriage date
  if (currentState.partners && currentState.partners.length > 0) {
    historicalState.partners = currentState.partners.filter((partner) => {
      const marriageDate = new Date(partner.aangaanHuwelijkPartnerschap.datum.datum);
      return targetDate >= marriageDate;
    });

    // If no partners at this date, remove the field
    if (historicalState.partners.length === 0) {
      delete historicalState.partners;
    }
  }

  // Filter children based on birth date and update their ages
  if (currentState.kinderen && currentState.kinderen.length > 0) {
    historicalState.kinderen = currentState.kinderen
      .filter((kind) => {
        const childBirthDate = new Date(kind.geboorte.datum.datum);
        return targetDate >= childBirthDate;
      })
      .map((kind) => {
        const childBirthDate = new Date(kind.geboorte.datum.datum);
        const childAge = Math.floor(
          (targetDate.getTime() - childBirthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
        );
        return {
          ...kind,
          leeftijd: childAge >= 0 ? childAge : undefined,
        };
      });

    // If no children at this date, remove the field
    if (historicalState.kinderen.length === 0) {
      delete historicalState.kinderen;
    }
  }

  return historicalState;
}

/**
 * Extract life events from current person state
 */
export function extractEvents(personState: PersonState): BRPEvent[] {
  const events: BRPEvent[] = [];

  // Birth event
  events.push({
    id: 'birth',
    type: 'birth',
    date: new Date(personState.geboorte.datum.datum),
    label: 'Geboren',
    description: `Geboorte ${personState.naam.volledigeNaam || personState.naam.voornamen}`,
  });

  // Marriage events
  if (personState.partners) {
    personState.partners.forEach((partner, idx) => {
      const marriageDate = new Date(partner.aangaanHuwelijkPartnerschap.datum.datum);
      events.push({
        id: `marriage-${idx}`,
        type: 'marriage',
        date: marriageDate,
        label: 'Getrouwd',
        description: `Huwelijk met ${partner.naam.voornamen} ${partner.naam.geslachtsnaam}`,
      });
    });
  }

  // Children birth events
  if (personState.kinderen && personState.kinderen.length > 0) {
    // Group children by birth date
    const childrenByDate = new Map<string, typeof personState.kinderen>();

    personState.kinderen.forEach((kind) => {
      const dateKey = kind.geboorte.datum.datum;
      if (!childrenByDate.has(dateKey)) {
        childrenByDate.set(dateKey, []);
      }
      childrenByDate.get(dateKey)!.push(kind);
    });

    // Create events for each birth date
    childrenByDate.forEach((children, dateKey) => {
      const birthDate = new Date(dateKey);

      if (children.length === 1) {
        // Single child
        const kind = children[0];
        events.push({
          id: `child-birth-${kind.burgerservicenummer}`,
          type: 'birth',
          date: birthDate,
          label: 'Kind geboren',
          description: `Geboorte ${kind.naam.voornamen} ${kind.naam.geslachtsnaam}`,
        });
      } else {
        // Multiple children on same date (twins, triplets, etc.)
        const names = children.map((k) => k.naam.voornamen).join(', ');
        const count =
          children.length === 2
            ? 'tweeling'
            : children.length === 3
              ? 'drieling'
              : `${children.length}-ling`;
        events.push({
          id: `child-birth-${dateKey}`,
          type: 'birth',
          date: birthDate,
          label: `Kinderen geboren (${count})`,
          description: `Geboorte ${names}`,
        });
      }
    });
  }

  // Sort events chronologically
  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Fetch person data and generate historical timeline
 */
export async function getPersonTimeline(bsn: string): Promise<BRPPersonHistoricalData | null> {
  try {
    // Fetch current person data from API
    const currentState = await brpApi.getPersonByBSN(bsn);

    if (!currentState) {
      return null;
    }

    // Extract events from current state
    const events = extractEvents(currentState);

    // Determine timeline boundaries
    const birthDate = new Date(currentState.geboorte.datum.datum);
    const today = new Date();

    // Start 2 years before birth
    const earliestDate = new Date(birthDate);
    earliestDate.setFullYear(earliestDate.getFullYear() - 2);

    // Allow future dates (for "what if" scenarios)
    const futureDate = new Date(today);
    futureDate.setFullYear(futureDate.getFullYear() + 10);

    return {
      bsn,
      events,
      earliestDate, // Now starts 2 years before birth
      latestDate: futureDate,
      currentState,
    };
  } catch (error) {
    console.error('Failed to generate person timeline:', error);
    return null;
  }
}

/**
 * Get historical state for a specific date
 */
export async function getHistoricalStateForDate(
  bsn: string,
  targetDate: Date
): Promise<PersonState | null> {
  try {
    const currentState = await brpApi.getPersonByBSN(bsn);

    if (!currentState) {
      return null;
    }

    return calculateHistoricalState(currentState, targetDate);
  } catch (error) {
    console.error('Failed to get historical state:', error);
    return null;
  }
}
