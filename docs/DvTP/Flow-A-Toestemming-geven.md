# Flow A - Toestemming geven

## Bron

De flowchart is afkomstig uit het document dat de Functionele Requirements (FR) voor DvTP (Delen via Toestemming met Private partijen) beschrijft als toetsbaar fundament voor ontwerp, realisatie en beheer van de voorzieningen die toestemming door de burger mogelijk maken in de gegevensuitwisseling tussen publieke en private partijen. De set met functionele requirements is gebaseerd op de use cases uit het Beschrijvend document DvTP v0.2.

## Flowchart

```mermaid
flowchart TB
    %% ============================
    %% Flow A — Toestemming geven
    %% ============================

    %% --- Definities van Stijlen ---
    classDef actor fill:#e1f5fe,stroke:#01579b,stroke-width:2px;
    classDef private fill:#e0f7fa,stroke:#006064,stroke-width:2px;
    classDef auth fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,stroke-dasharray: 5 5;
    classDef system fill:#fff3e0,stroke:#e65100,stroke-width:2px;
    classDef decision fill:#ffffff,stroke:#333333,stroke-width:2px;

    %% --- Subgraphs / Domeinen ---
    subgraph UserDomain ["1. Gebruikersdomein"]
        Burger(("Burger")):::actor
        PD_App["Private Dienstverlener<br>(App/Website)<br>(FR-12/15)"]:::private
    end

    subgraph AuthDomain ["2. Authenticatie"]
        DigiD{{"DigiD<br>(FR-01)"}}:::auth
        Machtiging{{"Machtigingen<br>Register"}}:::auth
    end

    subgraph SystemDomain ["3. De GBO-DvTP-voorziening"]
        Portal["<b>Toestemmingsportaal</b><br>(FR-04: Overheidsdomein)"]:::system
        ConfigDB[("<b>Configuratie</b><br>(FR-30/32)<br>Dienst- & aansluitinstellingen")]:::system
        ConsentDB[("<b>Register</b><br>(FR-09/11)<br>Opslag Consent + TTL")]:::system
    end

    %% --- FLOW A: Toestemming Geven ---

    Burger -- "A-01. Start Flow (FR-12)" --> PD_App

    PD_App -- "A-02. Redirect met Context (FR-13/14)" --> Portal

    Portal -- "A-03. Lees dienst-/aansluitconfig (FR-30/32)" --> ConfigDB
    ConfigDB -- "A-04. Config retour (FR-30/32)" --> Portal

    Portal -- "A-05. Validatie initiator/return-URL (FR-30)" --> CheckInitiator{"Is initiator/return-URL toegestaan?<br>(FR-30)"}:::decision

    CheckInitiator -- "A-06a. Nee → Weiger (FR-30)" --> RejectInit["Weiger / toon melding<br>(FR-30)"]:::system
    RejectInit -- "A-07a. Return naar PD (FR-14)" --> PD_App

    CheckInitiator -- "A-06b. Ja → Start authenticatie (FR-01)" --> DigiD

    DigiD -. "A-07b. Raadpleeg machtiging" .-> Machtiging
    DigiD -- "A-08. Auth-resultaat + machtigingsinfo" --> Portal

    Portal -- "A-09. Delegatiecheck starten (FR-02)" --> CheckDelegation{"Machtiging gedetecteerd<br>EN delegatie uitgesloten?<br>(FR-02)"}:::decision

    CheckDelegation -- "A-10a. Ja (Geblokkeerd)" --> ErrorDeleg["Toon foutmelding<br>(FR-02: Feedback)"]:::system
    ErrorDeleg -- "A-11a. Return naar PD (FR-14)" --> PD_App

    CheckDelegation -- "A-10b. Nee (Toegestaan)" --> InfoScreen["Pre-consent scherm:<br>Scope/Doel/Partijen/Integrator/TTL<br>(FR-05/06/07)"]:::system

    InfoScreen -- "A-11b. Force to Read (FR-08)" --> GateAck["Bevestiging gelezen/begrepen"]:::system

    GateAck -- "A-12. Vraag akkoord (FR-10/09)" --> UserDecision{"Akkoord?<br>Binair (FR-10)<br>Specifiek (FR-09)"}:::decision

    UserDecision -- "A-13a. Nee → Geen consent" --> CancelFlow["Geen consent<br>(weiger/annuleer)"]:::system
    CancelFlow -- "A-14a. Return naar PD (FR-14)" --> PD_App

    UserDecision -- "A-13b. Ja → Registreer (FR-09/11)" --> SaveConsent["Registreer Toestemming<br>+ TTL / eenmalig (FR-09/11)"]:::system
    SaveConsent -- "A-14b. Schrijf naar register (FR-09/11)" --> ConsentDB
    SaveConsent -- "A-15. Automatische terugleiding (FR-14)" --> PD_App
```
