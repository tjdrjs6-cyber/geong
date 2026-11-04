#!/usr/bin/env python3
"""Blend only the residual end-to-start pose mismatch into an animation's first frames."""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

COMPONENTS = {5126: ("f", 4)}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
WINDOW = 8


def chunks(data: bytes):
    if data[:4] != b"glTF":
        raise ValueError("Not a GLB file")
    version, total = struct.unpack_from("<II", data, 4)
    if version != 2 or total != len(data):
        raise ValueError("Only complete GLB v2 input is supported")
    result = []
    offset = 12
    while offset < len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        result.append((kind, data[offset:offset + size]))
        offset += size
    return result


def read_values(binary: bytearray, doc: dict, accessor_index: int):
    accessor = doc["accessors"][accessor_index]
    fmt, bytes_per_component = COMPONENTS[accessor["componentType"]]
    width = WIDTHS[accessor["type"]]
    view = doc["bufferViews"][accessor["bufferView"]]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", width * bytes_per_component)
    values = []
    for index in range(accessor["count"]):
        values.append(list(struct.unpack_from("<" + fmt * width, binary, base + index * stride)))
    return values, base, stride, width


def normalized_mix(start, current, amount):
    # nlerp follows the shorter hemisphere; output stays a valid unit quaternion.
    dot = sum(a * b for a, b in zip(start, current))
    target = current if dot >= 0 else [-value for value in current]
    mixed = [a + (b - a) * amount for a, b in zip(start, target)]
    magnitude = math.sqrt(sum(value * value for value in mixed)) or 1.0
    return [value / magnitude for value in mixed]


def repair(source: Path, destination: Path):
    parsed = chunks(source.read_bytes())
    doc = json.loads(next(payload for kind, payload in parsed if kind == 0x4E4F534A).rstrip(b"\0 \t\r\n"))
    binary = bytearray(next(payload for kind, payload in parsed if kind == 0x004E4942))
    modified = 0
    for animation in doc.get("animations", []):
        for channel in animation.get("channels", []):
            sampler = animation["samplers"][channel["sampler"]]
            interpolation = sampler.get("interpolation", "LINEAR")
            if interpolation != "LINEAR":
                continue
            input_accessor = doc["accessors"][sampler["input"]]
            output_accessor = doc["accessors"][sampler["output"]]
            count = input_accessor["count"]
            if count < WINDOW + 2 or output_accessor["count"] != count:
                continue
            if output_accessor.get("componentType") != 5126:
                continue
            values, base, stride, width = read_values(binary, doc, sampler["output"])
            first = values[0]
            end = values[-1]
            is_rotation = channel["target"]["path"] == "rotation" and width == 4
            # Pin the first key to the exact final pose, then blend back to the untouched
            # source trajectory across the next eight keys (~0.27 seconds at 30 fps).
            values[0] = end[:]
            for index in range(1, WINDOW):
                amount = index / WINDOW
                values[index] = normalized_mix(end, values[index], amount) if is_rotation else [
                    a + (b - a) * amount for a, b in zip(end, values[index])
                ]
            for index, row in enumerate(values[:WINDOW]):
                struct.pack_into("<" + "f" * width, binary, base + index * stride, *row)
            output_accessor["min"] = [min(row[i] for row in values) for i in range(width)]
            output_accessor["max"] = [max(row[i] for row in values) for i in range(width)]
            modified += 1
    if not modified:
        raise ValueError(f"No eligible LINEAR tracks in {source}")
    new_chunks = []
    for kind, payload in parsed:
        if kind == 0x4E4F534A:
            payload = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            payload += b" " * ((-len(payload)) % 4)
        elif kind == 0x004E4942:
            payload = bytes(binary)
        new_chunks.append((kind, payload))
    output = bytearray(b"glTF" + struct.pack("<II", 2, 0))
    for kind, payload in new_chunks:
        output += struct.pack("<II", len(payload), kind) + payload
    struct.pack_into("<I", output, 8, len(output))
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(output)
    print(f"{source.name} -> {destination.name}: blended {modified} LINEAR tracks across {WINDOW} start keys")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: repair_loop_seam.py input.glb output.glb")
    repair(Path(sys.argv[1]), Path(sys.argv[2]))
