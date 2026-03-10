# Caseworker dashboard features

## Personal info of Caseworker

### Caseworker

- is onboarded by HR department
- is member of one team
- holds one or more roles
- is being assigned those roles by IAM department (ie RBAC)
- participates as projectmember in one or more projects

## Features

### Human resources

1. onboarding process
2. offboarding process

### Regular Infraprojects Process (RIP)

```flowchart LR
    QS([Quickscan\n'Verkenning']) --> V[1.\nVerkenning]
    V --> MB([MBVI/PMIRT])
    MB --> R2[R2.\nPlanvoorbereiding]
    R2 --> R3[R3.\nContractvorming]
    R3 --> R4[R4.\nAanbesteding]
    R4 --> CB[5.\nContractbeheersing]
    CB --> DP[6. Decharge\nproject]
    DP --> EIND([Eind])

    subgraph RIP [Regulier Infraprojectenproces - RIP]
        QS
        V
        MB
        R2
        R3
        R4
        CB
        DP
        EIND
    end

    TP[Toetsproces] -.- V
    KO[Kwaliteitstoetsing\nOpdrachtbrieven\nen Nota's] <--> R4
    INK[Inkoop] <--> R4
```
