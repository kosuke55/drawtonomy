"""drawtonomy-cr: CommonRoad connector for drawtonomy.

- `drawtonomy_cr.verdict` - writes the official checker's result as a
  `drawtonomy-verdict/1` sidecar
- `drawtonomy_cr.trace`   - lets a planner write its per-cycle plans as a
  `drawtonomy-planning-trace-v1` file

Contracts: `docs/verdict-sidecar.md`, `docs/planning-trace-format.md`,
`docs/open-server-protocol.md`.
"""

__all__ = ["trace", "verdict"]
