# はじめてのおつかい (My First Errand)

## Concept

Inspired by *はじめてのおつかい* — Mom and child at home, Mom gives a shopping instruction, child goes to the neighborhood shop and picks the correct item from a shelf display.

## Visual direction

**Not 8-bit canvas** — soft storybook / picture-book UI:

- Warm gradients, rounded cards, CSS “illustrated” Mom & child
- Visual-novel dialogue box
- Shop shelf as tappable product cards (emoji icons + Japanese labels)

## Flow

1. Home scene — Mom intro → request
2. Shop — shuffled shelf, player picks
3. Correct → success dialogue → next errand
4. Wrong → 惜しい！ (try again)

## Public vs hidden

| Game | Public Games page | Teacher Game lab |
|------|-------------------|------------------|
| はじめてのおつかい | No (noindex) | Yes (hidden) |
| おばあちゃん Counter Toss | No (noindex) | Yes (shelved) |

Path: `/game/otsukai/`

## Future

- Walk to shop transition animation
- Counters in requests (三つ, 一本, etc.)
- Audio for Mom’s lines
- More errands / difficulty tiers
