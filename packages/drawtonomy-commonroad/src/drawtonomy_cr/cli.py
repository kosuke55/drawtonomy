"""
drawtonomy_cr.cli - the `drawtonomy-cr` command.

    drawtonomy-cr verdict <scenario.xml> <solution.xml> [-o out.json]
    drawtonomy-cr open <dir | scenario.xml> [--solution ...] [--no-browser] ...

A failing check is not a command failure: as long as the sidecar was written the
exit code is 0, because the FAIL lives inside the JSON. Only a missing official
checker exits 3, with a single line saying so.

Protocol: `docs/open-server-protocol.md`.
"""

import argparse
import sys
import time
from pathlib import Path

from .serve import (
    COMPANION_SUFFIX,
    DEFAULT_APP_ORIGIN,
    Bundle,
    ResultServer,
    Watcher,
    build_bundle,
    build_open_url,
    companion_for,
    recompute_hint,
    verdict_is_stale,
)
from .verdict import (
    CHECKER_MISSING_EXIT_CODE,
    CheckerNotInstalled,
    checker_available,
    write_verdict,
)


#: The next step appended to a SKIP line. The full reason lives in the verdict
#: JSON's `message`.
CHECK_SKIP_HINTS = {
    "boundary_collision": "pip install triangle",
}


def _cmd_verdict(args: argparse.Namespace) -> int:
    out_path = args.output or args.solution.with_suffix(".verdict.json")
    try:
        verdict = write_verdict(args.scenario, args.solution, out_path)
    except CheckerNotInstalled as e:
        # A failure is told once, in one place: no traceback, no second wording.
        print(str(e), file=sys.stderr)
        return CHECKER_MISSING_EXIT_CODE

    for check in verdict["checks"]:
        extra = ""
        if check["status"] == "SKIP":
            # A line that could not be judged carries its next step in
            # parentheses, the same way the exit-3 message does. The long reason
            # stays in the verdict JSON's `message`.
            extra = f" ({CHECK_SKIP_HINTS.get(check['name'], 'not computed')})"
        elif "timeSteps" in check:
            first, last = check["timeSteps"]
            extra = f" t={first}..{last}"
            if "obstacleId" in check:
                extra += f" obstacle={check['obstacleId']}"
        elif "message" in check:
            extra = f" {check['message']}"
        print(f"[{check['status']}] {check['name']}{extra}")
    print(f"wrote {out_path}")
    return 0


def _override(bundle: Bundle, key: str, value: Path | None) -> str | None:
    """Override a sniffed pick (`--solution` and friends). A missing file is
    refused with a single line."""
    if value is None:
        return None
    path = value.resolve()
    if not path.is_file():
        return f"{value} does not exist."
    setattr(bundle, key, path)
    if bundle.ambiguous:
        bundle.ambiguous.pop(key, None)
    return None


def _repair_companions(bundle: Bundle, explicit: dict[str, Path | None]) -> None:
    """When `--solution` replaced the solution, re-pick verdict / trace by **that
    solution's stem**.

    Sniffing already pairs companions around the solution (`pair_companions`),
    but `--solution` is applied afterwards. Without re-pairing here the bundle
    would mix planners: the solution from one run and the trace from another.
    Anything the user named explicitly (`--verdict` / `--trace`) is left alone.
    """
    solution = bundle.solution
    if solution is None or explicit.get("solution") is None:
        return
    for kind in COMPANION_SUFFIX:
        if explicit.get(kind) is not None:
            continue
        names = (bundle.ambiguous or {}).get(kind)
        # A kind with a single candidate never appears in `ambiguous`, so treat
        # the current pick as the candidate list in that case.
        current = getattr(bundle, kind)
        candidates = (
            [bundle.root / n for n in names] if names else ([current] if current else [])
        )
        matched = companion_for(solution, kind, candidates)
        if matched is not None and matched != current:
            setattr(bundle, kind, matched)


def _drop_stale_verdict(bundle: Bundle, log) -> None:
    """Do not serve a user-provided verdict that is older than the solution, and
    say so in one line.

    Where the checker cannot be installed locally the verdict is
    always a file the user produced themselves, typically in Docker, so rerunning
    the planner leaves the solution newer than the verdict. Serving it anyway
    would show a colliding solution next to a PASS verdict in the tab, and would
    let that pair slip into a commit. Instead it is withheld, and the line names
    the command that recomputes it. Watching continues, so a regenerated verdict
    is picked up immediately.
    """
    if not verdict_is_stale(bundle.verdict, bundle.solution, bundle.verdict_is_ours):
        return
    stale = bundle.verdict
    bundle.stale_verdict = stale
    bundle.verdict = None
    log(
        f"verdict: {stale.name} is older than the solution and is not shown. "
        f"Recompute: {recompute_hint(bundle)}"
    )


def _ensure_verdict(bundle: Bundle, log) -> None:
    """Compute the verdict when there is none, there is a solution, and the
    checker is installed.

    A missing checker is not a failure (it only installs on Linux x86_64):
    one line, then carry on - the app still shows its own collision
    badge.

    When a stale verdict was just withheld this stays silent, because
    `_drop_stale_verdict` already named the command to recompute it and repeating
    it would tell the same failure twice. If the checker is available the verdict
    is simply recomputed and overwrites the stale file.
    """
    if bundle.verdict is not None or bundle.solution is None:
        return
    if bundle.stale_verdict is not None and not checker_available():
        return
    # Naming rule: `<solution stem>.verdict.json`, next to the solution.
    out = bundle.solution.parent / f"{bundle.solution.stem}.verdict.json"
    try:
        write_verdict(bundle.scenario, bundle.solution, out)
    except CheckerNotInstalled:
        log(
            "No verdict: the official checker is not installed, so the scenario opens "
            'without it (install with: pip install "drawtonomy-commonroad[checker]", '
            "Linux x86_64 only)."
        )
        return
    except Exception as e:  # told once, in one place: no traceback
        log(f"No verdict: could not compute it ({e}); the scenario opens without it.")
        return
    bundle.verdict = out
    bundle.verdict_is_ours = True
    bundle.stale_verdict = None
    log(f"verdict: {out.name}")


def _cmd_open(args: argparse.Namespace) -> int:
    bundle, error = build_bundle(args.target)
    if bundle is None:
        print(error, file=sys.stderr)
        return 2
    explicit = {key: getattr(args, key) for key in ("solution", "verdict", "trace")}
    for key in ("solution", "verdict", "trace"):
        err = _override(bundle, key, explicit[key])
        if err:
            print(err, file=sys.stderr)
            return 2
    _repair_companions(bundle, explicit)

    def log(line: str) -> None:
        # While watching, a line is useless unless it appears immediately, so
        # always flush: piped output is block-buffered otherwise and nothing
        # shows up until Ctrl+C.
        print(line, flush=True)

    # Never pick silently between candidates: say in one line which one is
    # served. Companions are paired by the solution's stem rather than by name
    # order, so this reports the name that was **actually** picked - hard-coding
    # `names[0]` could claim one file while serving another.
    for kind, names in (bundle.ambiguous or {}).items():
        used = getattr(bundle, kind, None)
        used_name = used.name if used is not None else names[0]
        rest = [n for n in names if n != used_name]
        log(f"{len(names)} {kind} files found; using {used_name} ({', '.join(rest)} ignored)")

    _drop_stale_verdict(bundle, log)
    _ensure_verdict(bundle, log)

    if args.copy:
        # Fallback: start no server, print absolute paths only. For browsers
        # that refuse to read http://127.0.0.1 from an https page (Safari), the
        # user drops these files onto drawtonomy instead.
        for key in ("scenario", "solution", "verdict", "trace"):
            path = getattr(bundle, key)
            if path is not None:
                print(f"{key}: {path}")
        print("Drop these files onto drawtonomy.com to see the result.")
        return 0

    try:
        server = ResultServer(bundle.root, args.app_origin, port=args.port)
    except OSError as e:
        # Told once, in one place. A port already in use (an earlier `open`
        # still running, or another server) is by far the common case, so the
        # message carries the next step.
        print(
            f"Could not listen on 127.0.0.1:{args.port} ({e.strerror or e}). "
            "Use a different --port, or omit --port to pick a free one.",
            file=sys.stderr,
        )
        return 2
    server.serve_in_thread()
    url = build_open_url(bundle, server.origin, args.app_origin)

    recompute = None
    if bundle.verdict_is_ours and bundle.solution is not None:
        scenario, solution, out = bundle.scenario, bundle.solution, bundle.verdict

        def recompute() -> bool:  # noqa: F811
            try:
                write_verdict(scenario, solution, out)
                return True
            except Exception:
                # A failed recomputation must not stop watching; the solution
                # change is still announced.
                return False

    watcher = Watcher(bundle, server, recompute_verdict=recompute, on_message=log)
    watcher.start()

    for key in ("solution", "verdict", "trace"):
        rel = bundle.rel(getattr(bundle, key))
        if rel:
            log(f"{key}: {rel}")
    log(f"serving {bundle.root} at {server.origin}")
    log(url)
    log(
        "Open the URL in Chrome or Firefox "
        "(Safari blocks http://127.0.0.1 from an https page)."
    )
    log("Watching for changes. Press Ctrl+C to stop.")

    if not args.no_browser:
        import webbrowser

        webbrowser.open(url)

    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("Stopped.")
    finally:
        watcher.stop()
        server.shutdown_all()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="drawtonomy-cr",
        description="CommonRoad connector for drawtonomy",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_verdict = sub.add_parser(
        "verdict",
        help="write the official CommonRoad checker verdict next to a solution",
    )
    p_verdict.add_argument("scenario", type=Path, help="CommonRoad scenario XML")
    p_verdict.add_argument("solution", type=Path, help="CommonRoad solution XML")
    p_verdict.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="output path (default: <solution stem>.verdict.json next to the solution)",
    )
    p_verdict.set_defaults(func=_cmd_verdict)

    p_open = sub.add_parser(
        "open",
        help="serve the results on 127.0.0.1 and open them in drawtonomy (watches for changes)",
    )
    p_open.add_argument(
        "target",
        type=Path,
        help="result directory, or the CommonRoad scenario XML inside it",
    )
    p_open.add_argument(
        "--solution", type=Path, default=None, help="CommonRoad solution XML (default: sniffed)"
    )
    p_open.add_argument(
        "--verdict", type=Path, default=None, help="verdict sidecar JSON (default: sniffed)"
    )
    p_open.add_argument(
        "--trace", type=Path, default=None, help="planning trace JSON (default: sniffed)"
    )
    p_open.add_argument(
        "--no-browser", action="store_true", help="print the URL without opening a browser"
    )
    p_open.add_argument(
        "--port", type=int, default=0, help="local port (default: 0 = pick a free one)"
    )
    p_open.add_argument(
        "--copy",
        action="store_true",
        help="print the file paths instead of serving them (fallback for browsers "
        "that block http://127.0.0.1 from an https page, e.g. Safari)",
    )
    p_open.add_argument(
        "--app-origin",
        default=DEFAULT_APP_ORIGIN,
        help=f"drawtonomy origin allowed to read the files (default: {DEFAULT_APP_ORIGIN})",
    )
    p_open.set_defaults(func=_cmd_open)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
