# RIP Fase 1 Not-Deployed Error Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `OperatonService.startProcess()` fails because Operaton has no
deployed process definition for the requested key, throw a clear, actionable
Dutch error message instead of leaking Operaton's raw engine wording.

**Architecture:** Extend the existing try/catch in `startProcess()` with the
same "detect known Operaton engine error, throw a descriptive message"
pattern already used by `evaluateDecision()` in the same file. One substring
check on Operaton's REST exception message; everything else is unchanged.

**Tech Stack:** TypeScript, Express, axios, Jest (`ts-jest`), existing
`OperatonService` mocked-axios test harness.

## Global Constraints

- Message text must be in Dutch, consistent with the existing DMN error
  strings in `operaton.service.ts` (spec: "New message").
- Detection matches on Operaton's exact substring `"No matching process
definition with key"` — not a broader 404 check (spec: "Detection scope").
- No route-layer (`process.routes.ts`) changes — the new message must flow
  through the existing `cause` extraction unchanged (spec: "Propagation").
- Any other Operaton error must continue to behave exactly as it does today
  (spec: "Fallback behavior") — i.e. `startProcess()`'s catch block still
  ends with `throw error;` for every case that isn't the new deployment
  check, identical to current behavior.
- No frontend changes (spec: "Scope" / "Out of scope").

---

### Task 1: Friendlier not-deployed message in `startProcess`

**Files:**

- Modify: `packages/backend/src/services/operaton.service.ts:113-153` (the
  `startProcess` method)
- Test: `packages/backend/src/services/operaton.service.test.ts` (the
  `describe('startProcess', ...)` block, currently lines 90-119)

**Interfaces:**

- Consumes: nothing new — `axios.isAxiosError` (already imported in this
  file, used by `evaluateDecision`) is the only helper needed.
- Produces: `startProcess()`'s public signature and return type
  (`Promise<ProcessInstance>`) are unchanged. Only the `Error` thrown on a
  "no matching process definition" failure changes, from the raw axios
  error to `new Error("Proces '${processKey}' is niet gevonden op deze
Operaton-omgeving. Controleer of de BPMN-bundel voor dit proces is
gedeployed en probeer het opnieuw.")`. No other code in this repo calls
  `startProcess()` and inspects the error message today (checked via the
  route handler's generic `cause` extraction in `process.routes.ts`), so
  this is a safe, additive change.

- [ ] **Step 1: Write the failing test**

  Add this test inside the existing `describe('startProcess', () => { ... })`
  block in `packages/backend/src/services/operaton.service.test.ts`, right
  after the existing `'rethrows on failure'` test (after line 118):

  ```ts
  it('translates a missing-deployment 404 into a friendly Dutch message', async () => {
    mockClient.post.mockRejectedValue({
      isAxiosError: true,
      response: {
        data: {
          type: 'RestException',
          message: 'No matching process definition with key: RipPhase1Process and no tenant-id',
        },
      },
    });
    await expect(svc.startProcess('RipPhase1Process', req(), 'flevoland')).rejects.toThrow(
      /RipPhase1Process' is niet gevonden op deze Operaton-omgeving/
    );
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  Run: `npx jest src/services/operaton.service.test.ts -t "missing-deployment" --no-coverage`
  (from `packages/backend`)

  Expected: FAIL — the rejection message is the raw
  `"No matching process definition with key: RipPhase1Process and no
tenant-id"` from the mocked axios error, not the new Dutch message, so the
  `toThrow(/niet gevonden/)` assertion fails.

- [ ] **Step 3: Write minimal implementation**

  In `packages/backend/src/services/operaton.service.ts`, replace the
  `startProcess` catch block (currently):

  ```ts
    } catch (error) {
      logger.error('Failed to start process', {
        processKey,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
  ```

  with:

  ```ts
    } catch (error) {
      const operatonBody = axios.isAxiosError(error) ? error.response?.data : null;
      const operatonMessage: string = operatonBody?.message ?? '';

      logger.error('Failed to start process', {
        processKey,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Detect a missing deployment and throw a descriptive message instead
      // of leaking Operaton's raw engine wording.
      if (operatonMessage.includes('No matching process definition with key')) {
        throw new Error(
          `Proces '${processKey}' is niet gevonden op deze Operaton-omgeving. Controleer of de BPMN-bundel voor dit proces is gedeployed en probeer het opnieuw.`
        );
      }

      throw error;
    }
  }
  ```

  (`axios` is already imported at the top of this file for
  `evaluateDecision`'s identical pattern — no new import needed.)

- [ ] **Step 4: Run test to verify it passes**

  Run: `npx jest src/services/operaton.service.test.ts -t "missing-deployment" --no-coverage`
  (from `packages/backend`)

  Expected: PASS

- [ ] **Step 5: Run the full operaton.service and process.routes test files to confirm no regressions**

  Run: `npx jest src/services/operaton.service.test.ts src/routes/process.routes.test.ts --no-coverage`
  (from `packages/backend`)

  Expected: PASS — all pre-existing tests (including `'rethrows on
failure'` and the three `evaluateDecision` translation tests) still pass
  unchanged, since the new branch only triggers on the specific "No
  matching process definition with key" substring.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/backend/src/services/operaton.service.ts packages/backend/src/services/operaton.service.test.ts
  git commit -m "fix: friendlier error when starting a process with no Operaton deployment"
  ```
