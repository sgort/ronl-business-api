# Tree Felling Permit – BPMN + DMN Example

## Overview

This example demonstrates a simple BPMN process that delegates decision logic to two DMN decision tables.

## BPMN Process

```
(Start)
   |
[Submit Application]
   |
[Assess Felling Permit] (DMN)
   |
<Permit?>
   | Yes
[Assess Replacement Tree] (DMN)
   |
[Permit Granted]
   |
 (End)

   | No
[Permit Rejected]
   |
 (End)
```

## DMN 1 – Tree Felling Permitted?

Determines whether a permit can be granted based on tree diameter and protection status.

## DMN 2 – Replacement Tree Required?

Determines whether the applicant must plant a replacement tree if the permit is granted.

## Purpose

- BPMN orchestrates the workflow
- DMN encapsulates decision logic
- Clean separation of concerns
- Easy to extend with new rules
