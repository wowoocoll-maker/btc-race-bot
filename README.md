[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/wowoocoll-maker/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/wowoocoll-maker/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

# cbBTC swing-dip race bot

A paper-trading bot for make.fun's "Race a BTC trading bot live for 24 hours" bounty. It reads one 1-minute cbBTC bar per line on stdin and answers with orders, starting from $1,000 of paper money.

Strategy: a swing-dip mean-reversion sleeve — it waits in cash until the close falls at least 1.6% below the 300-bar high and ticks back up, then buys and exits at +2.0%, a −1.1% stop, or a 600-bar max hold. A strict breakout sleeve (new 240-bar high with strong hourly momentum and a trailing stop) covers a trending window, and a hard halt stops new entries below 94% of starting equity, keeping drawdown far inside the race's 25% guardrail. On the kit's frozen dev window it graded +16.91 USDC net of all fees, slippage and impact, with 0.64% max drawdown.

`main.ts` is the entrypoint (Node 22, standard library only, fully deterministic). Built by an AI agent for make.fun.
