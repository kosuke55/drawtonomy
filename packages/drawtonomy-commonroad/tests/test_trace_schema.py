"""`planning-trace-v1.schema.json` as the single source for the format's shape.

The three descriptions of this format - the SDK spec, the app's parser and the
docs site - disagreed about `candidates` because each was written by hand. The
schema file is now the one the writer's self-check validates against and the one
drawtonomy's fixture tests read, so a disagreement has to be a code change
somewhere rather than a stale paragraph.
"""
import copy
import json

import pytest

from drawtonomy_cr import schema as schema_module
from drawtonomy_cr.schema import (
    SCHEMA_PATH,
    SUPPORTED_KEYWORDS,
    TraceSchemaError,
    _unsupported_keywords,
    load_schema,
    schema_failures,
    validate,
)
from drawtonomy_cr.trace import SCHEMA_PATH as TRACE_SCHEMA_PATH


def trace_fixtures(fixtures):
    return sorted(fixtures.glob("*.planning-trace.json")) + sorted(
        fixtures.glob("planner-candidates/*.json")
    )


# --- the file ships and is reachable --------------------------------------


def test_the_schema_is_packaged_next_to_the_modules():
    assert SCHEMA_PATH.is_file()
    assert SCHEMA_PATH.name == "planning-trace-v1.schema.json"
    assert TRACE_SCHEMA_PATH == SCHEMA_PATH


def test_the_schema_describes_this_schema_string():
    assert load_schema()["properties"]["schema"]["const"] == (
        "drawtonomy-planning-trace-v1"
    )


# --- every committed fixture validates ------------------------------------


def test_there_are_fixtures_to_validate(fixtures):
    """A silently empty glob would make the test below pass over nothing."""
    assert len(trace_fixtures(fixtures)) >= 5


def test_every_committed_fixture_validates(fixtures):
    for path in trace_fixtures(fixtures):
        trace = json.loads(path.read_text(encoding="utf-8"))
        assert schema_failures(trace) == [], path.name


def test_the_candidates_fixture_really_carries_candidates(fixtures):
    """Guards the test above from validating a file that lost its candidates."""
    trace = json.loads(
        (fixtures / "planner-candidates" / "cutin_solution.planning-trace.json").read_text(
            encoding="utf-8"
        )
    )
    candidates = [c for p in trace["tracks"][0]["plans"] for c in p.get("candidates", [])]
    assert len(candidates) > 100
    assert any("cost" in c for c in candidates)
    assert any(c.get("feasible") is False for c in candidates)


# --- the additive policy --------------------------------------------------


def valid_trace():
    return {
        "schema": "drawtonomy-planning-trace-v1",
        "frame": "center",
        "tracks": [
            {
                "role": "ego",
                "driven": [{"t": 0.0, "x": 0.0, "y": 0.0}],
                "plans": [{"t": 0.0, "states": [{"t": 0.0, "x": 0.0, "y": 0.0}]}],
            }
        ],
    }


def test_an_unknown_field_still_validates():
    """v1 is additive: a producer can start emitting something new without
    breaking any reader, at every level."""
    trace = valid_trace()
    trace["somethingNew"] = {"anything": 1}
    trace["tracks"][0]["somethingNew"] = "free"
    trace["tracks"][0]["plans"][0]["somethingNew"] = [1, 2]
    trace["tracks"][0]["driven"][0]["a"] = 0.5
    assert schema_failures(trace) == []


def test_a_malformed_candidate_does_not_validate():
    trace = valid_trace()
    trace["tracks"][0]["plans"][0]["candidates"] = [{"cost": 1.0}]
    failures = schema_failures(trace)
    assert failures and "states" in failures[0]
    with pytest.raises(TraceSchemaError, match="states"):
        validate(trace)


#: Each case mutates a valid trace into something v1 forbids, and names the
#: JSON path the complaint has to be about. The wording is not pinned: this runs
#: against `jsonschema` when it is installed and the bundled fallback when it is
#: not, and the two phrase the same refusal differently. What both must agree on
#: is that the file is refused, and where.
FORBIDDEN = [
    ("no schema string", lambda t: t.pop("schema"), "<root>"),
    ("a v2 schema string",
     lambda t: t.__setitem__("schema", "drawtonomy-planning-trace-v2"), "['schema']"),
    ("an unknown frame", lambda t: t.__setitem__("frame", "world"), "['frame']"),
    ("no tracks", lambda t: t.__setitem__("tracks", []), "['tracks']"),
    ("both role and name",
     lambda t: t["tracks"][0].__setitem__("name", "Ego"), "['tracks'][0]"),
    ("neither role nor name", lambda t: t["tracks"][0].pop("role"), "['tracks'][0]"),
    ("nothing driven",
     lambda t: t["tracks"][0].__setitem__("driven", []), "['tracks'][0]['driven']"),
    ("no plans",
     lambda t: t["tracks"][0].__setitem__("plans", []), "['tracks'][0]['plans']"),
    ("a state without a position",
     lambda t: t["tracks"][0]["driven"][0].pop("x"), "['tracks'][0]['driven'][0]"),
    ("a fingerprint of the wrong shape",
     lambda t: t.__setitem__("solutionFingerprint", "sha256:nope"),
     "['solutionFingerprint']"),
    ("a fingerprint that is not a string",
     lambda t: t.__setitem__("scenarioFingerprint", 7), "['scenarioFingerprint']"),
    ("a vehicle of zero length",
     lambda t: t["tracks"][0].__setitem__("vehicle", {"length": 0, "width": 1.8}),
     "['tracks'][0]['vehicle']"),
]


@pytest.mark.parametrize(
    "mutate,where", [(m, w) for _, m, w in FORBIDDEN], ids=[n for n, _, _ in FORBIDDEN]
)
def test_the_schema_refuses_what_v1_forbids(mutate, where):
    trace = valid_trace()
    mutate(trace)
    failures = schema_failures(trace)
    assert failures, "expected the schema to refuse this trace"
    assert any(failure.startswith(where) for failure in failures), failures


def test_a_fingerprint_of_the_right_shape_validates():
    trace = valid_trace()
    trace["solutionFingerprint"] = "sha256:" + "0" * 64
    trace["scenarioFingerprint"] = "sha256:" + "a" * 64
    assert schema_failures(trace) == []


# --- the fallback validator stays honest ----------------------------------


def test_the_fallback_implements_every_keyword_the_schema_uses():
    """`jsonschema` is optional, so the schema must not grow a keyword the
    fallback would silently ignore. Add the keyword to `_validate` when it does."""
    assert _unsupported_keywords(load_schema()) == set()
    assert SUPPORTED_KEYWORDS  # the list is not empty by accident


def test_the_fallback_and_jsonschema_agree_on_every_fixture(fixtures, monkeypatch):
    """Whichever implementation runs, a committed fixture validates."""
    jsonschema = pytest.importorskip("jsonschema")
    assert jsonschema
    for path in trace_fixtures(fixtures):
        trace = json.loads(path.read_text(encoding="utf-8"))
        with_library = schema_failures(trace)
        monkeypatch.setitem(__import__("sys").modules, "jsonschema", None)
        without_library = schema_failures(trace)
        monkeypatch.undo()
        assert with_library == [] == without_library, path.name


def test_the_fallback_runs_when_jsonschema_is_missing(monkeypatch):
    """The path CI actually takes: the package has no jsonschema dependency."""
    import builtins

    real_import = builtins.__import__

    def no_jsonschema(name, *args, **kwargs):
        if name == "jsonschema":
            raise ImportError("no jsonschema")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", no_jsonschema)
    assert schema_failures(valid_trace()) == []
    broken = copy.deepcopy(valid_trace())
    broken["frame"] = "world"
    assert schema_failures(broken)


# --- the spec's field tables and the schema say the same thing ------------

DOCS = SCHEMA_PATH.parents[2] / "docs"

#: Each of the spec's field tables, and the schema node it describes. The point
#: of the schema file was that these two stop drifting apart, which only holds
#: while something compares them.
TABLES = {
    "### Top level": [],
    "### `tracks[]`": ["tracks"],
    "### `tracks[].vehicle`": ["tracks", "vehicle"],
    "### `plans[]`": ["tracks", "plans"],
    "### `plans[].states[]`": ["tracks", "plans", "states"],
    "### `plans[].candidates[]`": ["tracks", "plans", "candidates"],
}


def schema_node(path):
    """Walk `path` through the schema, following $ref and array items."""
    schema = load_schema()

    def deref(node):
        while "$ref" in node:
            target = schema
            for part in node["$ref"][2:].split("/"):
                target = target[part]
            node = target
        return node

    node = deref(schema)
    for name in path:
        node = deref(node["properties"][name])
        if node.get("type") == "array":
            node = deref(node["items"])
    return node


def table_fields(text, heading):
    """The `Field` column of the markdown table under `heading`."""
    body = text.split(heading, 1)[1]
    fields = []
    for line in body.splitlines():
        line = line.strip()
        if not line.startswith("|"):
            if fields:
                break
            continue
        cell = line.split("|")[1].strip()
        if cell in ("Field", "") or set(cell) <= set("- :"):
            continue
        fields.append(cell.strip("`"))
    return fields


@pytest.mark.parametrize("heading", sorted(TABLES))
def test_the_spec_table_lists_exactly_the_schema_properties(heading):
    spec = (DOCS / "planning-trace-format.md").read_text(encoding="utf-8")
    documented = set(table_fields(spec, heading))
    described = set(schema_node(TABLES[heading]).get("properties", {}))
    assert documented == described, (
        f"{heading}: documented but not in the schema {sorted(documented - described)}; "
        f"in the schema but undocumented {sorted(described - documented)}"
    )


def test_the_spec_no_longer_calls_candidates_reserved():
    spec = (DOCS / "planning-trace-format.md").read_text(encoding="utf-8")
    assert "reserved" not in spec.lower()


@pytest.mark.parametrize(
    "spec", ["planning-trace-format.md", "planning-trace-format.ja.md"]
)
def test_the_specs_example_validates_against_the_schema(spec):
    """The example a reader copies has to be a file the writer would accept."""
    import re

    text = (DOCS / spec).read_text(encoding="utf-8")
    block = re.search(r"```json\n(.*?)\n```", text, re.S)
    assert block, f"{spec}: no JSON example found"
    assert schema_failures(json.loads(block.group(1))) == []
