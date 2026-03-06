# Flow D - Onboarden Private Dienstverlener

## Bron

De flowchart is afkomstig uit het document dat de Functionele Requirements (FR) voor DvTP (Delen via Toestemming met Private partijen) beschrijft als toetsbaar fundament voor ontwerp, realisatie en beheer van de voorzieningen die toestemming door de burger mogelijk maken in de gegevensuitwisseling tussen publieke en private partijen. De set met functionele requirements is gebaseerd op de use cases uit het Beschrijvend document DvTP v0.2.

## Flowchart

```mermaid
flowchart TB
    %% =========================================================
    %% Flow D — Onboarden Private Dienstverlener
    %% (stapvolgorde op elke pijl)
    %% =========================================================

    %% --- Definities van Stijlen ---
    classDef actor fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef auth fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,stroke-dasharray: 5 5;
    classDef system fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef admin fill:#fbe9e7,stroke:#bf360c,stroke-width:2px;
    classDef decision fill:#ffffff,stroke:#333333,stroke-width:2px;

    %% --- Subgraphs / Domeinen ---
    subgraph PrivateDomain ["1. Private Domein"]
        PD["Private Dienstverlener"]:::actor
    end

    subgraph AuthDomain ["2. Authenticatie"]
        eHerk{{"eHerkenning<br>(FR-03)"}}:::auth
    end

    subgraph AdminDomain ["3. DvTP Beheeromgeving"]
        BeheerPortal["<b>Beheerportaal</b><br>(FR-29)"]:::system
        Poortwachter(("Beheerder /<br>Poortwachter")):::admin
        ConfigDB[("<b>Configuratie Database</b><br>(Aansluitprofiel / whitelists)")]:::system
    end

    %% --- FLOW D: Onboarding ---

    %% Stap 1: Start + Authenticatie
    PD -- "D-01. Start aanmelding (FR-29)" --> BeheerPortal
    BeheerPortal -- "D-02. Authenticatie (FR-03)" --> eHerk
    eHerk -- "D-02b. Identiteit bevestigd (FR-03)" --> BeheerPortal

    %% Stap 2: Indienen aanvraag
    PD -- "D-03. Upload bewijsstukken<br>& selecteer gegevensbehoefte" --> BeheerPortal
    BeheerPortal -- "D-04. Validatieverzoek naar poortwachter" --> Poortwachter

    %% Stap 3: Toetsing (Poortwachter)
    Poortwachter -- "D-05. Toetsing criteria & sectorafspraken<br>(FR-30/32)" --> Decision{"Voldoet aan<br>voorwaarden?<br>(FR-30/32)"}:::decision

    %% Tak 1: Afwijzing
    Decision -- "D-06a. Nee → Afwijzing + reden" --> Reject["Afwijzen aanvraag"]:::system
    Reject -- "D-06a.b. Terugkoppeling afwijzing" --> PD

    %% Tak 2: Goedkeuring + technische intake
    Decision -- "D-06b. Ja → Goedkeuring + start technische intake" --> TechSetup["Technische intake / inrichting"]:::system

    %% Certificaatregistratie
    PD -- "D-06c. Upload publieke sleutel<br>PKI-aansluitcertificaat (FR-33)" --> TechSetup

    %% Opslag configuratie (inputs voor Flow A en B)
    TechSetup -- "D-07. Opslaan aansluitprofiel:<br>- Status 'Vertrouwd' (FR-30)<br>- Scope (FR-32)<br>- Delegatie-flag (FR-02)<br>- Certificaat whitelist (FR-33/34)" --> ConfigDB

    %% Bevestiging + instructies
    ConfigDB -- "D-08. Bevestiging & technische instructies" --> PD

    %% Koppeling naar werking (informational link)
    ConfigDB -. "D-09. Config voedt Flow A (routering)<br>& Flow B (runtime-certificaatcheck)" .-> BeheerPortal
```
