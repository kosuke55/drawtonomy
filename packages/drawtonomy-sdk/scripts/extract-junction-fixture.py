#!/usr/bin/env python3
"""Extract a self-contained xodr slice from Town04 for the sliver regression.

Pulls junction 106 with its connecting roads (incl. road 107) and the linked
mainlines, closing one hop of road-level links so the welded contact clusters
that collapse the sliver are present. Output is a few-road, ~100 KB xodr that
still reproduces the degenerate-sliver collapse on import.

Usage: python3 extractJunction.py <town04.xodr> [out.xodr]
  <town04.xodr> is a full CARLA Town04 source (MIT-licensed). Pass the source
  path explicitly; it is not vendored in this repo.
"""
import re
import sys

if len(sys.argv) < 2:
    sys.exit("usage: extractJunction.py <town04.xodr> [out.xodr]")
SRC = sys.argv[1]

xml = open(SRC, encoding="utf-8").read()

# Index every <road ...> ... </road> block by id.
road_blocks = {}
for m in re.finditer(r'<road\b[^>]*\bid="([^"]+)"[^>]*>.*?</road>', xml, re.S):
    road_blocks[m.group(1)] = m.group(0)

def links_of(block):
    ids = set()
    for mm in re.finditer(r'element(?:Type)?="road"\s+elementId="([^"]+)"', block):
        ids.add(mm.group(1))
    for mm in re.finditer(r'<(?:predecessor|successor)\b[^>]*elementId="([^"]+)"[^>]*elementType="road"', block):
        ids.add(mm.group(1))
    return ids

# Pull the whole junction 106: every connecting road + every incoming road,
# then transitively close one hop of road-level links so all welded contacts
# are present (this is what reshapes the clusters that collapse the sliver).
jm = re.search(r'<junction\b[^>]*\bid="106"[^>]*>.*?</junction>', xml, re.S)
jb = jm.group(0)
junction_min = "    " + jb

wanted = set()
for mm in re.finditer(r'connectingRoad="([^"]+)"', jb):
    wanted.add(mm.group(1))
for mm in re.finditer(r'incomingRoad="([^"]+)"', jb):
    wanted.add(mm.group(1))

# One hop of road-link closure so predecessor/successor mainlines are present.
frontier = set(wanted)
for _ in range(1):
    nxt = set()
    for rid in list(frontier):
        if rid in road_blocks:
            for l in links_of(road_blocks[rid]):
                if l not in wanted and l in road_blocks:
                    nxt.add(l)
    wanted |= nxt
    frontier = nxt
    if not nxt:
        break
wanted = {r for r in wanted if r in road_blocks}

header_m = re.search(r'<header\b.*?</header>', xml, re.S)
header = header_m.group(0)

ordered = sorted(wanted, key=lambda r: int(r) if r.lstrip("-").isdigit() else 1 << 30)

def slim(block):
    # Strip sub-elements that do not affect 2D lane geometry / connectivity:
    # elevation/lateral profiles (flattened on import anyway) and RoadRunner
    # <userData>. Keeps planView + lanes + links intact.
    for tag in ("elevationProfile", "lateralProfile", "userData"):
        block = re.sub(rf"\s*<{tag}\b.*?</{tag}>", "", block, flags=re.S)
        block = re.sub(rf"\s*<{tag}\b[^>]*/>", "", block, flags=re.S)
    block = re.sub(r"\n\s*\n", "\n", block)
    return block

header = slim(header)
out = ['<?xml version="1.0" encoding="UTF-8"?>', "<OpenDRIVE>", "    " + header]
for rid in ordered:
    out.append(slim(road_blocks[rid]))
out.append(junction_min)
out.append("</OpenDRIVE>")
result = "\n".join(out)

import os
dst = (
    sys.argv[2]
    if len(sys.argv) > 2
    else os.path.join(
        os.path.dirname(__file__), "..", "__tests__", "fixtures", "town04-junction106.xodr"
    )
)
open(dst, "w", encoding="utf-8").write(result)
print(f"wrote {dst}  ({len(result)} bytes)  roads={ordered}")
