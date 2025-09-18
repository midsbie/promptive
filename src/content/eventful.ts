const kEmitter = Symbol("eventEmitter");

export type Eventful = {
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void;
  dispatchEvent(evt: Event): boolean;
};

type Ctor<T = {}> = new (...args: any[]) => T;

// Content scripts run in an isolated execution context with their own global objects.  Built-in DOM
// classes like EventTarget are not safe to subclass across realms.  To avoid prototype mismatches
// and runtime errors, this mixin wraps an internal EventTarget instance and forwards event-related
// methods via composition.
export function WithEventTarget<TBase extends Ctor>(Base: TBase) {
  return class WithEventTarget extends Base {
    private [kEmitter] = new EventTarget();

    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions
    ): void {
      this[kEmitter].addEventListener(type, listener as any, options);
    }

    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions
    ): void {
      this[kEmitter].removeEventListener(type, listener as any, options);
    }

    dispatchEvent(evt: Event): boolean {
      return this[kEmitter].dispatchEvent(evt);
    }
  };
}
