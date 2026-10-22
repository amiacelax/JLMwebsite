"""Generate the two teaching sound effects (royalty-free: synthesized here).

  assets/sfx/buzzer.wav  - 'wrong' (low, harsh, ~0.45s)
  assets/sfx/ding.wav    - 'right' (bright bell, ~0.8s)

Swap in your own files with the same names any time; compose.py just mixes them in.
"""
from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).parent / "assets" / "sfx"


def _write(name: str, x: np.ndarray) -> None:
    x = np.clip(x, -1.0, 1.0)
    pcm = (x * 32767).astype("<i2")
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def buzzer() -> np.ndarray:
    t = np.arange(int(SR * 0.45)) / SR
    sq = lambda f: np.sign(np.sin(2 * np.pi * f * t))
    x = 0.5 * sq(120) + 0.4 * sq(127) + 0.25 * np.sin(2 * np.pi * 240 * t)
    env = np.minimum(1, t / 0.01) * np.minimum(1, (t[-1] - t) / 0.08)
    return 0.55 * x * env / 1.15


def ding() -> np.ndarray:
    t = np.arange(int(SR * 0.9)) / SR
    x = (np.sin(2 * np.pi * 1318.5 * t) * np.exp(-t * 5.5)
         + 0.55 * np.sin(2 * np.pi * 1975.5 * t) * np.exp(-t * 7.0)
         + 0.25 * np.sin(2 * np.pi * 2637 * t) * np.exp(-t * 11.0))
    env = np.minimum(1, t / 0.004)
    return 0.6 * x * env / 1.4


if __name__ == "__main__":
    _write("buzzer.wav", buzzer())
    _write("ding.wav", ding())
    print("wrote", OUT)
