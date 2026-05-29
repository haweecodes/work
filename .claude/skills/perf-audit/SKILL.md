Run a frontend performance audit:
1. Search for unmemoized expensive computations (useMemo, useCallback opportunities)
2. Check Zustand selectors for unnecessary subscriptions
3. Look for missing React.memo on list items
4. Report findings with file:line refs BEFORE making changes
5. After fixes, run `tsc --noEmit` and the test suite
