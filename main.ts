// cbBTC swing-dip bot for agent-fun/bars-replay/v1 (make.fun btc-race-24h).
//
// Strategy, in one paragraph: the bot trades one asset, CBBTC, long only, one
// position at a time, on the one-minute bars the harness sends batch by batch.
// It spends most of its time in cash. It buys only after a real dip: the latest
// close has fallen at least DROP (1.6%) below the highest close of the last H
// (300) bars and the current bar closes up on the previous one, which says the
// fall has paused for at least a minute. It then rides the mean reversion: it
// sells when the close reaches TARGET (2.0%) above the close it decided at,
// stops out at STOP (1.1%) below it, and gives up after MAXHOLD (600) bars
// whatever happened. It opens nothing in the last LATE (150) bars of the
// window, because a fresh position there is flattened by the harness before a
// reversion can play out. The position is the whole account: with one asset
// and a ~26 bps full-size round trip in fees, slippage and impact, a smaller
// stake only shrinks the edge the dip has to pay for.
//
// A second, deliberately rare sleeve covers the opposite weather: if the
// close breaks at least BRK_BUF (0.5%) above the highest close of the last
// BRK_H (240) bars with the last hour already up BRK_MOM (1.5%), the bot rides
// the trend instead, out on a BRK_TRAIL (0.8%) trailing stop. It is strict
// enough never to fire in a choppy or falling window, where breakouts are
// bull traps; it exists so a strongly trending race window still gets traded.
// And a hard halt sits under both sleeves: once equity is under 94% of the
// starting capital the bot opens nothing new, so no sequence of stopped-out
// dips can walk the account toward the 25% drawdown guardrail.
//
// The bot is deterministic: it reads no clock, no file, no environment and no
// randomness; every comparison runs in float64 on the bars' integer closes,
// so the same bars produce the same orders byte for byte.

import { runBars, type BarsState, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const WINDOW_BARS = 1440; // the scored window is 1,440 one-minute bars

const H = 300; // bars of history the dip is measured against
const DROP = 0.016; // buy when the close is this far under the H-bar high
const TARGET = 0.02; // sell this far above the decision close
const STOP = 0.011; // or this far below it
const MAXHOLD = 600; // or after this many bars in the position
const LATE = 150; // open nothing with this many bars (or fewer) left
const MAX_SLIPPAGE_BPS = 500;

const BRK_H = 240; // bars of history the breakout is measured against
const BRK_BUF = 0.005; // the close must clear the BRK_H high by this much
const BRK_MOM = 0.015; // and the last 60 bars must already be up this much
const BRK_TRAIL = 0.008; // the breakout position trails this far under its peak
const BRK_MAXHOLD = 480; // and gives up after this many bars
const HALT_NUM = 94n; // open nothing once equity < HALT_NUM / HALT_DEN of the start
const HALT_DEN = 100n;

/** Every CBBTC close seen, in order; the strategy's only memory of prices. */
const closes: number[] = [];
/** The close the current entry was decided at; exits are measured from it. */
let entryRef = 0;
/** Which sleeve opened the position: 'dip' or 'brk'; null while flat. */
let mode: 'dip' | 'brk' | null = null;
/** The highest close since the entry; the breakout's trailing stop reads it. */
let peak = 0;
/** Batches spent in the position so far. */
let hold = 0;
/** A buy was sent on the previous batch (it fills, or not, at this open). */
let sent = false;

function onBatch(state: BarsState, batch: { bars: { symbol: string }[] }): OrderInput[] {
  // Only a batch that carries a fresh CBBTC bar advances the strategy; a batch
  // without one (a gap minute) is still answered, with no orders.
  if (!batch.bars.some((b) => b.symbol === SYMBOL)) return [];
  const closeBig = state.close(SYMBOL);
  if (closeBig === null) return [];
  const close = Number(closeBig);
  closes.push(close);

  const held = state.positions.get(SYMBOL);
  if (held !== undefined) {
    sent = false;
    hold += 1;
    if (close > peak) peak = close;
    let exit = false;
    if (mode === 'brk') {
      exit = close <= peak * (1 - BRK_TRAIL) || hold >= BRK_MAXHOLD;
    } else if (entryRef > 0) {
      exit =
        close <= entryRef * (1 - STOP) || close >= entryRef * (1 + TARGET) || hold >= MAXHOLD;
    }
    if (exit) {
      entryRef = 0;
      mode = null;
      return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }

  // Flat. A buy sent last batch that never filled leaves no position: forget it.
  if (sent) {
    sent = false;
    mode = null;
  }
  if (state.warmingUp) return [];
  if (closes.length <= H) return [];
  const remaining = state.warmupBars + WINDOW_BARS - 1 - state.seq;
  if (remaining <= LATE) return [];
  // The halt: under 94% of the starting capital, no new risk is opened.
  if (state.equity * HALT_DEN < BigInt(state.hello.capital.quote_units) * HALT_NUM) return [];

  let signal: 'dip' | 'brk' | null = null;
  let high = 0;
  for (let i = closes.length - H; i < closes.length; i++) {
    if (closes[i] > high) high = closes[i];
  }
  const prev = closes[closes.length - 2];
  if (close <= high * (1 - DROP) && close > prev) {
    signal = 'dip';
  } else if (closes.length > BRK_H) {
    let hib = 0;
    for (let i = closes.length - BRK_H; i < closes.length - 1; i++) {
      if (closes[i] > hib) hib = closes[i];
    }
    const hourAgo = closes[closes.length - 61];
    if (close > hib * (1 + BRK_BUF) && close > hourAgo * (1 + BRK_MOM)) signal = 'brk';
  }

  if (signal !== null) {
    const room = state.weightRoom(SYMBOL);
    const spend = state.cash < room ? state.cash : room;
    if (spend >= 1_000_000n) {
      // at least 1 USDC
      mode = signal;
      entryRef = close;
      peak = close;
      hold = 0;
      sent = true;
      return [
        { side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS },
      ];
    }
  }
  return [];
}

await runBars({ onBatch });
