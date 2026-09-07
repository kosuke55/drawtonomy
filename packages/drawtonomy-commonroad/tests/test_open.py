"""Tests for `drawtonomy-cr open`.

Five things are covered:
  - sniffing tells the four kinds apart by **content**, never by extension
  - CORS is not `*`, `no-store` is set, and nothing outside the directory is
    served
  - `/events` delivers `changed` on an mtime change, against a real server and a
    real HTTP client
  - `--copy` prints absolute paths and starts no server
  - without the checker the verdict is skipped, with exactly one line

Nothing leaves the machine: every port is an ephemeral one on 127.0.0.1.
"""

import http.client
import json
import os
import shutil
import socket
import threading
import time
from pathlib import Path

import pytest

from drawtonomy_cr.cli import main
from drawtonomy_cr.serve import (
    ResultServer,
    Watcher,
    build_bundle,
    build_open_url,
    sniff_dir,
    sniff_kind,
)


@pytest.fixture
def results(tmp_path: Path, fixtures: Path) -> Path:
    """Reproduce a directory right after a planner wrote its results."""
    d = tmp_path / "out"
    d.mkdir()
    for name in (
        "cutin_commonroad.xml",
        "planner_solution.xml",
        "planner_solution.verdict.json",
        "planner_solution.planning-trace.json",
    ):
        shutil.copy(fixtures / name, d / name)
    return d


# ---------------------------------------------------------------------------
# sniff
# ---------------------------------------------------------------------------


def test_sniff_kind_reads_content_not_extension(results: Path) -> None:
    # `.xml` covers scenario and solution; `.json` covers verdict and trace.
    assert sniff_kind(results / "cutin_commonroad.xml") == "scenario"
    assert sniff_kind(results / "planner_solution.xml") == "solution"
    assert sniff_kind(results / "planner_solution.verdict.json") == "verdict"
    assert sniff_kind(results / "planner_solution.planning-trace.json") == "trace"


def test_sniff_kind_unknown_file_is_none(tmp_path: Path) -> None:
    p = tmp_path / "notes.txt"
    p.write_text("just some notes", encoding="utf-8")
    assert sniff_kind(p) is None


def test_sniff_dir_picks_all_four(results: Path) -> None:
    picked, ambiguous = sniff_dir(results)
    assert set(picked) == {"scenario", "solution", "verdict", "trace"}
    assert ambiguous == {}


def test_sniff_dir_takes_first_by_name_when_ambiguous(results: Path) -> None:
    shutil.copy(results / "planner_solution.xml", results / "another_solution.xml")
    picked, ambiguous = sniff_dir(results)
    # First by name is another_solution.xml, chosen deterministically.
    assert picked["solution"].name == "another_solution.xml"
    assert ambiguous["solution"] == ["another_solution.xml", "planner_solution.xml"]


def _two_planners(results: Path) -> None:
    """Build the directory that trying two planners leaves behind.

    `idm.xml`, `naive.xml`, `idm.verdict.json`, `naive.verdict.json` and
    `naive.planning-trace.json` sit side by side. Taking the first candidate by
    name per kind would attach `naive.planning-trace.json` to `idm.xml`, i.e.
    one planner's trajectory to the other's solution.
    """
    sol = results / "planner_solution.xml"
    verdict = results / "planner_solution.verdict.json"
    trace = results / "planner_solution.planning-trace.json"
    shutil.copy(sol, results / "idm.xml")
    shutil.copy(sol, results / "naive.xml")
    shutil.copy(verdict, results / "idm.verdict.json")
    shutil.copy(verdict, results / "naive.verdict.json")
    shutil.copy(trace, results / "naive.planning-trace.json")
    for name in (sol, verdict, trace):
        name.unlink()


def test_sniff_dir_pairs_companions_by_solution_stem(results: Path) -> None:
    _two_planners(results)
    picked, ambiguous = sniff_dir(results)
    # The solution is the first by name, idm.xml.
    assert picked["solution"].name == "idm.xml"
    # idm also comes first by name, but the reason it is picked is the stem
    # match.
    assert picked["verdict"].name == "idm.verdict.json"
    # Only a naive trace exists and it does not belong to the idm solution, so
    # the stem search finds nothing and the first candidate is taken.
    assert picked["trace"].name == "naive.planning-trace.json"
    assert ambiguous["solution"] == ["idm.xml", "naive.xml"]


def test_sniff_dir_stem_pairing_beats_name_order(results: Path) -> None:
    # With naive.xml as the only solution, the stem match (naive) wins over the
    # first by name (idm).
    _two_planners(results)
    (results / "idm.xml").unlink()
    picked, _ = sniff_dir(results)
    assert picked["solution"].name == "naive.xml"
    assert picked["verdict"].name == "naive.verdict.json"
    assert picked["trace"].name == "naive.planning-trace.json"


def test_sniff_dir_falls_back_to_name_order_without_stem_match(results: Path) -> None:
    # When no name follows the convention, the first by name is taken - a
    # deterministic default, rather than a silent arbitrary pick.
    shutil.move(results / "planner_solution.verdict.json", results / "aaa.verdict.json")
    shutil.copy(results / "aaa.verdict.json", results / "zzz.verdict.json")
    picked, ambiguous = sniff_dir(results)
    assert picked["solution"].name == "planner_solution.xml"
    assert picked["verdict"].name == "aaa.verdict.json"
    assert ambiguous["verdict"] == ["aaa.verdict.json", "zzz.verdict.json"]


def test_build_bundle_from_scenario_file_uses_that_scenario(results: Path) -> None:
    shutil.copy(results / "cutin_commonroad.xml", results / "aaa_other.xml")
    bundle, error = build_bundle(results / "cutin_commonroad.xml")
    assert error is None
    # The scenario named on the command line takes precedence over sniffing's
    # name order.
    assert bundle.scenario.name == "cutin_commonroad.xml"
    assert bundle.solution.name == "planner_solution.xml"


def test_build_bundle_without_scenario_is_an_error(tmp_path: Path) -> None:
    bundle, error = build_bundle(tmp_path)
    assert bundle is None
    assert "No CommonRoad scenario" in error


def test_build_bundle_missing_dir_is_an_error(tmp_path: Path) -> None:
    bundle, error = build_bundle(tmp_path / "nope")
    assert bundle is None
    assert "does not exist" in error


def test_build_open_url_uses_relative_companions(results: Path) -> None:
    bundle, _ = build_bundle(results)
    url = build_open_url(bundle, "http://127.0.0.1:8123", "https://drawtonomy.com")
    assert url.startswith("https://drawtonomy.com/?open=")
    assert "http%3A%2F%2F127.0.0.1%3A8123%2Fcutin_commonroad.xml" in url
    # Companions are relative paths; the app resolves them against the scenario
    # with the same rule.
    assert "solution=planner_solution.xml" in url
    assert "verdict=planner_solution.verdict.json" in url
    assert "trace=planner_solution.planning-trace.json" in url


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


@pytest.fixture
def server(results: Path):
    srv = ResultServer(results, "https://drawtonomy.com", port=0)
    srv.serve_in_thread()
    try:
        yield srv
    finally:
        srv.shutdown_all()


def _request(srv: ResultServer, path: str, method: str = "GET"):
    conn = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=5)
    try:
        conn.request(method, path)
        res = conn.getresponse()
        body = res.read()
        return res.status, dict(res.getheaders()), body
    finally:
        conn.close()


def test_serves_the_scenario_with_scoped_cors(server: ResultServer) -> None:
    status, headers, body = _request(server, "/cutin_commonroad.xml")
    assert status == 200
    assert b"<commonRoad" in body
    # Never `*`: an arbitrary site must not be able to read the loopback
    # endpoint.
    assert headers["Access-Control-Allow-Origin"] == "https://drawtonomy.com"
    assert headers["Access-Control-Allow-Origin"] != "*"
    assert headers["Vary"] == "Origin"
    # Results change on every planner run, so a stale one is never handed back.
    assert headers["Cache-Control"] == "no-store"


def test_app_origin_is_configurable_for_local_dev(results: Path) -> None:
    srv = ResultServer(results, "http://localhost:4001", port=0)
    srv.serve_in_thread()
    try:
        _, headers, _ = _request(srv, "/planner_solution.xml")
        assert headers["Access-Control-Allow-Origin"] == "http://localhost:4001"
    finally:
        srv.shutdown_all()


def test_preflight_is_answered(server: ResultServer) -> None:
    status, headers, _ = _request(server, "/planner_solution.xml", method="OPTIONS")
    assert status == 204
    assert headers["Access-Control-Allow-Origin"] == "https://drawtonomy.com"
    assert "GET" in headers["Access-Control-Allow-Methods"]


def test_head_has_no_body(server: ResultServer) -> None:
    status, headers, body = _request(server, "/planner_solution.xml", method="HEAD")
    assert status == 200
    assert body == b""
    assert int(headers["Content-Length"]) > 0


def test_path_traversal_is_refused(server: ResultServer, results: Path) -> None:
    secret = results.parent / "secret.txt"
    secret.write_text("ssh key", encoding="utf-8")
    for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/a/../../secret.txt"):
        status, _, body = _request(server, path)
        assert status == 404, path
        assert b"ssh key" not in body, path


def test_absolute_path_outside_root_is_refused(server: ResultServer) -> None:
    status, _, _ = _request(server, "//etc/passwd")
    assert status == 404


def test_post_is_not_served(server: ResultServer) -> None:
    status, _, _ = _request(server, "/planner_solution.xml", method="POST")
    # BaseHTTPRequestHandler answers 501 for methods it has no handler for;
    # only GET / HEAD / OPTIONS are implemented.
    assert status == 501


# ---------------------------------------------------------------------------
# SSE (watch)
# ---------------------------------------------------------------------------


class _EventClient:
    """Stand-in for EventSource: opens `/events` and collects lines.

    `close()` **really closes the connection**, the way closing a browser tab
    does. A stop flag on the read loop alone leaves the socket open, which the
    server does not see as a disconnect.
    """

    def __init__(self, srv: ResultServer) -> None:
        self.lines: list[str] = []
        self.status: int | None = None
        self.content_type: str | None = None
        self._conn = http.client.HTTPConnection("127.0.0.1", srv.server_address[1], timeout=15)
        self._conn.request("GET", "/events")
        # On a `Connection: close` response http.client hands the socket to the
        # response object and sets `conn.sock` to None, so keep a reference to
        # the socket itself in order to close it later.
        self._sock = self._conn.sock
        res = self._conn.getresponse()
        self.status = res.status
        self.content_type = res.getheader("Content-Type")
        self._res = res
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._pump, daemon=True)
        self._thread.start()

    def _pump(self) -> None:
        try:
            while not self._stop.is_set():
                line = self._res.fp.readline()
                if not line:
                    break
                self.lines.append(line.decode("utf-8").rstrip("\n"))
        except (OSError, ValueError):
            pass

    def close(self) -> None:
        self._stop.set()
        # The reader thread is blocked in readline(), so shut the socket down
        # first to force an EOF before tearing it down. `HTTPConnection.close()`
        # alone holds on to the socket while a response is unread, which the
        # server never sees as a disconnect.
        for step in (
            lambda: self._sock.shutdown(socket.SHUT_RDWR),
            lambda: self._sock.close(),
        ):
            try:
                step()
            except (OSError, AttributeError):
                pass
        self._thread.join(timeout=5)
        try:
            self._res.fp.close()
            self._conn.close()
        except (OSError, AttributeError):
            pass

    def data_payloads(self) -> list[dict]:
        return [json.loads(x[len("data: ") :]) for x in list(self.lines) if x.startswith("data: ")]


def _wait_until(predicate, timeout: float = 10.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(0.05)
    return predicate()


def test_events_streams_changed_when_the_solution_is_rewritten(
    server: ResultServer, results: Path
) -> None:
    bundle, _ = build_bundle(results)
    watcher = Watcher(bundle, server, poll_interval=0.05, settle=0.05)
    watcher.start()
    client = _EventClient(server)
    try:
        assert client.status == 200
        assert client.content_type == "text/event-stream"
        assert _wait_until(lambda: server.broadcaster.count() == 1, 5)

        text = (results / "planner_solution.xml").read_text(encoding="utf-8")
        (results / "planner_solution.xml").write_text(text + "\n<!-- rerun -->\n", encoding="utf-8")

        assert _wait_until(lambda: client.data_payloads()), f"no changed event; got {client.lines}"
        payload = client.data_payloads()[0]
        assert payload["files"] == ["solution"]
        # The names are included too, so the app never has to guess which file
        # changed.
        assert payload["names"] == {"solution": "planner_solution.xml"}
        assert "event: changed" in client.lines
    finally:
        client.close()
        watcher.stop()


def test_two_event_clients_both_receive(server: ResultServer, results: Path) -> None:
    """Several connections are allowed: two open tabs both receive events."""
    bundle, _ = build_bundle(results)
    watcher = Watcher(bundle, server, poll_interval=0.05, settle=0.05)
    watcher.start()
    a, b = _EventClient(server), _EventClient(server)
    try:
        assert _wait_until(lambda: server.broadcaster.count() == 2, 5)
        text = (results / "planner_solution.xml").read_text(encoding="utf-8")
        (results / "planner_solution.xml").write_text(text + "\n<!-- x -->\n", encoding="utf-8")
        assert _wait_until(lambda: a.data_payloads() and b.data_payloads())
        want = {"files": ["solution"], "names": {"solution": "planner_solution.xml"}}
        assert a.data_payloads()[0] == b.data_payloads()[0] == want
    finally:
        a.close()
        b.close()
        watcher.stop()


def test_events_disconnect_is_cleaned_up_quietly(server: ResultServer) -> None:
    client = _EventClient(server)
    assert _wait_until(lambda: server.broadcaster.count() == 1, 5)
    client.close()
    # Disconnects are routine (closing or reloading a tab), and the
    # registration must not outlive them, or threads pile up per closed tab.
    assert _wait_until(lambda: server.broadcaster.count() == 0, 10)


def test_watcher_does_not_recompute_a_verdict_the_user_wrote(
    server: ResultServer, results: Path
) -> None:
    bundle, _ = build_bundle(results)
    # A sniffed verdict is one the user provided, so verdict_is_ours is False.
    assert bundle.verdict is not None
    assert bundle.verdict_is_ours is False
    calls = []
    watcher = Watcher(
        bundle,
        server,
        recompute_verdict=None,  # the CLI passes none when verdict_is_ours is False
        on_message=calls.append,
        poll_interval=0.05,
        settle=0.05,
    )
    watcher.start()
    try:
        before = (results / "planner_solution.verdict.json").read_bytes()
        text = (results / "planner_solution.xml").read_text(encoding="utf-8")
        (results / "planner_solution.xml").write_text(text + "\n<!-- x -->\n", encoding="utf-8")
        deadline = time.monotonic() + 10
        while not calls and time.monotonic() < deadline:
            time.sleep(0.05)
        assert calls[0] == "changed: solution"
        # The solution is newer, so the user's verdict is stale - and is said
        # to be.
        assert len(calls) == 2 and calls[1].startswith("verdict: planner_solution.verdict.json is now older")
        # The user's verdict is never rewritten behind them.
        assert (results / "planner_solution.verdict.json").read_bytes() == before
    finally:
        watcher.stop()


def test_watcher_settles_before_announcing(server: ResultServer, results: Path) -> None:
    """Nothing is announced while a write is still in progress, i.e. while the
    mtime keeps moving."""
    bundle, _ = build_bundle(results)
    calls: list[str] = []
    watcher = Watcher(
        bundle, server, on_message=calls.append, poll_interval=0.05, settle=0.4
    )
    watcher.start()
    try:
        target = results / "planner_solution.xml"
        for i in range(6):
            target.write_text(f"<CommonRoadSolution />\n<!-- {i} -->\n", encoding="utf-8")
            time.sleep(0.1)
        # Six writes produce one notification, at the end of the writing.
        deadline = time.monotonic() + 10
        while not calls and time.monotonic() < deadline:
            time.sleep(0.05)
        time.sleep(1.0)
        # Six writes produce one `changed:` line; the stale line after it is
        # the consequence of that single event.
        assert [c for c in calls if c.startswith("changed:")] == ["changed: solution"]
    finally:
        watcher.stop()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def test_copy_prints_absolute_paths_and_serves_nothing(results: Path, capsys) -> None:
    # The port stays free, which is how "no server was started" is shown.
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        free_port = probe.getsockname()[1]
    rc = main(["open", str(results), "--copy", "--port", str(free_port), "--no-browser"])
    assert rc == 0
    out = capsys.readouterr().out
    for key in ("scenario", "solution", "verdict", "trace"):
        assert f"{key}: {results}/" in out, f"{key} missing from:\n{out}"
    assert "Drop these files onto drawtonomy.com" in out
    with socket.socket() as probe:
        # Nothing is listening, so the same port can be bound.
        probe.bind(("127.0.0.1", free_port))


def test_open_without_a_scenario_exits_2(tmp_path: Path, capsys) -> None:
    rc = main(["open", str(tmp_path), "--copy"])
    assert rc == 2
    err = capsys.readouterr().err
    assert "No CommonRoad scenario" in err
    # Told once, in one place: no traceback.
    assert "Traceback" not in err
    assert err.count("\n") == 1


def test_open_with_a_missing_target_exits_2(tmp_path: Path, capsys) -> None:
    rc = main(["open", str(tmp_path / "gone"), "--copy"])
    assert rc == 2
    assert "does not exist" in capsys.readouterr().err


def test_open_with_an_unreadable_override_exits_2(results: Path, capsys) -> None:
    rc = main(["open", str(results), "--copy", "--solution", str(results / "nope.xml")])
    assert rc == 2
    assert "does not exist" in capsys.readouterr().err


def test_missing_checker_skips_the_verdict_in_one_line(
    results: Path, capsys, monkeypatch
) -> None:
    """A missing checker is not an exit: one line, and the scenario is still
    served."""
    (results / "planner_solution.verdict.json").unlink()
    import drawtonomy_cr.cli as cli_mod
    from drawtonomy_cr.verdict import CHECKER_MISSING_MESSAGE, CheckerNotInstalled

    def refuse(*a, **kw):
        raise CheckerNotInstalled(CHECKER_MISSING_MESSAGE)

    monkeypatch.setattr(cli_mod, "write_verdict", refuse)
    rc = main(["open", str(results), "--copy"])
    assert rc == 0
    out = capsys.readouterr().out
    skips = [line for line in out.splitlines() if line.startswith("No verdict:")]
    assert len(skips) == 1
    assert "not installed" in skips[0]
    # No verdict, but the scenario and solution are still listed, so the
    # fallback remains usable.
    assert "scenario: " in out
    assert "solution: " in out
    assert "\nverdict: " not in out  # distinct from the skip line ("No verdict:")


def test_ambiguity_is_announced_once(results: Path, capsys) -> None:
    shutil.copy(results / "planner_solution.xml", results / "another_solution.xml")
    rc = main(["open", str(results), "--copy"])
    assert rc == 0
    out = capsys.readouterr().out
    lines = [line for line in out.splitlines() if "solution files found" in line]
    assert len(lines) == 1
    assert "using another_solution.xml" in lines[0]
    assert "planner_solution.xml ignored" in lines[0]


def test_override_wins_over_the_sniffed_pick(results: Path, capsys) -> None:
    shutil.copy(results / "planner_solution.xml", results / "another_solution.xml")
    rc = main(
        ["open", str(results), "--copy", "--solution", str(results / "planner_solution.xml")]
    )
    assert rc == 0
    out = capsys.readouterr().out
    assert f"solution: {results / 'planner_solution.xml'}" in out
    # No "several found" line for a kind that was overridden: the choice is
    # settled.
    assert "solution files found" not in out


def test_solution_override_repairs_verdict_and_trace_by_stem(results: Path, capsys) -> None:
    """`--solution naive.xml` re-pairs the verdict and trace to naive too.

    Without this the bundle would mix runs: the naive solution with the idm
    verdict.
    """
    _two_planners(results)
    shutil.copy(results / "naive.planning-trace.json", results / "idm.planning-trace.json")
    rc = main(["open", str(results), "--copy", "--solution", str(results / "naive.xml")])
    assert rc == 0
    out = capsys.readouterr().out
    assert f"solution: {results / 'naive.xml'}" in out
    assert f"verdict: {results / 'naive.verdict.json'}" in out
    assert f"trace: {results / 'naive.planning-trace.json'}" in out


def test_solution_override_keeps_explicit_verdict(results: Path, capsys) -> None:
    """An explicit `--verdict` wins: it is not re-paired by stem."""
    _two_planners(results)
    rc = main(
        [
            "open",
            str(results),
            "--copy",
            "--solution",
            str(results / "naive.xml"),
            "--verdict",
            str(results / "idm.verdict.json"),
        ]
    )
    assert rc == 0
    out = capsys.readouterr().out
    assert f"verdict: {results / 'idm.verdict.json'}" in out


def test_ambiguous_line_names_the_file_actually_used(results: Path, capsys) -> None:
    """The ambiguity line names the file **actually served**, not the first by
    name."""
    _two_planners(results)
    (results / "idm.xml").unlink()
    rc = main(["open", str(results), "--copy"])
    assert rc == 0
    out = capsys.readouterr().out
    lines = [line for line in out.splitlines() if "verdict files found" in line]
    assert len(lines) == 1
    # The solution is naive.xml, so it says naive is served, not idm.
    assert "using naive.verdict.json" in lines[0]
    assert "idm.verdict.json ignored" in lines[0]


def test_busy_port_exits_2_with_one_line(results: Path, capsys) -> None:
    """A port already in use is refused with one line and a next step, not a
    traceback."""
    import socket as sock_mod

    with sock_mod.socket() as holder:
        holder.bind(("127.0.0.1", 0))
        holder.listen(1)
        busy = holder.getsockname()[1]
        rc = main(["open", str(results), "--no-browser", "--port", str(busy)])
        assert rc == 2
        err = capsys.readouterr().err
        assert "Traceback" not in err
        assert f"127.0.0.1:{busy}" in err
        assert "--port" in err
        assert err.count("\n") == 1


# ---------------------------------------------------------------------------
# stale verdicts, and verdicts that appear later
# ---------------------------------------------------------------------------


def _set_mtime(path: Path, when: float) -> None:
    """Set the mtime explicitly. `_stat_mtime` folds in the size too, so keep
    the gaps whole seconds wide."""
    os.utime(path, (when, when))


def test_startup_does_not_serve_a_verdict_older_than_the_solution(
    results: Path, capsys
) -> None:
    """At startup a verdict older than the solution is left out of the URL, and
    one line names the command that recomputes it.

    Where the checker cannot run locally the verdict is always a file the user
    produced, typically in Docker, so rerunning the planner leaves a colliding
    solution sitting next to a PASS verdict. That pair is not served.
    """
    verdict = results / "planner_solution.verdict.json"
    now = time.time()
    _set_mtime(verdict, now - 60)
    _set_mtime(results / "planner_solution.xml", now)

    rc = main(["open", str(results), "--copy"])
    assert rc == 0
    out = capsys.readouterr().out
    lines = [ln for ln in out.splitlines() if ln.startswith("verdict:")]
    assert len(lines) == 1, out
    assert "is older than the solution and is not shown" in lines[0]
    assert "Recompute: drawtonomy-cr verdict" in lines[0]
    assert "cutin_commonroad.xml planner_solution.xml" in lines[0]
    # Not served means not listed by --copy either, so it cannot be picked up
    # and committed.
    assert f"verdict: {verdict}" not in out
    # The same failure is not told twice: no missing-checker line on top.
    assert "No verdict:" not in out


def test_startup_serves_a_verdict_newer_than_the_solution(results: Path, capsys) -> None:
    """The other way round - a verdict newer than the solution - is served."""
    now = time.time()
    _set_mtime(results / "planner_solution.xml", now - 60)
    _set_mtime(results / "planner_solution.verdict.json", now)
    rc = main(["open", str(results), "--copy"])
    assert rc == 0
    out = capsys.readouterr().out
    assert f"verdict: {results / 'planner_solution.verdict.json'}" in out
    assert "older than the solution" not in out


def test_watch_says_one_line_when_the_solution_makes_the_verdict_stale(
    server: ResultServer, results: Path
) -> None:
    """While watching, one line follows `changed: solution`, and that verdict is
    left out of `names` from then on."""
    now = time.time()
    _set_mtime(results / "planner_solution.xml", now - 60)
    _set_mtime(results / "planner_solution.verdict.json", now - 30)
    bundle, _ = build_bundle(results)
    assert bundle.verdict is not None
    calls: list[str] = []
    watcher = Watcher(
        bundle, server, on_message=calls.append, poll_interval=0.05, settle=0.05
    )
    watcher.start()
    client = _EventClient(server)
    try:
        assert _wait_until(lambda: server.broadcaster.count() == 1, 5)
        text = (results / "planner_solution.xml").read_text(encoding="utf-8")
        (results / "planner_solution.xml").write_text(text + "\n<!-- rerun -->\n", encoding="utf-8")
        assert _wait_until(lambda: len(calls) >= 2, 10), calls
        assert calls[0] == "changed: solution"
        assert calls[1].startswith("verdict: planner_solution.verdict.json is now older")
        assert "recompute: drawtonomy-cr verdict" in calls[1]
        # A withheld verdict is not named in the payload, so no stale verdict
        # can be fetched.
        assert _wait_until(lambda: client.data_payloads(), 10)
        payload = client.data_payloads()[0]
        assert payload["files"] == ["solution"]
        assert "verdict" not in payload["names"]
        assert bundle.verdict is None
    finally:
        client.close()
        watcher.stop()


def test_watch_picks_up_a_verdict_written_after_open_started(
    server: ResultServer, results: Path
) -> None:
    """A verdict written after `open` started arrives - the only route there is
    where the checker cannot run locally."""
    (results / "planner_solution.verdict.json").unlink()
    bundle, _ = build_bundle(results)
    assert bundle.verdict is None
    # A file that does not exist yet is watched under its expected name.
    assert bundle.expected_verdict.name == "planner_solution.verdict.json"
    assert "verdict" in bundle.watched()

    calls: list[str] = []
    watcher = Watcher(
        bundle, server, on_message=calls.append, poll_interval=0.05, settle=0.05
    )
    watcher.start()
    client = _EventClient(server)
    try:
        assert _wait_until(lambda: server.broadcaster.count() == 1, 5)
        (results / "planner_solution.verdict.json").write_text(
            '{"schema": "drawtonomy-verdict/1", "checks": []}\n', encoding="utf-8"
        )
        assert _wait_until(lambda: client.data_payloads(), 10), calls
        payload = client.data_payloads()[0]
        assert payload["files"] == ["verdict"]
        assert payload["names"] == {"verdict": "planner_solution.verdict.json"}
        assert bundle.verdict is not None
        assert "verdict: planner_solution.verdict.json" in calls
    finally:
        client.close()
        watcher.stop()
