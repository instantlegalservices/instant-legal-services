# ILS Rollback Plan — Initial

1. Main is not modified by Phase 0–3.
2. Controlled work is isolated on cursor/ils-master-completion-20260925.
3. Every functional change must be small, attributable and reversible.
4. Database changes, if later required, must be additive/backward-compatible first and TEST-only until independently verified.
5. No production migration is permitted while a working-chain dependency or rollback is unresolved.
6. No payment architecture migration is permitted under the current preservation rule.
7. No GST TEST-to-Production promotion is permitted without recovered source mapping, genuine E2E evidence, security verification and release authorization.
8. If a change threatens a frozen chain, stop and revert/abandon the controlled branch change rather than altering Production.
