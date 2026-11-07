"""Speaks the narration of the trailer (scripts/qa/narration.json) with OmniVoice, locally.

The voice is the game's narrator (the reference clip and the settings in
scripts/voice/voices.json), so the trailer sounds like the game. Every block is spoken
several times with different seeds; the take whose words come closest to the text (heard
by faster-whisper when it is installed) is kept. Run it with the Python of the OmniVoice
environment, from the repository root:

    python scripts/qa/narrate.py [--out DIR] [--takes 3] [--only b1,b2] [--asr PYTHON]

Output: DIR/<id>.wav (mono, trimmed, softened, levelled) and DIR/timing.json with the length
of each block, which scripts/qa/trailer.cjs reads to cut the picture to the voice.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import subprocess
import sys
import time
import wave
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")
ROOT = Path(__file__).resolve().parents[2]
VOICES = ROOT / "scripts" / "voice"
RATE = 24000
STEPS = 16
POST = (
    "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.04,"
    "areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.2,areverse,"
    "highpass=f=70,highshelf=f=4500:g=-3,acompressor=threshold=-22dB:ratio=3:attack=8:release=120,"
    "loudnorm=I=-19:TP=-1.5:LRA=7"
)


def log(message: str) -> None:
    print(message, flush=True)


def write_wav(path: Path, data) -> float:
    import numpy as np

    pcm = (np.clip(np.asarray(data, dtype=np.float32).reshape(-1), -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(pcm.tobytes())
    return len(pcm) / RATE


def words(text: str) -> str:
    text = re.sub(r"\[[^\]]*\]", " ", text.lower().replace("’", "'"))
    return " ".join(re.findall(r"[a-zа-яіїєґ0-9']+", text))


def heard(asr: str | None, wav: Path) -> str | None:
    """The words the recording says, by faster-whisper run in the Python `asr`."""
    if not asr:
        return None
    code = (
        "import sys; from faster_whisper import WhisperModel; "
        "m = WhisperModel('small', device='cpu', compute_type='int8'); "
        "s, _ = m.transcribe(sys.argv[1], language='uk'); "
        "print(' '.join(x.text for x in s))"
    )
    env = {**os.environ, "PYTHONUTF8": "1", "HF_HUB_OFFLINE": "1"}
    done = subprocess.run([asr, "-c", code, str(wav)], capture_output=True, text=True, env=env, timeout=300)
    return done.stdout.strip() if done.returncode == 0 else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--script", type=Path, default=ROOT / "scripts" / "qa" / "narration.json")
    parser.add_argument("--out", type=Path, default=ROOT / "trailer-out" / "narration")
    parser.add_argument("--takes", type=int, default=3)
    parser.add_argument("--only", default="")
    parser.add_argument("--asr", default="", help="a Python that has faster-whisper, to choose the best take")
    args = parser.parse_args()
    script = json.loads(args.script.read_text(encoding="utf-8"))
    voice = json.loads((VOICES / "voices.json").read_text(encoding="utf-8"))[script["voice"]]
    ref = VOICES / "refs" / f"{script['voice']}.wav"
    if not ref.exists():
        sys.exit(f"no reference clip {ref}: run scripts/voice/generate.py --refs-only first")
    only = {x for x in args.only.split(",") if x}
    args.out.mkdir(parents=True, exist_ok=True)
    work = args.out / "raw"
    work.mkdir(exist_ok=True)

    import torch
    from omnivoice import OmniVoice

    started = time.time()
    model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cuda:0", dtype=torch.float16)
    log(f"model ready in {time.time() - started:.0f}s")
    timing_file = args.out / "timing.json"
    timing = json.loads(timing_file.read_text(encoding="utf-8")) if timing_file.exists() else {}
    for block in script["blocks"]:
        if only and block["id"] not in only:
            continue
        best = None
        for take in range(args.takes):
            seed = 4100 + take * 37 + int(block["id"][1:]) * 11
            torch.manual_seed(seed)
            audio = model.generate(
                text=block["text"], language="Ukrainian", ref_audio=str(ref), ref_text=voice["refText"],
                num_step=STEPS, speed=script.get("speed", 1.0),
            )
            raw = work / f"{block['id']}-{take}.wav"
            seconds = write_wav(raw, audio[0])
            said = heard(args.asr, raw)
            score = difflib.SequenceMatcher(None, words(block["text"]), words(said)).ratio() if said is not None else 0.0
            log(f"{block['id']} take {take}: {seconds:.1f}s score {score:.2f}  {said or ''}")
            if best is None or score > best[0] + 0.005 or (abs(score - best[0]) <= 0.005 and seconds < best[1]):
                best = (score, seconds, raw)
        final = args.out / f"{block['id']}.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", str(best[2]), "-af", POST, "-ar", "48000", "-ac", "1", str(final)],
            check=True,
        )
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(final)],
            capture_output=True, text=True, check=True,
        )
        timing[block["id"]] = {"seconds": round(float(out.stdout), 3), "score": round(best[0], 3)}
        log(f"{block['id']} kept: {timing[block['id']]}")
        timing_file.write_text(json.dumps(timing, ensure_ascii=False, indent=1), encoding="utf-8")


main()
