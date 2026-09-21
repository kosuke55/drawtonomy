"""
drawtonomy_cr.schema - validating a planning trace against
`planning-trace-v1.schema.json`.

The schema file is the single source for the shape of the format: the writer's
self-check validates against it, drawtonomy's fixture tests validate against the
same file, and the field tables in `docs/planning-trace-format.md` are checked
against it by a test. Three hand-maintained descriptions of one format is how
they came to disagree about `candidates` in the first place.

`jsonschema` is used when it is installed. It is **not** a dependency: this
package exists to be dropped next to a planner, and one required import for one
shape check is not worth the install. The fallback below walks the same schema
file and understands the keywords it uses - no more, so the schema cannot grow a
keyword the fallback quietly ignores: `_unsupported_keywords()` lists any, and a
test fails when one appears.
"""

import json
import math
from pathlib import Path

#: The schema this package ships, as data next to the modules.
SCHEMA_PATH = Path(__file__).with_name("planning-trace-v1.schema.json")

#: Keywords `_validate` implements. Anything else in the schema is a keyword
#: nobody checks, which a test refuses to let happen.
SUPPORTED_KEYWORDS = frozenset(
    {
        "$schema", "$id", "$ref", "$defs", "title", "description",
        "type", "const", "enum", "properties", "required", "items",
        "minItems", "minLength", "pattern", "minimum", "exclusiveMinimum",
        "oneOf", "not",
    }
)

_TYPES = {
    "object": dict,
    "array": list,
    "string": str,
    "boolean": bool,
    "number": (int, float),
    "integer": int,
}


class TraceSchemaError(Exception):
    """The trace does not match `planning-trace-v1.schema.json`."""


def load_schema() -> dict:
    """The schema, as a dict."""
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def schema_failures(trace) -> list:
    """Every way `trace` departs from the schema, as messages naming the path.

    Empty when it validates. Uses `jsonschema` when installed, so the
    authoritative implementation wins wherever it is available.
    """
    schema = load_schema()
    try:
        import jsonschema
    except ImportError:
        return _validate(trace, schema, schema, "")
    validator = jsonschema.Draft202012Validator(schema)
    return [
        f"{_json_path(error.absolute_path)}: {error.message}"
        for error in sorted(validator.iter_errors(trace), key=lambda e: list(e.absolute_path))
    ]


def validate(trace) -> None:
    """Raise `TraceSchemaError` listing everything wrong, or return."""
    failures = schema_failures(trace)
    if failures:
        raise TraceSchemaError("; ".join(failures))


def _json_path(parts) -> str:
    path = "".join(f"[{p!r}]" if isinstance(p, str) else f"[{p}]" for p in parts)
    return path or "<root>"


def _unsupported_keywords(schema, seen=None) -> set:
    """Keywords used anywhere in the schema that `_validate` does not implement."""
    found = set()
    if isinstance(schema, dict):
        for key, value in schema.items():
            if key in ("properties", "$defs"):
                for sub in value.values():
                    found |= _unsupported_keywords(sub)
                continue
            if key not in SUPPORTED_KEYWORDS:
                found.add(key)
            if isinstance(value, (dict, list)):
                found |= _unsupported_keywords(value)
    elif isinstance(schema, list):
        for item in schema:
            found |= _unsupported_keywords(item)
    return found


def _resolve(node: dict, root: dict) -> dict:
    """Follow a local `$ref` (`#/$defs/name`); this schema uses no other kind."""
    ref = node.get("$ref")
    if ref is None:
        return node
    if not ref.startswith("#/"):
        raise TraceSchemaError(f"unsupported $ref {ref!r}: only local refs are used")
    target = root
    for part in ref[2:].split("/"):
        target = target[part]
    merged = {k: v for k, v in node.items() if k != "$ref"}
    return {**target, **merged}


def _validate(value, node: dict, root: dict, path: str) -> list:
    """Collect every failure under `path`, rather than stopping at the first:
    a producer fixing its writer wants the whole list."""
    node = _resolve(node, root)
    where = path or "<root>"
    failures = []

    expected = node.get("type")
    if expected is not None:
        python_type = _TYPES[expected]
        ok = isinstance(value, python_type) and not (
            expected in ("number", "integer") and isinstance(value, bool)
        )
        if not ok:
            return [f"{where}: expected {expected}, got {type(value).__name__}"]
        if expected == "number" and not math.isfinite(float(value)):
            # JSON has no infinity or NaN. `jsonschema` lets Python's float("inf")
            # through as a number, so the message differs slightly there; what
            # matters is that neither implementation accepts the written file,
            # because json.dumps writes `Infinity`, which no JSON reader takes.
            return [f"{where}: expected a finite number, got {value!r}"]

    if "const" in node and value != node["const"]:
        failures.append(f"{where}: expected {node['const']!r}, got {value!r}")
    if "enum" in node and value not in node["enum"]:
        failures.append(f"{where}: expected one of {node['enum']!r}, got {value!r}")
    if "pattern" in node and isinstance(value, str):
        import re

        if not re.search(node["pattern"], value):
            failures.append(f"{where}: {value!r} does not match {node['pattern']}")
    if "minLength" in node and isinstance(value, str) and len(value) < node["minLength"]:
        failures.append(f"{where}: shorter than {node['minLength']} characters")
    if "minimum" in node and isinstance(value, (int, float)) and value < node["minimum"]:
        failures.append(f"{where}: {value} is below {node['minimum']}")
    if (
        "exclusiveMinimum" in node
        and isinstance(value, (int, float))
        and value <= node["exclusiveMinimum"]
    ):
        failures.append(f"{where}: {value} is not above {node['exclusiveMinimum']}")

    if isinstance(value, dict):
        for name in node.get("required", []):
            if name not in value:
                failures.append(f"{where}: missing {name!r}")
        for name, sub in node.get("properties", {}).items():
            if name in value:
                failures.extend(_validate(value[name], sub, root, f"{path}[{name!r}]"))
        # No additionalProperties anywhere: v1 is additive, and an unknown field
        # is how a producer starts emitting something new without breaking
        # every reader.

    if isinstance(value, list):
        if "minItems" in node and len(value) < node["minItems"]:
            failures.append(f"{where}: needs at least {node['minItems']} item(s)")
        item_schema = node.get("items")
        if item_schema is not None:
            for index, item in enumerate(value):
                failures.extend(_validate(item, item_schema, root, f"{path}[{index}]"))

    if "not" in node and not _validate(value, node["not"], root, path):
        failures.append(f"{where}: matches a shape the schema forbids")
    if "oneOf" in node:
        matched = sum(
            1 for option in node["oneOf"] if not _validate(value, option, root, path)
        )
        if matched != 1:
            failures.append(
                f"{where}: matches {matched} of the {len(node['oneOf'])} allowed "
                "shapes, expected exactly one"
            )

    return failures
