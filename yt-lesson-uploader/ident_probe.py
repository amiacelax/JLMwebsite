"""Quick probe: transcribe the first N minutes of a lesson and count student-name hits."""
import json, re, subprocess, sys
from pathlib import Path
from faster_whisper import WhisperModel

video = Path(sys.argv[1]); mins = float(sys.argv[2]) if len(sys.argv) > 2 else 6
out = Path(__file__).parent / "work" / (video.stem + "_head.txt")
wav = Path(__file__).parent / "work" / (video.stem + "_head.wav")
subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(video),"-t",str(int(mins*60)),"-vn","-ac","1","-ar","16000",str(wav)],check=True)
model = WhisperModel("small", device="cpu", compute_type="int8")
segs, info = model.transcribe(str(wav), vad_filter=True)
text = "\n".join(f"[{s.start:6.1f}] {s.text.strip()}" for s in segs)
out.write_text(f"lang={info.language}\n{text}\n", encoding="utf-8")
print("done", video.name, info.language)
