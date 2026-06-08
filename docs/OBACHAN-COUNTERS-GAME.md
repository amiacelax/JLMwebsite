# おばあちゃん Counter Toss (prototype)

Practice Japanese counters **枚 · 本 · 冊 · 人 · つ** inside a game loop — not a quiz with graphics.

## Core fantasy (v1 — throw mode)

You are an **angry おばあちゃん** rolling down the street (Paperboy SNES pace). Pedestrians are in your way. A **side character** (grandkid / passenger) yells the correct counter phrase, e.g. **「３人！」** or **「５冊！」**. You hit **Space** that many times to throw that many items.

- **Max count:** 5 (for now)
- **Wrong count or wrong timing:** soft fail — **惜しい！** + brief feedback, not a hard game over
- **Right count:** items fly at targets, +score, next callout

## Visual references (user refs)

| Ref | Use |
|-----|-----|
| Undertale / pixel thought-bubble sheep | Simple flat pixel art; readable silhouettes; speech-style UI |
| Sonic special stage | Half-pipe road, camera behind player, vanishing-point depth |
| Paperboy SNES | Diagonal street speed, throw-on-the-move cadence |
| Handheld racing toy | Optional lane positioning (future) |

Style: **simple pixel**, color OK (not required B&W).

## Counters & objects (3 per counter)

| Counter | Objects (v1) | Notes |
|---------|----------------|-------|
| **枚** (mai) | 紙 · 切符 · 写真 | flat things |
| **本** (hon) | ペン · 傘 · 箸 | long cylindrical |
| **冊** (satsu) | 本 · 雑誌 · ノート | bound volumes |
| **人** (nin) | 人 · 子供 · 客 | small person sprites |
| **つ** (tsu) | 石 · 箱 · 帽子 | general “thing” |

Each round picks **one counter family** + **one object** + **count 1–5**.

## Controls

- **Space** — one throw per press (during throw window)
- **R** — restart run

## Alternate mode (memo only — not built)

**Catch mode:** Player is the pedestrian; **おばあちゃん** throws items **at you**. Same counter callouts, but you **catch** (button presses = catches) instead of throw. Mirror of throw mode for receptive practice.

## Tech

- Path: `/game/obachan-counters/`
- Canvas 2D prototype, no build step
- Linked from `games.html`

## Future

- Lanes / dodge while throwing
- Voice lines for callouts
- Catch mode toggle
- Subscriber / account gate (homework tier games access)
