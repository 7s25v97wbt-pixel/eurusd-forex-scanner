
(function () {
  function average(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function detectConsolidation(candles, lookback = 12) {
    if (candles.length < lookback + 2) {
      return { detected: false, type: "Insufficient data" };
    }

    const recent = candles.slice(-lookback);
    const ranges = recent.map(c => c.high - c.low);
    const totalRange = Math.max(...recent.map(c => c.high)) -
                       Math.min(...recent.map(c => c.low));
    const avgRange = average(ranges);

    const tight = totalRange <= avgRange * 5;

    const upper = Math.max(...recent.map(c => c.high));
    const lower = Math.min(...recent.map(c => c.low));
    const tolerance = avgRange * 0.25;

    let upperTouches = 0;
    let lowerTouches = 0;

    for (const candle of recent) {
      if (upper - candle.high <= tolerance) upperTouches++;
      if (candle.low - lower <= tolerance) lowerTouches++;
    }

    const rejections = upperTouches >= 2 && lowerTouches >= 2;

    return {
      detected: tight || rejections,
      type: tight && rejections
        ? "Tight range and repeated rejections"
        : tight
          ? "Tight range"
          : rejections
            ? "Repeated range rejections"
            : "No clear consolidation",
      upper,
      lower,
      upperTouches,
      lowerTouches
    };
  }

  function detectBreakout(candles, index, range) {
    if (!range.detected || index < 1) return null;

    const candle = candles[index];

    if (candle.close > range.upper) {
      return "bullish";
    }

    if (candle.close < range.lower) {
      return "bearish";
    }

    return null;
  }

  function detectFVGs(candles) {
    const gaps = [];

    for (let i = 2; i < candles.length; i++) {
      const first = candles[i - 2];
      const middle = candles[i - 1];
      const third = candles[i];

      const range = detectConsolidation(candles.slice(0, i - 1));
      const breakout = detectBreakout(candles, i - 1, range);

      if (!breakout) continue;

      if (third.low > first.high && breakout === "bullish") {
        const bottom = first.high;
        const top = third.low;

        const later = candles.slice(i + 1);
        const touched = later.some(c => c.low <= top);
        const filled = later.some(c => c.low <= bottom);

        gaps.push({
          type: "Bullish FVG",
          direction: "bullish",
          bottom,
          top,
          createdAt: third.time,
          status: filled ? "Filled" : touched ? "Partially filled" : "Unfilled"
        });
      }

      if (third.high < first.low && breakout === "bearish") {
        const bottom = third.high;
        const top = first.low;

        const later = candles.slice(i + 1);
        const touched = later.some(c => c.high >= bottom);
        const filled = later.some(c => c.high >= top);

        gaps.push({
          type: "Bearish FVG",
          direction: "bearish",
          bottom,
          top,
          createdAt: third.time,
          status: filled ? "Filled" : touched ? "Partially filled" : "Unfilled"
        });
      }
    }

    return gaps;
  }

  function detectOrderBlocks(candles) {
    const blocks = [];

    for (let i = 5; i < candles.length; i++) {
      const range = detectConsolidation(candles.slice(0, i - 1));
      const breakout = detectBreakout(candles, i - 1, range);

      if (!breakout) continue;

      const breakoutCandle = candles[i - 1];

      for (let j = i - 2; j >= Math.max(0, i - 6); j--) {
        const candle = candles[j];

        const opposite =
          breakout === "bullish"
            ? candle.close < candle.open
            : candle.close > candle.open;

        if (!opposite) continue;

        blocks.push({
          type: breakout === "bullish" ? "Demand block" : "Supply block",
          direction: breakout,
          bottom: candle.low,
          top: candle.high,
          createdAt: candle.time,
          breakoutAt: breakoutCandle.time
        });

        break;
      }
    }

    return blocks;
  }

  function predictDirection(candles, gaps, blocks) {
    if (candles.length < 20) {
      return {
        direction: "Insufficient data",
        strength: "Unavailable",
        horizon: "Next 1–3 candles"
      };
    }

    const last = candles[candles.length - 1];
    const previous = candles[candles.length - 2];
    const before = candles[candles.length - 3];

    const bullishMomentum =
      last.close > last.open &&
      last.close > previous.close &&
      previous.close > before.close;

    const bearishMomentum =
      last.close < last.open &&
      last.close < previous.close &&
      previous.close < before.close;

    const bullishGap = gaps.some(g =>
      g.direction === "bullish" && g.status === "Unfilled"
    );

    const bearishGap = gaps.some(g =>
      g.direction === "bearish" && g.status === "Unfilled"
    );

    const bullishBlock = blocks.some(b => b.direction === "bullish");
    const bearishBlock = blocks.some(b => b.direction === "bearish");

    const bullScore =
      Number(bullishMomentum) +
      Number(bullishGap) +
      Number(bullishBlock);

    const bearScore =
      Number(bearishMomentum) +
      Number(bearishGap) +
      Number(bearishBlock);

    if (bullScore >= 3 && bearScore === 0) {
      return {
        direction: "Bullish bias",
        strength: "Strong setup — not a guarantee",
        horizon: "Next 1–3 candles"
      };
    }

    if (bearScore >= 3 && bullScore === 0) {
      return {
        direction: "Bearish bias",
        strength: "Strong setup — not a guarantee",
        horizon: "Next 1–3 candles"
      };
    }

    return {
      direction: "No clear direction",
      strength: "Weak or conflicting evidence",
      horizon: "Next 1–3 candles"
    };
  }

  function analyse(candles) {
    if (!Array.isArray(candles) || candles.length < 20) {
      return { error: "At least 20 candles are required." };
    }

    const consolidation = detectConsolidation(candles);
    const gaps = detectFVGs(candles);
    const blocks = detectOrderBlocks(candles);
    const prediction = predictDirection(candles, gaps, blocks);

    return {
      consolidation,
      gaps,
      blocks,
      prediction
    };
  }

  window.ScannerEngine = { analyse };
})();
