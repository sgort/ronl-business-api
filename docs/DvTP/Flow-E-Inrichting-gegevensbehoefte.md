# Flow E - Inrichting gegevensbehoefte

## Bron

De flowchart is afkomstig uit het document dat de Functionele Requirements (FR) voor DvTP (Delen via Toestemming met Private partijen) beschrijft als toetsbaar fundament voor ontwerp, realisatie en beheer van de voorzieningen die toestemming door de burger mogelijk maken in de gegevensuitwisseling tussen publieke en private partijen. De set met functionele requirements is gebaseerd op de use cases uit het Beschrijvend document DvTP v0.2.

## Flowchart

```mermaid
flowchart TB
    %% =========================================================
    %% Flow E — Inrichting gegevensbehoefte
    %% (stapvolgorde op elke pijl)
    %% =========================================================

    %% --- Definities van Stijlen ---
    classDef actor fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef admin fill:#fbe9e7,stroke:#bf360c,stroke-width:2px;
    classDef source fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px;
    classDef system fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef decision fill:#ffffff,stroke:#333333,stroke-width:2px;

    %% --- Subgraphs / Domeinen ---
    subgraph SectorDomain ["1. Sector Domein"]
        SectorRep["Sectorvertegenwoordiger"]:::actor
    end

    subgraph AdminDomain ["2. DvTP Beheer & Governance"]
        Admin(("Beheerder /<br>Functional Manager")):::admin
        Catalog[("<b>Catalogus</b><br>Beschikbare Scopes<br>(FR-32)")]:::system
    end

    subgraph SourceDomain ["3. Brondomein"]
        Bron["Bronhouder / GBO"]:::source
    end

    subgraph LinkDomain ["4. Koppeling naar onboarding"]
        OnboardingFlow["Flow D: Onboarding"]:::system
    end

    %% --- FLOW E: Inrichting Gegevensbehoefte ---

    %% Stap 1: Initiatie
    SectorRep -- "E-01. Indienen gegevensbehoefte<br>(Functionele vraag)" --> Admin

    %% Stap 2: Beleidsmatige validatie
    Admin -- "E-02. Beleidsmatige validatie<br>(Nut, noodzaak, privacy)" --> PolicyCheck{"E-02b. Valide vraag?"}:::decision

    %% Tak 1: Afwijzing
    PolicyCheck -- "E-03a. Nee → Afwijzing" --> Reject["Afwijzing + reden"]:::system
    Reject -- "E-03a.b. Terugkoppeling afwijzing" --> SectorRep

    %% Tak 2: Technische afstemming
    PolicyCheck -- "E-03b. Ja → Technische afstemming" --> TechCheck["Technische afstemming"]:::admin
    TechCheck -- "E-04. Check beschikbaarheid<br>& data-definities" --> Bron
    Bron -- "E-04b. Bevestiging + attribuutspecificaties" --> TechCheck

    %% Stap 4: Vertalen en configureren
    TechCheck -- "E-05. Vertalen naar technische scope (JSON)<br>(FR-32)" --> ConfigAction["Configureren scope"]:::system

    %% Stap 5: Opslaan in catalogus
    ConfigAction -- "E-06. Toevoegen aan catalogus<br>(FR-32)" --> Catalog

    %% Stap 6: Beschikbaarstelling voor onboarding
    Catalog -. "E-07. Beschikbaar voor Flow D<br>(selectie bij onboarding)" .-> OnboardingFlow
```
