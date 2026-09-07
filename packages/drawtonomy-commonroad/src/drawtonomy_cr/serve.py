"""
drawtonomy_cr.serve - the machinery behind `drawtonomy-cr open`.

It does exactly three things:

1. **sniff**: tell scenario / solution / verdict / trace apart by **content**.
   Extensions are not trusted: `.xml` covers both scenario and solution, `.json`
   covers both verdict and trace.
2. **serve**: statically serve **only that directory** on `127.0.0.1:<port>`.
   CORS is `Access-Control-Allow-Origin: <app origin>`, never `*`, so an
   arbitrary site cannot read the loopback endpoint.
3. **watch**: poll the mtime of solution / verdict / trace and push one line to
   `/events` (Server-Sent Events) when one changes. The app then refetches the
   solution and the verdict only - never the scenario, because the drawing is
   the app's own.

Only the standard library is used, so a planner developer has to install nothing
extra.

Protocol: `docs/open-server-protocol.md`.
"""

from __future__ import annotations

import json
import mimetypes
import socket
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

#: Default app origin. It is the only origin CORS allows (never `*`).
DEFAULT_APP_ORIGIN = "https://drawtonomy.com"

#: mtime polling interval.
POLL_INTERVAL = 0.5

#: How long the mtime has to hold still before a file is considered fully
#: written.
SETTLE_SECONDS = 0.5

#: SSE keepalive comment interval, to survive idle disconnects from proxies and
#: browsers.
KEEPALIVE_SECONDS = 30.0

#: How many leading bytes sniffing reads. A CommonRoad scenario can be megabytes,
#: so the whole file is never read; the root element and the schema key always
#: fall inside this window.
SNIFF_BYTES = 8192


# --------------------------------------------------------------------------
# sniff
# --------------------------------------------------------------------------

#: The four kinds that are told apart. Decided in this one place.
KINDS = ("scenario", "solution", "verdict", "trace")


def sniff_kind(path: Path) -> str | None:
    """Decide one file's kind from its **content**, or None when unrecognised.

    XML is decided by its root element, JSON by its schema string. Both always
    appear within the first 8 KiB, because CommonRoad and drawtonomy alike put
    the schema declaration directly under the root.
    """
    try:
        head = path.open("rb").read(SNIFF_BYTES).decode("utf-8", "replace")
    except OSError:
        return None
    if "<commonRoad" in head:
        return "scenario"
    if "<CommonRoadSolution" in head:
        return "solution"
    if "drawtonomy-verdict/1" in head:
        return "verdict"
    if "drawtonomy-planning-trace-v1" in head:
        return "trace"
    return None


@dataclass
class Bundle:
    """One bundle to serve. Only the scenario is required."""

    root: Path
    scenario: Path
    solution: Path | None = None
    verdict: Path | None = None
    trace: Path | None = None
    #: Kinds with several candidates, where the first by name was taken. The
    #: caller announces this in one line.
    ambiguous: dict[str, list[str]] | None = None
    #: Whether the CLI computed the verdict itself. A verdict the user provided
    #: is never recomputed, so their own file is not overwritten behind them.
    verdict_is_ours: bool = False
    #: A verdict that exists but was withheld for being older than the solution.
    #: Watching continues, so once rewritten it is promoted back to `verdict`.
    stale_verdict: Path | None = None

    def rel(self, path: Path | None) -> str | None:
        """Path relative to root, used verbatim as the URL path."""
        return None if path is None else path.relative_to(self.root).as_posix()

    @property
    def expected_verdict(self) -> Path | None:
        """Where the verdict is expected (`<solution stem>.verdict.json`), even if
        it does not exist yet.

        Where the checker cannot be installed locally, writing the verdict from
        Docker **after** `open` has started is the only route there is. Watching
        only the files present at startup would mean that verdict never reaches
        the tab, so the name is fixed up front on the assumption it is missing.
        """
        if self.verdict is not None:
            return self.verdict
        if self.stale_verdict is not None:
            return self.stale_verdict
        if self.solution is None:
            return None
        return self.solution.parent / f"{self.solution.stem}.verdict.json"

    def watched(self) -> dict[str, Path]:
        """What the watcher polls. The scenario is excluded, because the drawing
        is the app's own.

        The verdict is watched **even before it exists** (`expected_verdict`).
        `_stat_mtime` of a missing file is None, so its appearance shows up as a
        None-to-value change.
        """
        return {
            k: p
            for k, p in (
                ("solution", self.solution),
                ("verdict", self.expected_verdict),
                ("trace", self.trace),
            )
            if p is not None
        }


#: Suffixes appended to the solution's stem by the naming rule. This is how a
#: verdict and a trace are paired with their solution.
COMPANION_SUFFIX = {"verdict": ".verdict.json", "trace": ".planning-trace.json"}


def companion_for(solution: Path, kind: str, candidates: list[Path]) -> Path | None:
    """Return the candidate matching `<solution stem>.verdict.json` or
    `.planning-trace.json`.

    The stem of `planner_solution.xml` is `planner_solution`. None when nothing
    matches, in which case the caller falls back to the first candidate by name.
    """
    suffix = COMPANION_SUFFIX.get(kind)
    if suffix is None:
        return None
    want = f"{solution.stem}{suffix}"
    return next((p for p in candidates if p.name == want), None)


def pair_companions(
    found: dict[str, list[Path]], solution: Path | None
) -> dict[str, Path]:
    """Pick verdict / trace around the solution instead of independently by name.

    Having `idm.xml`, `naive.xml`, `naive.verdict.json`, `idm.verdict.json` and
    `naive.planning-trace.json` side by side is entirely ordinary - it is what
    trying two planners looks like. Taking the first candidate by name per kind
    would attach `naive.planning-trace.json` to `idm.xml` and **serve one
    planner's trajectory as the other's result**. So the solution is decided
    first, and companions matching `<solution stem>.*` win. Only when no name
    follows the convention does this fall back to the first by name.
    """
    picked: dict[str, Path] = {}
    for kind in ("verdict", "trace"):
        candidates = found.get(kind) or []
        if not candidates:
            continue
        matched = companion_for(solution, kind, candidates) if solution is not None else None
        picked[kind] = matched or candidates[0]
    return picked


def sniff_dir(root: Path) -> tuple[dict[str, Path], dict[str, list[str]]]:
    """Sniff the directory's top level, returning the pick per kind and the full
    candidate list.

    For scenario and solution, several candidates mean the **first by name** is
    taken, which keeps the choice deterministic. Verdict and trace are instead
    paired by the **chosen solution's stem** (`pair_companions`).
    Subdirectories are ignored: the directory being served is assumed to be one
    level of planner output, and descending into it risks picking up a solution
    from another run.
    """
    found: dict[str, list[Path]] = {k: [] for k in KINDS}
    for path in sorted(root.iterdir(), key=lambda p: p.name):
        if not path.is_file():
            continue
        kind = sniff_kind(path)
        if kind is not None:
            found[kind].append(path)
    picked = {k: v[0] for k, v in found.items() if v and k not in COMPANION_SUFFIX}
    picked.update(pair_companions(found, picked.get("solution")))
    ambiguous = {k: [p.name for p in v] for k, v in found.items() if len(v) > 1}
    return picked, ambiguous


def build_bundle(target: Path) -> tuple[Bundle | None, str | None]:
    """Build a Bundle from the `open` argument (a directory or a scenario XML).

    Returns (bundle, error). When error is set, bundle is None and the caller
    prints one line and exits 2.
    """
    if not target.exists():
        return None, f"{target} does not exist."
    if target.is_dir():
        root = target.resolve()
        picked, ambiguous = sniff_dir(root)
        scenario = picked.get("scenario")
        if scenario is None:
            return None, (
                f"No CommonRoad scenario (<commonRoad ...>) found in {root}. "
                "Export one from drawtonomy first, or pass the scenario XML directly."
            )
    else:
        scenario = target.resolve()
        if sniff_kind(scenario) != "scenario":
            return None, f"{target} is not a CommonRoad scenario (no <commonRoad> root)."
        root = scenario.parent
        picked, ambiguous = sniff_dir(root)
        # The scenario named on the command line wins, even if the directory
        # holds several.
        picked["scenario"] = scenario
        ambiguous.pop("scenario", None)
    return (
        Bundle(
            root=root,
            scenario=scenario,
            solution=picked.get("solution"),
            verdict=picked.get("verdict"),
            trace=picked.get("trace"),
            ambiguous=ambiguous or None,
        ),
        None,
    )


# --------------------------------------------------------------------------
# URL
# --------------------------------------------------------------------------


def build_open_url(bundle: Bundle, origin: str, app_origin: str) -> str:
    """Build the `?open=` URL, listing only the companions that exist.

    Companion values are **relative paths** (`&solution=planner_solution.xml`).
    The app resolves them against the scenario URL with the same rule, so the
    origin does not have to be repeated three times and the URL survives a port
    change.
    """
    from urllib.parse import quote, urlencode

    scenario_url = f"{origin}/{quote(bundle.rel(bundle.scenario) or '')}"
    params: list[tuple[str, str]] = [("open", scenario_url)]
    # Solution and trace **both** drive replay, and when both are present the app
    # prefers the trace - the same rule as drag and drop. The CLI lists whatever
    # it has and leaves the choice to the app.
    for key in ("solution", "verdict", "trace"):
        rel = bundle.rel(getattr(bundle, key))
        if rel:
            params.append((key, rel))
    return f"{app_origin.rstrip('/')}/?{urlencode(params)}"


# --------------------------------------------------------------------------
# stale verdict
# --------------------------------------------------------------------------


def verdict_is_stale(
    verdict: Path | None, solution: Path | None, verdict_is_ours: bool
) -> bool:
    """Whether the verdict is older than the solution, i.e. whether it still
    judges the previous solution.

    A verdict the CLI produced (`verdict_is_ours`) is recomputed on every
    solution change, so it is not considered here; only a user-provided verdict
    is. If either file cannot be stat'ed, nothing is called stale - the reason it
    is unreadable is not guessed at.
    """
    if verdict_is_ours or verdict is None or solution is None:
        return False
    v, sol = _stat_mtime(verdict), _stat_mtime(solution)
    if v is None or sol is None:
        return False
    return v < sol


def recompute_hint(bundle: Bundle) -> str:
    """The one command that recomputes a stale verdict. Like
    `CHECKER_MISSING_MESSAGE`, it names the next step within a single line."""
    import platform

    scenario = bundle.rel(bundle.scenario) or ""
    solution = bundle.rel(bundle.solution) or ""
    cmd = f"drawtonomy-cr verdict {scenario} {solution}"
    if platform.system() != "Linux":
        # The official checker ships manylinux_x86_64 wheels only.
        cmd += " (needs Linux x86_64; run it where the checker is installed, e.g. Docker)"
    return cmd


# --------------------------------------------------------------------------
# HTTP server
# --------------------------------------------------------------------------


class _Broadcaster:
    """The set of SSE clients connected to `/events`.

    Each connection owns a `threading.Event` and a queue, and disconnects are
    cleaned up quietly: reopening the tab on every planner run makes them
    routine.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._clients: list[list] = []

    def register(self) -> list:
        client = [threading.Event(), []]  # [wakeup, pending messages]
        with self._lock:
            self._clients.append(client)
        return client

    def unregister(self, client: list) -> None:
        with self._lock:
            if client in self._clients:
                self._clients.remove(client)

    def count(self) -> int:
        with self._lock:
            return len(self._clients)

    def broadcast(self, payload: str) -> None:
        with self._lock:
            clients = list(self._clients)
        for wakeup, pending in clients:
            pending.append(payload)
            wakeup.set()


class _Handler(BaseHTTPRequestHandler):
    """Minimal handler serving the directory's top level only, GET / HEAD /
    OPTIONS."""

    protocol_version = "HTTP/1.1"
    # Injected: the attributes come from the ThreadingHTTPServer instance.
    server_version = "drawtonomy-cr/1"
    sys_version = ""

    # --- shared -------------------------------------------------------------
    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", self.server.app_origin)
        # Tell caches the allowed origin can vary per Origin.
        self.send_header("Vary", "Origin")
        # Result files change on every planner run; never hand back a stale
        # solution.
        self.send_header("Cache-Control", "no-store")

    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        """Silence the default one-line-per-request stderr log, which is noise
        when the planner is rerun dozens of times a day."""
        if self.server.verbose:
            super().log_message(fmt, *args)

    def _reject(self, status: int, text: str) -> None:
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _safe_path(self, url_path: str) -> Path | None:
        """Resolve a URL path to a real file under root, or None if it escapes.

        `..`, absolute paths and symlink targets alike are refused unless they
        land under root after resolution: the check is `Path.resolve()` followed
        by `is_relative_to`, never a string comparison.
        """
        rel = unquote(urlparse(url_path).path).lstrip("/")
        if not rel:
            return None
        candidate = (self.server.root / rel).resolve()
        root = self.server.root.resolve()
        if candidate != root and not candidate.is_relative_to(root):
            return None
        if not candidate.is_file():
            return None
        return candidate

    # --- methods ------------------------------------------------------------
    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/events":
            self._serve_events()
            return
        target = self._safe_path(self.path)
        if target is None:
            self._reject(404, "not found\n")
            return
        try:
            body = target.read_bytes()
        except OSError:
            self._reject(404, "not found\n")
            return
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    # --- SSE ----------------------------------------------------------------
    def _peer_gone(self) -> bool:
        """Whether the peer closed the connection. Readable means EOF here,
        since nothing is ever received over an SSE stream."""
        import select

        try:
            readable, _, _ = select.select([self.connection], [], [], 0)
            if not readable:
                return False
            return self.connection.recv(1, socket.MSG_PEEK) == b""
        except OSError:
            return True

    def _serve_events(self) -> None:
        """Hold `/events` open and stream the watcher's notifications.

        HEAD has no body, so only the headers are sent; EventSource only ever
        issues GET.
        """
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self._cors_headers()
        # The length of an SSE stream is unknown, so neither chunking nor
        # Content-Length is used: the end of the connection is the end of the
        # body (HTTP/1.1 close-delimited).
        self.send_header("Connection", "close")
        self.end_headers()
        if self.command == "HEAD":
            return
        client = self.server.broadcaster.register()
        wakeup, pending = client
        last_keepalive = time.monotonic()
        try:
            # Send one comment immediately so the peer knows it is connected.
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            while not self.server.stopping.is_set():
                if wakeup.wait(timeout=1.0):
                    wakeup.clear()
                    while pending:
                        self.wfile.write(pending.pop(0).encode("utf-8"))
                    self.wfile.flush()
                    last_keepalive = time.monotonic()
                    continue
                # Check whether the peer went away. Normally only this side
                # writes, so without this the disconnect would go unnoticed
                # until the next keepalive (30 s) and every closed tab would
                # leave a thread and a registration behind. Readable means EOF,
                # because the peer never sends anything.
                if self._peer_gone():
                    break
                now = time.monotonic()
                if now - last_keepalive >= KEEPALIVE_SECONDS:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
                    last_keepalive = now
        except (BrokenPipeError, ConnectionResetError, OSError, ValueError):
            # Disconnects are routine (closing or reloading the tab): clean up
            # quietly.
            pass
        finally:
            self.server.broadcaster.unregister(client)


class ResultServer(ThreadingHTTPServer):
    """Loopback server for the result directory."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, root: Path, app_origin: str, port: int = 0, verbose: bool = False):
        super().__init__(("127.0.0.1", port), _Handler)
        self.root = root.resolve()
        self.app_origin = app_origin
        self.verbose = verbose
        self.broadcaster = _Broadcaster()
        self.stopping = threading.Event()

    def handle_error(self, request, client_address) -> None:
        """Do not print a traceback when the client disconnects.

        A browser closes the connection after reading a file, and an SSE stream
        ends when the tab is closed. socketserver's default dumps a stack trace
        to stderr for each of those, which buries the screen in diagnostics over
        dozens of planner runs. Only genuine failures are reported, as one line.
        """
        import sys

        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
            return
        if self.verbose:
            super().handle_error(request, client_address)
        else:
            print(f"drawtonomy-cr: request failed ({exc})", file=sys.stderr)

    @property
    def origin(self) -> str:
        return f"http://127.0.0.1:{self.server_address[1]}"

    def serve_in_thread(self) -> threading.Thread:
        t = threading.Thread(target=self.serve_forever, name="drawtonomy-cr-http", daemon=True)
        t.start()
        return t

    def shutdown_all(self) -> None:
        self.stopping.set()
        self.shutdown()
        self.server_close()


# --------------------------------------------------------------------------
# watcher
# --------------------------------------------------------------------------


def _stat_mtime(path: Path) -> float | None:
    try:
        st = path.stat()
    except OSError:
        return None
    # Size is folded in too, to catch a write that grows the file while leaving
    # the mtime unchanged (some editors overwrite this way).
    return st.st_mtime + st.st_size * 1e-9


class Watcher(threading.Thread):
    """Poll the mtime of solution / verdict / trace and push to `/events`.

    So that a half-written file is never served, a detected change is announced
    only **after the mtime has held still for SETTLE_SECONDS**. A planner writes
    hundreds of kilobytes of solution, and reading it at size 0 would look like
    the solution had become empty.
    """

    def __init__(
        self,
        bundle: Bundle,
        server: ResultServer,
        *,
        recompute_verdict=None,
        on_message=None,
        poll_interval: float = POLL_INTERVAL,
        settle: float = SETTLE_SECONDS,
    ) -> None:
        super().__init__(name="drawtonomy-cr-watch", daemon=True)
        self.bundle = bundle
        self.server = server
        self.recompute_verdict = recompute_verdict
        self.on_message = on_message or (lambda msg: None)
        self.poll_interval = poll_interval
        self.settle = settle
        self.stop_event = threading.Event()
        self._state = {k: _stat_mtime(p) for k, p in bundle.watched().items()}

    def stop(self) -> None:
        self.stop_event.set()

    def run(self) -> None:
        while not self.stop_event.wait(self.poll_interval):
            changed = self._collect_changed()
            if changed:
                self._announce(changed)

    def _collect_changed(self) -> list[str]:
        """Return the kinds that changed, waiting for them to settle first so a
        half-written file is never read."""
        watched = self.bundle.watched()
        changed = [k for k, p in watched.items() if _stat_mtime(p) != self._state.get(k)]
        if not changed:
            return []
        # Settle: wait until every mtime has been unchanged for `settle`
        # seconds.
        deadline = time.monotonic() + 30.0
        snapshot = {k: _stat_mtime(watched[k]) for k in watched}
        while not self.stop_event.is_set() and time.monotonic() < deadline:
            if self.stop_event.wait(self.settle):
                return []
            now = {k: _stat_mtime(watched[k]) for k in watched}
            if now == snapshot:
                break
            snapshot = now
        changed = [k for k, v in snapshot.items() if v != self._state.get(k)]
        self._state.update(snapshot)
        return changed

    def _announce(self, changed: list[str]) -> None:
        files = list(changed)
        # Only a verdict the CLI produced is recomputed. For a user-provided
        # verdict just the file change is announced, so their own file is never
        # overwritten behind them.
        if self.recompute_verdict and "verdict" not in changed:
            recomputed = self.recompute_verdict()
            if recomputed:
                # Recomputing moves the verdict's mtime too, so record the new
                # value now to avoid announcing it twice on the next poll.
                v = self.bundle.verdict
                if v is not None:
                    self._state["verdict"] = _stat_mtime(v)
                if "verdict" not in files:
                    files.append("verdict")

        if "verdict" in files:
            self._adopt_verdict()
        stale_line = (
            self._stale_line() if "solution" in files and "verdict" not in files else None
        )

        # A verdict that cannot be served (missing, or older than the solution)
        # is left out of `names`. The app fetches every name it is given, so
        # listing it would return a 404 or an outdated verdict.
        if "verdict" in files and self.bundle.verdict is None:
            files = [f for f in files if f != "verdict"]

        names = {}
        for kind in files:
            rel = self.bundle.rel(getattr(self.bundle, kind, None))
            if rel:
                names[kind] = rel
        payload = json.dumps(
            {"files": sorted(files), "names": names}, separators=(",", ":"), sort_keys=True
        )
        self.server.broadcaster.broadcast(f"event: changed\ndata: {payload}\n\n")
        self.on_message(f"changed: {', '.join(sorted(files))}")
        # The stale notice comes **after** `changed: solution`: say what
        # happened first, then what follows from it.
        if stale_line:
            self.on_message(stale_line)

    def _adopt_verdict(self) -> None:
        """Adopt a verdict that appeared, or was rewritten, after startup.

        Where the checker cannot run locally, writing the verdict from Docker
        after `open` started is the only route, so a file that was missing or
        stale at startup can become the authoritative one later. While it stays
        older than the solution it is still not served (`bundle.verdict` remains
        None).
        """
        path = self.bundle.expected_verdict
        if path is None or _stat_mtime(path) is None:
            return
        if verdict_is_stale(path, self.bundle.solution, self.bundle.verdict_is_ours):
            if self.bundle.verdict is not None:
                self.bundle.stale_verdict = self.bundle.verdict
                self.bundle.verdict = None
            return
        was_missing = self.bundle.verdict is None
        self.bundle.verdict = path
        self.bundle.stale_verdict = None
        if was_missing:
            self.on_message(f"verdict: {path.name}")

    def _stale_line(self) -> str | None:
        """The one line printed when only the solution changed and a
        user-provided verdict has therefore gone stale.

        Where the checker cannot run locally the verdict is always a file the
        user placed, so no automatic recomputation follows. Without a browser
        open (in CI, or before `git add`) there would be no way to notice a PASS
        verdict sitting next to a colliding solution, which is what this line is
        for. As a side effect that verdict is no longer served - the tab already
        dropped it when the solution changed on its own.
        """
        if self.bundle.verdict_is_ours:
            return None
        verdict = self.bundle.verdict
        if verdict is None or _stat_mtime(verdict) is None:
            return None
        if not verdict_is_stale(verdict, self.bundle.solution, False):
            return None
        self.bundle.stale_verdict = verdict
        self.bundle.verdict = None
        return (
            f"verdict: {verdict.name} is now older than the solution; checker results "
            f"are cleared in the tab until you recompute: {recompute_hint(self.bundle)}"
        )
