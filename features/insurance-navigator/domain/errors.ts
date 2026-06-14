export class InsuranceAdapterExecutionError extends Error {
  cause?: Error;

  constructor(message = "Insurance adapter execution failed.", cause?: Error) {
    super(message);
    this.name = "InsuranceAdapterExecutionError";

    if (cause) {
      try {
        Object.defineProperty(this, "cause", {
          value: cause,
          enumerable: false,
          configurable: true,
          writable: true,
        });
      } catch {
        this.cause = cause;
      }
    }
  }
}
