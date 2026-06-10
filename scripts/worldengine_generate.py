#!/usr/bin/env python3
"""
调用官方 worldengine 包生成世界，输出 JSON（stdout）供 Electron 主进程读取。
用法见 --help
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Mindwerks/worldengine CLI：seed ∈ [0, uint16.max]，板块 ∈ [1, 100]
SEED_MAX = 65535
PLATES_MIN = 1
PLATES_MAX = 100
OFFICIAL_TEMPS = [0.874, 0.765, 0.594, 0.439, 0.366, 0.124]
OFFICIAL_HUMIDS = [0.941, 0.778, 0.507, 0.236, 0.073, 0.014, 0.002]


def normalize_seed(seed: int) -> int:
    return int(seed) % (SEED_MAX + 1)


def clamp_plates(plates: int) -> int:
    return max(PLATES_MIN, min(PLATES_MAX, int(plates)))


def biome_to_terrain(name: str) -> str:
    n = str(name).lower()
    if n in ("ocean", "sea"):
        return "ocean"
    if n == "ice" or "tundra" in n or "polar" in n:
        return "plain"
    if "desert" in n or "scrub" in n or "steppe" in n:
        return "desert"
    if "forest" in n or "woodland" in n or "jungle" in n:
        return "forest"
    if "wet" in n and "tundra" not in n:
        return "wetland"
    return "plain"


def sample_terrain_cells(world, grid: int = 64) -> list[dict]:
    w, h = world.width, world.height
    cells: list[dict] = []
    biome = world.biome
    for gy in range(grid):
        for gx in range(grid):
            px = min(w - 1, int((gx + 0.5) * w / grid))
            py = min(h - 1, int((gy + 0.5) * h / grid))
            b = str(biome[py, px])
            cells.append(
                {
                    "x": round(gx / grid * 100, 4),
                    "y": round(gy / grid * 100, 4),
                    "terrain": biome_to_terrain(b),
                    "climate": b,
                }
            )
    return cells


def main() -> int:
    parser = argparse.ArgumentParser(description="NovelsCreator WorldEngine bridge")
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--width", type=int, required=True)
    parser.add_argument("--height", type=int, required=True)
    parser.add_argument("--plates", type=int, default=10)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--satellite", action="store_true", default=True)
    parser.add_argument("--check", action="store_true", help="only verify import")
    args = parser.parse_args()
    args.seed = normalize_seed(args.seed)
    args.plates = clamp_plates(args.plates)

    try:
        import worldengine  # noqa: F401
        from worldengine.draw import draw_biome_on_file, draw_satellite_on_file
        from worldengine.plates import world_gen
        from worldengine.step import Step
        from worldengine.version import __version__
    except ImportError as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"worldengine 未安装: {exc}. 请运行 scripts/setup-worldengine.ps1",
                }
            )
        )
        return 1

    if args.check:
        print(json.dumps({"ok": True, "worldengineVersion": __version__}))
        return 0

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in args.name)[:64] or "world"

    try:
        world = world_gen(
            safe_name,
            args.width,
            args.height,
            args.seed,
            temps=OFFICIAL_TEMPS,
            humids=OFFICIAL_HUMIDS,
            num_plates=args.plates,
            ocean_level=1.0,
            step=Step.full(),
            fade_borders=True,
            verbose=False,
        )

        world_path = out / f"{safe_name}.world"
        with open(world_path, "wb") as f:
            f.write(world.protobuf_serialize())

        biome_path = out / f"{safe_name}_biome.png"
        draw_biome_on_file(world, str(biome_path))

        map_path = biome_path
        satellite_path = out / f"{safe_name}_satellite.png"
        if args.satellite:
            draw_satellite_on_file(world, str(satellite_path))
            map_path = satellite_path

        elevation_path = out / f"{safe_name}_elevation.png"
        try:
            from worldengine.draw import draw_simple_elevation_on_file

            draw_simple_elevation_on_file(world, str(elevation_path), sea_level=world.sea_level())
        except Exception:
            elevation_path = None

        terrain_cells = sample_terrain_cells(world, 64)

        print(
            json.dumps(
                {
                    "ok": True,
                    "worldengineVersion": __version__,
                    "worldName": safe_name,
                    "seed": args.seed,
                    "width": args.width,
                    "height": args.height,
                    "numPlates": args.plates,
                    "seaLevel": float(world.sea_level()),
                    "files": {
                        "world": str(world_path),
                        "map": str(map_path),
                        "biome": str(biome_path),
                        "satellite": str(satellite_path) if args.satellite else None,
                        "elevation": str(elevation_path) if elevation_path else None,
                    },
                    "terrainCells": terrain_cells,
                },
                ensure_ascii=False,
            )
        )
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
