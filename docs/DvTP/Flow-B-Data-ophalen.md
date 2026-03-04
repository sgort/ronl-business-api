# Flow A - Toestemming geven

## Bron

De flowchart is afkomstig uit het document dat de Functionele Requirements (FR) voor DvTP (Delen via Toestemming met Private partijen) beschrijft als toetsbaar fundament voor ontwerp, realisatie en beheer van de voorzieningen die toestemming door de burger mogelijk maken in de gegevensuitwisseling tussen publieke en private partijen. De set met functionele requirements is gebaseerd op de use cases uit het Beschrijvend document DvTP v0.2.

## Flowchart

```mermaid
flowchart TB
    %% =========================================================
    %% Flow B — Data ophalen (stapvolgorde op elke pijl)
    %% =========================================================

    %% --- Definities van Stijlen ---
    classDef actor fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef private fill:#e0f7fa,stroke:#006064,stroke-width:2px;
    classDef auth fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,stroke-dasharray: 5 5;
    classDef system fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef source fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px;
    classDef decision fill:#fff,stroke:#333,stroke-width:2px;

    %% --- Subgraphs / Domeinen ---
    subgraph UserDomain ["1. Gebruikersdomein"]
        Burger(("Burger")):::actor
        PD_App["Private Dienstverlener<br>(App/Website)"]:::private
        Integrator["Integrator<br>(Doorgeefluik FR-18)"]:::private
    end

    subgraph TrustDomain ["2. Vertrouwen"]
        TrustProv{{"Vertrouwens-<br>leverancier<br>(FR-16)"}}:::auth
    end

    subgraph SystemDomain ["3. De GBO-DvTP-voorziening"]
        AuthService["<b>Autorisatievoorziening</b><br>(Poortwachter)"]:::system
        ConsentDB[("<b>Register</b><br>Validatie Consent<br>(FR-17)")]:::system
    end

    subgraph SourceDomain ["4. Brondomein"]
        GBO["Gemeenschappelijke<br>Bronontsluiting<br>(FR-28)"]:::source
        Bron["<b>Bronhouder</b><br>+ Zegel (FR-27)"]:::source
    end

    %% --- FLOW B: Gegevens Ophalen ---

    %% Stap 1: Tokenverwerving (buiten DvTP-core, maar voorwaardelijk)
    PD_App -- "B-01. Haal Token (FR-16)" --> TrustProv
    TrustProv -- "B-02. Lever Auth Token (FR-16)" --> PD_App

    %% Stap 2: Request starten (met toestemmingstoken/bewijs)
    PD_App -- "B-03. Data Request + Token (FR-17)" --> Integrator
    Integrator -- "B-04. Doorgeven Request (FR-18)" --> AuthService

    %% Stap 3: Validatie (token, scope, geldigheid, match met register)
    AuthService -- "B-05. Verifieer Token & Scope (FR-17)" --> ConsentDB
    ConsentDB -- "B-06. Lever Consent-record / status (FR-17)" --> AuthService
    AuthService -- "B-07. Beslis: geldige toestemming? (FR-17)" --> CheckValid{"Geldig?<br>(FR-17)"}:::decision

    %% Tak: Ongeldig / verlopen / mismatch
    CheckValid -- "B-08a. Nee / Verlopen" --> Reject["Weiger toegang"]:::system
    Reject -- "B-09a. Reject-respons naar Integrator" --> Integrator
    Integrator -- "B-10a. Reject-respons naar PD" --> PD_App

    %% Tak: Geldig -> data ophalen
    CheckValid -- "B-08b. Ja" --> FetchGBO["Haal data op"]:::system
    FetchGBO -- "B-09b. Request naar GBO (FR-28)" --> GBO

    %% Stap 4: Broninteractie + bronverificatie
    GBO -- "B-10b. Haal data op bij Bron (FR-26)" --> Bron
    Bron -- "B-11. Data + Zegel (FR-27)" --> GBO

    %% Stap 5: Teruglevering (end-to-end beveiligd, integrator als doorgeefluik)
    GBO -- "B-12. Versleuteld antwoord" --> AuthService
    AuthService -- "B-13. Versleuteld antwoord" --> Integrator
    Integrator -- "B-14. Doorgeven (FR-18)" --> PD_App

    %% Stap 6: Verificatie / feedback door burger
    PD_App -- "B-15. Verificatie (FR-19)" --> Burger
```
