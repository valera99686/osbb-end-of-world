"""Casting helper for the voices: measures reference clips and designs candidates.

Run it with the Python of the OmniVoice environment.

    python scripts/voice/cast.py                      # table for the clips in refs/
    python scripts/voice/cast.py --sweep 6            # 6 candidate voices per speaker into refs/cast/
    python scripts/voice/cast.py --sweep 6 --only danilo,marta
    python scripts/voice/cast.py --pick cast.json     # take, per speaker, the candidate closest to its target

For every clip it prints the median pitch (Hz), the brightness (spectral
centroid, Hz) and the pace (letters per second). Two voices that sit close in
all three sound alike; `pairs` lists the closest pairs so they can be pushed
apart in voices.json (instruct, seed, speed, fx).
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent


def features(path: Path, text: str) -> dict:
    import librosa

    y, sr = librosa.load(str(path), sr=16000)
    trimmed, _ = librosa.effects.trim(y, top_db=35)
    f0, voiced, _ = librosa.pyin(trimmed, fmin=60, fmax=450, sr=sr, frame_length=1024)
    f0 = f0[voiced & ~np.isnan(f0)]
    letters = sum(ch.isalpha() for ch in text)
    seconds = max(0.1, len(trimmed) / sr)
    mfcc = librosa.feature.mfcc(y=trimmed, sr=sr, n_mfcc=13)[1:].mean(axis=1)
    return {
        "f0": float(np.median(f0)) if len(f0) else 0.0,
        "f0_spread": float(np.std(12 * np.log2(f0 / np.median(f0)))) if len(f0) > 5 else 0.0,
        "bright": float(librosa.feature.spectral_centroid(y=trimmed, sr=sr).mean()),
        "pace": letters / seconds,
        "seconds": seconds,
        "mfcc": mfcc.tolist(),
    }


def distance(a: dict, b: dict) -> float:
    """A rough 'how alike do they sound' number: pitch in semitones, brightness, timbre."""
    semis = abs(12 * np.log2(max(a["f0"], 1) / max(b["f0"], 1)))
    bright = abs(a["bright"] - b["bright"]) / 400.0
    timbre = float(np.linalg.norm(np.array(a["mfcc"]) - np.array(b["mfcc"]))) / 12.0
    return float(semis + bright + timbre)


def table(rows: dict[str, dict], voices: dict) -> None:
    print(f"{'voice':10} {'f0 Hz':>6} {'spread':>7} {'bright':>7} {'pace':>6}  instruct")
    for key, r in sorted(rows.items(), key=lambda kv: kv[1]["f0"]):
        print(f"{key:10} {r['f0']:6.0f} {r['f0_spread']:7.2f} {r['bright']:7.0f} {r['pace']:6.1f}  {voices.get(key, {}).get('instruct', '')}")
    pairs = []
    keys = list(rows)
    for i, a in enumerate(keys):
        for b in keys[i + 1:]:
            pairs.append((distance(rows[a], rows[b]), a, b))
    pairs.sort()
    print("\nclosest pairs (smaller = more alike):")
    for d, a, b in pairs[:8]:
        print(f"  {d:5.2f}  {a} / {b}")
    print(f"mean nearest-neighbour distance: {np.mean([min(distance(rows[a], rows[b]) for b in keys if b != a) for a in keys]):.2f}")


def pick(source: Path, voices_path: Path, refs: Path, only: set[str]) -> None:
    """For each speaker take the candidate whose pitch is nearest the target in voices.json."""
    import shutil

    found = json.loads(source.read_text(encoding="utf-8"))
    voices = json.loads(voices_path.read_text(encoding="utf-8"))
    chosen = {}
    for key, cfg in voices.items():
        if only and key not in only:
            continue
        target = cfg.get("target")
        pool = [r for r in found.values() if r["key"] == key]
        if not pool or not target:
            continue
        expected = 13.4 * cfg.get("speed", 1.0)

        def score(r: dict) -> float:
            semis = abs(12 * np.log2(max(r["f0"], 1) / target))
            if r["f0_spread"] < 1.0 or r["bright"] < 1000:
                semis += 20  # a degenerate clip: whisper, silence or a pitch tracker failure
            semis += 8 * abs(np.log2(r["pace"] / expected))
            return semis

        best = min(pool, key=score)
        chosen[key] = best
        shutil.copyfile(refs / "cast" / f"{key}-{best['seed']}.wav", refs / f"{key}.wav")
        voices[key]["seed"] = best["seed"]
        print(f"{key:10} seed {best['seed']:6} f0 {best['f0']:4.0f} (target {target}) bright {best['bright']:5.0f} pace {best['pace']:4.1f} score {score(best):.2f}")
    voices_path.write_text(json.dumps(voices, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    table({k: v for k, v in chosen.items()}, voices)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--voices", type=Path, default=HERE / "voices.json")
    parser.add_argument("--refs", type=Path, default=HERE / "refs")
    parser.add_argument("--sweep", type=int, default=0, help="design this many candidates per speaker")
    parser.add_argument("--only", default="")
    parser.add_argument("--json", type=Path, default=None, help="write the measurements here")
    parser.add_argument("--pick", type=Path, default=None, help="measurements from --sweep --json: choose and install")
    args = parser.parse_args()
    voices = json.loads(args.voices.read_text(encoding="utf-8"))
    only = {k for k in args.only.split(",") if k}

    if args.pick:
        pick(args.pick, args.voices, args.refs, only)
        return

    if args.sweep:
        import torch
        from omnivoice import OmniVoice
        import soundfile as sf

        model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cuda:0", dtype=torch.float16)
        out = args.refs / "cast"
        out.mkdir(parents=True, exist_ok=True)
        result = {}
        for key, cfg in voices.items():
            if only and key not in only:
                continue
            for i in range(args.sweep):
                seed = cfg["seed"] * 100 + i
                torch.manual_seed(seed)
                kwargs = {"speed": cfg["speed"]} if cfg.get("speed") else {}
                audio = model.generate(text=cfg["refText"], language="Ukrainian", instruct=cfg["instruct"], num_step=16, **kwargs)
                wav = out / f"{key}-{seed}.wav"
                sf.write(str(wav), np.asarray(audio[0], dtype=np.float32).reshape(-1), 24000)
                feat = features(wav, cfg["refText"])
                result[f"{key}-{seed}"] = {"key": key, "seed": seed, **feat}
                print(f"{key} seed {seed}: f0 {feat['f0']:.0f} bright {feat['bright']:.0f} pace {feat['pace']:.1f} {feat['seconds']:.1f}s", flush=True)
        if args.json:
            args.json.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
        return

    rows = {}
    for key, cfg in voices.items():
        wav = args.refs / f"{key}.wav"
        if wav.exists() and (not only or key in only):
            rows[key] = features(wav, cfg["refText"])
    table(rows, voices)
    if args.json:
        args.json.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
