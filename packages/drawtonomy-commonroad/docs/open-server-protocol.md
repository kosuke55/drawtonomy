# `drawtonomy-cr open`: local server protocol

[日本語](open-server-protocol.ja.md)

```bash
drawtonomy-cr open ./results            # a directory, or the scenario XML inside it
```

`open` takes a directory of planner results, works out which file is which,
serves the directory over loopback HTTP, prints a drawtonomy URL that points at
it, and then watches the directory so that rerunning the planner updates the
already-open tab.

This document describes what `open` actually does.

## Sniffing: which file is which

Four kinds are recognised: `scenario`, `solution`, `verdict`, `trace`.
Extensions are not trusted, because `.xml` covers both scenario and solution and
`.json` covers both verdict and trace. Each file's kind is decided from the
first 8192 bytes of its content, in this order:

| first match in the first 8 KiB | kind |
|---|---|
| `<commonRoad` | `scenario` |
| `<CommonRoadSolution` | `solution` |
| `drawtonomy-verdict/1` | `verdict` |
| `drawtonomy-planning-trace-v1` | `trace` |

Anything else is ignored. Only the top level of the directory is scanned;
subdirectories are not descended into.

**Picking, when several files share a kind.** The scenario and the solution are
picked as the first by name. The verdict and the trace are *not* picked by name:
they are paired with the chosen solution by stem,
`<solution stem>.verdict.json` and `<solution stem>.planning-trace.json`, so that
a directory holding the output of two planners does not serve one planner's trace
as the other's result. Only when no candidate follows the naming convention does
the pick fall back to the first by name.

Whenever more than one candidate existed, the CLI prints one line naming the file
it actually serves and the ones it ignored, so nothing is chosen silently:

```
2 solution files found; using idm.xml (naive.xml ignored)
```

**Overrides.** `--solution`, `--verdict` and `--trace` replace a sniffed pick; a
path that does not exist is refused with one line and exit 2. Passing
`--solution` also re-pairs the verdict and the trace by the new solution's stem,
unless they were named explicitly. An explicit `--verdict` or `--trace` is always
left alone.

If the target is a scenario XML rather than a directory, its parent directory is
served and that file is the scenario, even if the directory holds others.
If no scenario can be found at all, the CLI prints one line and exits 2.

## The verdict, before serving starts

If there is a solution and no verdict, and `commonroad-drivability-checker` is
installed, the verdict is computed and written to
`<solution stem>.verdict.json` next to the solution. A verdict produced this way
is marked as the CLI's own and is recomputed on every solution change.

If the checker is not installed this is not an error: one line says so, and the
scenario opens without a verdict.

```
No verdict: the official checker is not installed, so the scenario opens without it (install with: pip install "drawtonomy-commonroad[checker]", Linux x86_64 only).
```

A verdict the *user* provided is never recomputed and never overwritten.

### Stale verdicts are not served

If a user-provided verdict is older (by mtime) than the solution, it judges the
previous solution, so it is withheld and one line names the command that
recomputes it:

```
verdict: planner_solution.verdict.json is older than the solution and is not shown. Recompute: drawtonomy-cr verdict scenario.xml planner_solution.xml
```

Where the checker is not installed, the hint says where to run the command
instead. Watching continues, so regenerating the verdict makes it appear
immediately.

A verdict *newer* than the solution is served normally. A verdict the CLI
produced itself is exempt from this rule, since it is regenerated automatically.

## What is served

A `ThreadingHTTPServer` binds `127.0.0.1` only, on `--port` or, by default, on a
free port chosen by the OS. Its origin is `http://127.0.0.1:<port>`.

- Only `GET`, `HEAD` and `OPTIONS` are answered. Any other method gets 501.
- Only files under the served directory are reachable. A URL path is resolved
  against the root and then checked with `Path.resolve()` plus `is_relative_to`,
  so `..`, absolute paths and symlinks pointing outside all get 404. Anything
  that is not a regular file is 404 too.
- `Access-Control-Allow-Origin` is the app origin (`--app-origin`, default
  `https://drawtonomy.com`) - **never `*`**, so an arbitrary site cannot read the
  loopback endpoint. `Vary: Origin` accompanies it.
- `Cache-Control: no-store` is set on every response.
- `OPTIONS` answers 204 with `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`,
  `Access-Control-Allow-Headers: Content-Type` and
  `Access-Control-Max-Age: 600`.
- `Content-Type` is guessed from the file name, falling back to
  `application/octet-stream`.

A port that is already in use is refused with one line and a next step, not a
traceback, and the CLI exits 2:

```
Could not listen on 127.0.0.1:8000 (Address already in use). Use a different --port, or omit --port to pick a free one.
```

## The URL

The URL is `<app origin>/?` followed by url-encoded parameters, in this order:

| parameter | value |
|---|---|
| `open` | the **absolute** URL of the scenario, `http://127.0.0.1:<port>/<name>` |
| `solution` | the solution's path **relative** to the served directory |
| `verdict` | likewise, when a verdict is being served |
| `trace` | likewise, when there is a trace |

Only the companions that exist are listed. They are relative because the app
resolves them against the scenario URL, which survives a port change.

```
https://drawtonomy.com/?open=http%3A%2F%2F127.0.0.1%3A53101%2Fscenario.xml&solution=planner_solution.xml
```

A solution and a trace both drive replay; when both are present the app prefers
the trace, the same way it does for drag and drop. The CLI lists whatever it has
and leaves that choice to the app.

Unless `--no-browser` is given, the URL is opened with `webbrowser.open`.

## `/events`: change notifications

The path `/events` is a Server-Sent Events stream. Its response is
`Content-Type: text/event-stream` with `Connection: close`; the body ends when
the connection does, so neither chunking nor `Content-Length` is used. `HEAD`
returns the headers only.

On connect the server writes one comment so the client knows it is connected:

```
: connected

```

While idle it writes a keepalive comment every 30 seconds:

```
: keepalive

```

When files change, one event is broadcast to every connected client:

```
event: changed
data: {"files":["solution","verdict"],"names":{"solution":"planner_solution.xml","verdict":"planner_solution.verdict.json"}}

```

`data` is compact JSON with sorted keys:

| field | meaning |
|---|---|
| `files` | a sorted array of the kinds that changed, drawn from `solution`, `verdict`, `trace` |
| `names` | an object mapping each of those kinds to its path relative to the served directory |

`changed` is the only event type sent. The scenario is **never** watched or
announced - the drawing belongs to the app, so only the solution, the verdict and
the trace are refetched.

A kind that cannot be served is left out of `names` even when it appears in
`files`, so a missing or stale verdict is not fetched.

Clients that go away are cleaned up: the server notices the peer's EOF rather
than waiting for the next keepalive. Multiple simultaneous connections are
supported and all receive every event.

## Watching

The mtime (with the file size folded in, so a rewrite that leaves mtime alone is
still caught) of the solution, the verdict and the trace is polled every 0.5 s.

The verdict is watched **even before it exists**, under its expected name
`<solution stem>.verdict.json`, so a verdict written after `open` has started
still reaches the tab. A missing file simply has no mtime, so its appearance
registers as a change.

**Settling.** A detected change is not announced immediately. The watcher waits
until every watched mtime has held still for 0.5 s (up to 30 s), so a
half-written file is never served. Six rapid writes therefore produce one
notification, not six.

**Recomputation.** When the CLI owns the verdict and the solution changed, the
verdict is recomputed before the event is sent, and `verdict` is added to the
announced kinds. A user-provided verdict is never recomputed; only its own file
changes are announced.

**Adoption.** A verdict that appears, or is rewritten, after startup is adopted
and announced with one line (`verdict: planner_solution.verdict.json`). If it is
still older than the solution it is not served.

**Going stale while watching.** When only the solution changed and the
user-provided verdict is now older than it, the stale line follows the change
line, in that order - what happened, then what follows from it:

```
changed: solution
verdict: planner_solution.verdict.json is now older than the solution; checker results are cleared in the tab until you recompute: drawtonomy-cr verdict scenario.xml planner_solution.xml
```

From then on that verdict is not served and is absent from `names`.

The CLI runs until `Ctrl+C`, then prints `Stopped.` and shuts the watcher and the
server down.

## `--copy`: the fallback with no server

Safari refuses to read `http://127.0.0.1` from an `https` page, so the loopback
route cannot work there. `--copy` starts no server at all and prints the absolute
paths instead, for dropping onto drawtonomy by hand:

```
scenario: /home/me/results/scenario.xml
solution: /home/me/results/planner_solution.xml
verdict: /home/me/results/planner_solution.verdict.json
trace: /home/me/results/planner_solution.planning-trace.json
Drop these files onto drawtonomy.com to see the result.
```

Only the files that exist are listed, and a withheld stale verdict is left out
here too. `--copy` exits 0.

For Chrome and Firefox the loopback route works, and the CLI says so when it
prints the URL:

```
Open the URL in Chrome or Firefox (Safari blocks http://127.0.0.1 from an https page).
```

## Flags

| flag | meaning |
|---|---|
| `--solution` / `--verdict` / `--trace` | override the sniffed pick |
| `--port N` | fixed port (default 0, i.e. a free one) |
| `--no-browser` | print the URL without opening a browser |
| `--copy` | print the file paths instead of serving them |
| `--app-origin URL` | the origin allowed to read the files (default `https://drawtonomy.com`) |

## Exit codes

| code | meaning |
|---|---|
| 0 | ran and shut down cleanly (including `--copy`) |
| 2 | the target does not exist, holds no scenario, an override names a missing file, or the port could not be bound |

## See also

- [`verdict-sidecar.md`](verdict-sidecar.md) - the `drawtonomy-verdict/1` format.
- [`planning-trace-format.md`](planning-trace-format.md) - the
  `drawtonomy-planning-trace-v1` format.
