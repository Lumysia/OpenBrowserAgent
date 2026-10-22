import type { QuickJSContext } from "quickjs-emscripten-core";
import { errorMessage } from "../error-message";
import { guestString } from "./guest-string";

// QuickJS is built without Intl (ECMA-402), and its toLocaleString and
// localeCompare ignore locales and options. The guest gets Intl from the
// browser instead: each call goes to the host's Intl as JSON, so formats,
// time zones and locale data are the browser's, at no bundle cost. Guest
// objects keep only their constructor arguments; the host makes the real
// object again for each call.

// The longest request the guest may send (its arguments as JSON).
const REQUEST_MAX_CHARS = 1_000_000;

type Value = unknown;
type Request = {
  // An Intl constructor and its arguments, with a member to get or call.
  type?: string;
  init?: Value[];
  member?: string;
  get?: boolean;
  // A static function of a constructor (supportedLocalesOf) or of Intl.
  static?: string;
  fn?: string;
  // A locale-sensitive method of a built-in value.
  builtin?: keyof typeof BUILTINS;
  value?: Value;
  args?: Value[];
};

// The locale-sensitive methods of built-ins that take locales and options.
const BUILTINS = {
  date: {
    of: (value: Value) => new Date(Number(value)),
    members: ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"],
  },
  number: {
    of: (value: Value) => Number(value),
    members: ["toLocaleString"],
  },
  bigint: {
    of: (value: Value) => BigInt(String(value)),
    members: ["toLocaleString"],
  },
  string: {
    of: (value: Value) => String(value),
    members: ["localeCompare", "toLocaleUpperCase", "toLocaleLowerCase"],
  },
} as const;

type Shape = {
  constructors: Record<
    string,
    { methods: string[]; getters: string[]; statics: string[] }
  >;
  functions: string[];
};

const intl = () => Intl as unknown as Record<string, unknown>;
const isFunction = (value: unknown): value is (...args: Value[]) => Value =>
  typeof value === "function";

// What the host's Intl has, read from it rather than listed here, so a
// browser that adds to Intl gives the guest the same.
export function intlShape(): Shape {
  const constructors: Shape["constructors"] = {};
  const functions: string[] = [];
  for (const name of Object.getOwnPropertyNames(Intl)) {
    const value = intl()[name];
    if (!isFunction(value)) continue;
    const prototype = value.prototype as object | undefined;
    if (!prototype) {
      functions.push(name);
      continue;
    }
    const methods: string[] = [];
    const getters: string[] = [];
    for (const member of Object.getOwnPropertyNames(prototype)) {
      if (member === "constructor") continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, member);
      if (descriptor?.get) getters.push(member);
      else if (isFunction(descriptor?.value)) methods.push(member);
    }
    const statics = Object.getOwnPropertyNames(value).filter(
      (member) =>
        !["length", "name", "prototype"].includes(member) &&
        isFunction((value as unknown as Record<string, unknown>)[member]),
    );
    constructors[name] = { methods, getters, statics };
  }
  return { constructors, functions };
}

// JSON cannot carry these; both sides mark them.
function revive(_key: string, value: Value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const marked = value as Record<string, Value>;
  if ("$u" in marked) return undefined;
  if ("$date" in marked) return new Date(Number(marked.$date));
  if ("$num" in marked) return Number(marked.$num);
  if ("$bigint" in marked) return BigInt(String(marked.$bigint));
  return value;
}

function encodeResult(value: Value) {
  const plain =
    value instanceof Intl.Locale
      ? { $locale: value.toString() }
      : isFunction(value)
        ? { $fn: true }
        : value;
  return JSON.stringify({ value: plain }, (_key, item: Value) =>
    typeof item === "bigint" ? String(item) : item,
  );
}

function answer(request: Request, shape: Shape): Value {
  const args = request.args ?? [];
  if (request.builtin) {
    const builtin = Object.hasOwn(BUILTINS, request.builtin)
      ? BUILTINS[request.builtin]
      : undefined;
    const member = request.member ?? "";
    if (!builtin || !(builtin.members as readonly string[]).includes(member))
      throw new TypeError(`Unknown locale method ${member}.`);
    const target = builtin.of(request.value) as unknown as Record<
      string,
      (...values: Value[]) => Value
    >;
    return target[member](...args);
  }
  if (request.fn) {
    if (!shape.functions.includes(request.fn))
      throw new TypeError(`Intl.${request.fn} is not a function.`);
    return (intl()[request.fn] as (...values: Value[]) => Value)(...args);
  }
  const type = request.type ?? "";
  const spec = Object.hasOwn(shape.constructors, type)
    ? shape.constructors[type]
    : undefined;
  if (!spec) throw new TypeError(`Intl.${request.type} is not a constructor.`);
  const Ctor = intl()[type] as new (...values: Value[]) => object;
  if (request.static) {
    if (!spec.statics.includes(request.static))
      throw new TypeError(`Intl.${request.type}.${request.static} is unknown.`);
    return (Ctor as unknown as Record<string, (...v: Value[]) => Value>)[
      request.static
    ](...args);
  }
  const instance = new Ctor(...(request.init ?? [])) as Record<string, Value>;
  const member = request.member;
  if (!member) return undefined;
  if (!spec.methods.includes(member) && !spec.getters.includes(member))
    throw new TypeError(`Intl.${request.type} has no ${member}.`);
  if (request.get) return instance[member];
  const result = (instance[member] as (...values: Value[]) => Value)(...args);
  // Segments: an iterable whose items repeat the whole input; the guest
  // puts the input back.
  if (request.type === "Segmenter" && member === "segment")
    return Array.from(
      result as Iterable<Record<string, Value>>,
      ({ input: _input, ...segment }) => segment,
    );
  return result;
}

// Answers one guest request (JSON) with JSON: { value } or { error }.
export function callIntl(text: string, shape: Shape) {
  try {
    return encodeResult(answer(JSON.parse(text, revive) as Request, shape));
  } catch (error) {
    const name =
      error instanceof RangeError
        ? "RangeError"
        : error instanceof TypeError
          ? "TypeError"
          : "Error";
    return JSON.stringify({ error: { name, message: errorMessage(error) } });
  }
}

// The guest's Intl and locale methods, set up from the host function and
// the shape. Arguments are copied as JSON when an object is made, as the
// real constructors read them then.
const INTL_PRELUDE = `(function (call, shapeJson) {
  "use strict";
  const shape = JSON.parse(shapeJson);
  const encode = (value) => JSON.stringify(value, function (key, item) {
    const raw = this[key];
    if (raw === undefined) return { $u: 1 };
    if (raw instanceof Date) return { $date: raw.getTime() };
    if (typeof raw === "bigint") return { $bigint: String(raw) };
    if (typeof raw === "number" && (!Number.isFinite(raw) || Object.is(raw, -0)))
      return { $num: Object.is(raw, -0) ? "-0" : String(raw) };
    return item;
  });
  const Intl = {};
  const invoke = (request) => {
    const reply = JSON.parse(call(encode(request)));
    if (reply.error) {
      const Type = { RangeError, TypeError }[reply.error.name] || Error;
      throw new Type(reply.error.message);
    }
    const value = reply.value;
    if (value && typeof value === "object" && "$locale" in value)
      return new Intl.Locale(value.$locale);
    return value;
  };
  const method = (fn) => ({ value: fn, writable: true, configurable: true });
  for (const [name, spec] of Object.entries(shape.constructors)) {
    const made = new WeakMap();
    const own = (object) => {
      const init = made.get(object);
      if (!init) throw new TypeError("Intl." + name + " method called on an incompatible object");
      return init;
    };
    const Ctor = function (...init) {
      if (!new.target) return new Ctor(...init);
      const copy = JSON.parse(encode(init));
      invoke({ type: name, init: copy });
      made.set(this, copy);
    };
    Object.defineProperty(Ctor, "name", { value: name });
    for (const member of spec.methods)
      Object.defineProperty(Ctor.prototype, member, method(function (...args) {
        const result = invoke({ type: name, init: own(this), member, args });
        if (name === "Segmenter" && member === "segment") {
          const input = String(args[0]);
          return result.map((segment) => ({ ...segment, input }));
        }
        return result;
      }));
    for (const member of spec.getters)
      Object.defineProperty(Ctor.prototype, member, {
        configurable: true,
        get() {
          const init = own(this);
          const value = invoke({ type: name, init, member, get: true });
          return value && value.$fn
            ? (...args) => invoke({ type: name, init, member, args })
            : value;
        },
      });
    Object.defineProperty(Ctor.prototype, Symbol.toStringTag, {
      value: "Intl." + name, configurable: true,
    });
    for (const member of spec.statics)
      Object.defineProperty(Ctor, member, method((...args) =>
        invoke({ type: name, static: member, args })));
    Object.defineProperty(Intl, name, method(Ctor));
  }
  for (const fn of shape.functions)
    Object.defineProperty(Intl, fn, method((...args) => invoke({ fn, args })));
  Object.defineProperty(Intl, Symbol.toStringTag, { value: "Intl", configurable: true });
  Object.defineProperty(globalThis, "Intl", method(Intl));
  const builtins = [
    ["date", Date.prototype, (value) => Date.prototype.getTime.call(value),
      ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]],
    ["number", Number.prototype, (value) => Number.prototype.valueOf.call(value),
      ["toLocaleString"]],
    ["bigint", BigInt.prototype, (value) => String(BigInt.prototype.valueOf.call(value)),
      ["toLocaleString"]],
    ["string", String.prototype, (value) => {
      if (value == null) throw new TypeError("String.prototype method called on null or undefined");
      return String(value);
    }, ["localeCompare", "toLocaleUpperCase", "toLocaleLowerCase"]],
  ];
  for (const [builtin, prototype, valueOf, members] of builtins)
    for (const member of members)
      Object.defineProperty(prototype, member, method({
        [member](...args) {
          return invoke({ builtin, value: valueOf(this), member, args });
        },
      }[member]));
})`;

// Gives the guest Intl and locale-aware built-ins backed by the host's.
export function installIntl(context: QuickJSContext) {
  const shape = intlShape();
  const call = context.newFunction("intl", (handle) => {
    const request = guestString(context, handle, REQUEST_MAX_CHARS);
    if (request.cut)
      return {
        error: context.newError("The arguments to Intl are too large."),
      };
    return context.newString(callIntl(request.text, shape));
  });
  const shapeJson = context.newString(JSON.stringify(shape));
  const prelude = context.unwrapResult(
    context.evalCode(INTL_PRELUDE, "intl.js", {
      type: "global",
      strict: true,
    }),
  );
  const done = context.callFunction(
    prelude,
    context.undefined,
    call,
    shapeJson,
  );
  for (const handle of [prelude, call, shapeJson]) handle.dispose();
  context.unwrapResult(done).dispose();
}
