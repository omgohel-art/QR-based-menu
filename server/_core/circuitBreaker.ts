const OPEN = "OPEN" as const;
const CLOSED = "CLOSED" as const;
const HALF_OPEN = "HALF_OPEN" as const;

interface BreakerConfig {
  name: string;
  timeoutMs: number;
  errorThresholdPercentage?: number;
  resetTimeoutMs?: number;
  volumeThreshold?: number;
}

class Breaker {
  state: typeof OPEN | typeof CLOSED | typeof HALF_OPEN = CLOSED;
  failureCount = 0;
  successCount = 0;
  lastFailureTime = 0;
  readonly config: Required<BreakerConfig>;

  constructor(config: BreakerConfig) {
    this.config = {
      name: config.name,
      timeoutMs: config.timeoutMs,
      errorThresholdPercentage: config.errorThresholdPercentage ?? 50,
      resetTimeoutMs: config.resetTimeoutMs ?? 10_000,
      volumeThreshold: config.volumeThreshold ?? 3,
    };
  }

  private log(event: string) {
    console.info(`[CB][${this.config.name}] ${event} — state=${this.state}`);
  }

  isOpen(): boolean {
    if (this.state === OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeoutMs) {
        this.state = HALF_OPEN;
        this.log("Half-open — probing");
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    if (this.state === HALF_OPEN) {
      this.state = CLOSED;
      this.failureCount = 0;
      this.log("Closed — recovered");
    }
    this.successCount++;
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    const total = this.failureCount + this.successCount;
    if (total >= this.config.volumeThreshold) {
      const pct = (this.failureCount / total) * 100;
      if (pct >= this.config.errorThresholdPercentage) {
        this.state = OPEN;
        this.log("Open — fast-failing");
      }
    }
  }
}

const supabaseBreaker = new Breaker({ name: "supabase", timeoutMs: 5000 });
const resendBreaker = new Breaker({ name: "resend", timeoutMs: 3000 });
const razorpayBreaker = new Breaker({ name: "razorpay", timeoutMs: 5000 });

async function fire<T>(breaker: Breaker, fn: () => Promise<T>): Promise<T> {
  if (breaker.isOpen()) {
    throw new Error(`Circuit [${breaker.config.name}] open — fast-fail`);
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      breaker.recordFailure();
      reject(new Error(`Circuit [${breaker.config.name}] timeout after ${breaker.config.timeoutMs}ms`));
    }, breaker.config.timeoutMs);

    fn()
      .then((result) => {
        clearTimeout(timer);
        breaker.recordSuccess();
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        breaker.recordFailure();
        reject(err);
      });
  });
}

export { supabaseBreaker, resendBreaker, razorpayBreaker, fire };
