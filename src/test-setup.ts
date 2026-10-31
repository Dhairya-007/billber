import "fake-indexeddb/auto";

const store = new Map<string, string>();
const fakeStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
};
// Object.keys(localStorage) lists stored keys in a browser, and this proxy matches that.
globalThis.localStorage = new Proxy(fakeStorage, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) }) as unknown as Storage;
