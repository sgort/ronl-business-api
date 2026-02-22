import React from 'react';
import type { PersonState, TimelineConfig } from '../types/brp.types';

interface PersonalDataPanelProps {
  personState: PersonState | null;
  config: TimelineConfig;
}

export const PersonalDataPanel: React.FC<PersonalDataPanelProps> = ({ personState }) => {
  if (!personState) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <p className="text-gray-500 text-center">Geen gegevens beschikbaar voor deze datum</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">
      {/* Person Section */}
      <div>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <span>👤</span>
          <span>Persoonsgegevens</span>
        </h2>
        <div className="space-y-2 text-sm">
          <div>
            <span className="font-semibold">Naam:</span>{' '}
            <span>{personState.naam.volledigeNaam}</span>
          </div>
          <div>
            <span className="font-semibold">BSN:</span>{' '}
            <span>{personState.burgerservicenummer}</span>
          </div>
          <div>
            <span className="font-semibold">Leeftijd:</span>{' '}
            <span>{personState.leeftijd} jaar</span>
          </div>
          <div>
            <span className="font-semibold">Geboren:</span>{' '}
            <span>{personState.geboorte.datum.langFormaat}</span>
          </div>
          <div>
            <span className="font-semibold">Geboorteplaats:</span>{' '}
            <span>{personState.geboorte.plaats.omschrijving}</span>
          </div>
        </div>
      </div>

      {/* Partner Section */}
      {personState.partners && personState.partners.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>💍</span>
            <span>Partner</span>
          </h2>
          {personState.partners.map((partner, idx) => (
            <div key={idx} className="space-y-2 text-sm">
              <div>
                <span className="font-semibold">Naam:</span>{' '}
                <span>
                  {partner.naam.voornamen} {partner.naam.geslachtsnaam}
                </span>
              </div>
              <div>
                <span className="font-semibold">BSN:</span>{' '}
                <span>{partner.burgerservicenummer}</span>
              </div>
              <div>
                <span className="font-semibold">Verbintenis:</span>{' '}
                <span>{partner.soortVerbintenis.omschrijving}</span>
              </div>
              <div>
                <span className="font-semibold">Getrouwd op:</span>{' '}
                <span>{partner.aangaanHuwelijkPartnerschap.datum.langFormaat}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Children Section */}
      {personState.kinderen && personState.kinderen.length > 0 && (
        <div>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>👶</span>
            <span>Kinderen ({personState.kinderen.length})</span>
          </h2>
          <div className="space-y-4">
            {personState.kinderen.map((kind, idx) => (
              <div key={idx} className="pl-4 border-l-2 border-gray-200">
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="font-semibold">Naam:</span>{' '}
                    <span>
                      {kind.naam.voornamen} {kind.naam.geslachtsnaam}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold">BSN:</span>{' '}
                    <span>{kind.burgerservicenummer}</span>
                  </div>
                  {kind.leeftijd !== undefined && (
                    <div>
                      <span className="font-semibold">Leeftijd:</span>{' '}
                      <span>{kind.leeftijd} jaar</span>
                    </div>
                  )}
                  <div>
                    <span className="font-semibold">Geboren:</span>{' '}
                    <span>{kind.geboorte.datum.langFormaat}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
