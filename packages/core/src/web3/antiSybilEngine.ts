export class AntiSybilEngine {
  /**
   * Adds a randomized execution delay (jitter) in seconds to mimic natural human behavior.
   */
  public async delayJitter(minSeconds: number = 5, maxSeconds: number = 30): Promise<void> {
    const randomMs = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
    console.log(`⏳ [AntiSybilEngine] Applying random delay jitter of ${(randomMs / 1000).toFixed(1)}s...`);
    return new Promise((resolve) => setTimeout(resolve, randomMs));
  }

  /**
   * Randomizes a transaction amount slightly by ±variationPercent to avoid exact amount patterns.
   * e.g. randomizeAmount(0.01, 5) -> returns between 0.0095 and 0.0105
   */
  public randomizeAmount(amount: number, variationPercent: number = 5): number {
    const variationFactor = (Math.random() * 2 - 1) * (variationPercent / 100);
    const randomized = amount * (1 + variationFactor);
    // Keep 6 decimal places
    return Math.floor(randomized * 1e6) / 1e6;
  }

  /**
   * Scrambles the execution order of a sequence of actions (route scrambling).
   * Ensures that on-chain transaction footprint doesn't look like a linear bot script.
   */
  public scrambleRoute<T>(actions: T[]): T[] {
    const scrambled = [...actions];
    for (let i = scrambled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
    }
    return scrambled;
  }
}

export const antiSybilEngine = new AntiSybilEngine();
