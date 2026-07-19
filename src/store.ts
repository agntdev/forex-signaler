import { createRequire } from "node:module";
import type { RedisLike } from "./toolkit/session/redis.js";

export interface UserProfile {
  userId: number;
  timezone: string;
  preferredPairs: string[];
  notificationHours: string;
  maxSignalsDay: number;
  subscribed: boolean;
}

export interface Signal {
  id: string;
  timestamp: number;
  pair: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  rationale: string;
  expiryTime: number;
  status: "active" | "expired" | "executed" | "cancelled";
  tags: string[];
}

export interface DeliveryLog {
  signalId: string;
  userId: number;
  deliveredAt: number;
  action: "pending" | "accepted" | "dismissed" | "snoozed";
}

export interface Store {
  getUserProfile(userId: number): Promise<UserProfile | null>;
  setUserProfile(userId: number, profile: UserProfile): Promise<void>;
  listUserProfiles(): Promise<UserProfile[]>;
  getSignal(id: string): Promise<Signal | null>;
  setSignal(id: string, signal: Signal): Promise<void>;
  listSignals(opts?: { pair?: string; status?: string; limit?: number }): Promise<Signal[]>;
  getDelivery(signalId: string, userId: number): Promise<DeliveryLog | null>;
  setDelivery(signalId: string, userId: number, log: DeliveryLog): Promise<void>;
  listUserDeliveries(userId: number): Promise<DeliveryLog[]>;
}

class MemoryStore implements Store {
  private profiles = new Map<number, UserProfile>();
  private signals = new Map<string, Signal>();
  private deliveries = new Map<string, DeliveryLog>();
  private signalIndex: string[] = [];
  private userDeliveryIndex = new Map<number, string[]>();

  async getUserProfile(userId: number): Promise<UserProfile | null> {
    return this.profiles.get(userId) ?? null;
  }

  async setUserProfile(userId: number, profile: UserProfile): Promise<void> {
    this.profiles.set(userId, profile);
  }

  async listUserProfiles(): Promise<UserProfile[]> {
    return [...this.profiles.values()];
  }

  async getSignal(id: string): Promise<Signal | null> {
    return this.signals.get(id) ?? null;
  }

  async setSignal(id: string, signal: Signal): Promise<void> {
    this.signals.set(id, signal);
    if (!this.signalIndex.includes(id)) {
      this.signalIndex.push(id);
      this.signalIndex.sort((a, b) => {
        const sa = this.signals.get(a)!.timestamp;
        const sb = this.signals.get(b)!.timestamp;
        return sb - sa;
      });
    }
  }

  async listSignals(opts?: { pair?: string; status?: string; limit?: number }): Promise<Signal[]> {
    let ids = [...this.signalIndex];
    if (opts?.pair) ids = ids.filter((id) => this.signals.get(id)!.pair === opts.pair);
    if (opts?.status) ids = ids.filter((id) => this.signals.get(id)!.status === opts.status);
    const signals = ids.map((id) => this.signals.get(id)!);
    return opts?.limit ? signals.slice(0, opts.limit) : signals;
  }

  async getDelivery(signalId: string, userId: number): Promise<DeliveryLog | null> {
    return this.deliveries.get(`${signalId}:${userId}`) ?? null;
  }

  async setDelivery(signalId: string, userId: number, log: DeliveryLog): Promise<void> {
    this.deliveries.set(`${signalId}:${userId}`, log);
    const userDeliveries = this.userDeliveryIndex.get(userId) ?? [];
    const key = `${signalId}:${userId}`;
    if (!userDeliveries.includes(key)) {
      userDeliveries.push(key);
      this.userDeliveryIndex.set(userId, userDeliveries);
    }
  }

  async listUserDeliveries(userId: number): Promise<DeliveryLog[]> {
    const keys = this.userDeliveryIndex.get(userId) ?? [];
    return keys.map((k) => this.deliveries.get(k)!).filter(Boolean);
  }
}

class RedisStore implements Store {
  constructor(private client: RedisLike, private prefix = "fx:") {}

  private k(entity: string, id: string): string {
    return `${this.prefix}${entity}:${id}`;
  }

  private idx(entity: string): string {
    return `${this.prefix}idx:${entity}`;
  }

  private async readJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  }

  private async writeJson(key: string, value: unknown): Promise<void> {
    await this.client.set(key, JSON.stringify(value));
  }

  async getUserProfile(userId: number): Promise<UserProfile | null> {
    return this.readJson<UserProfile>(this.k("user", String(userId)));
  }

  async setUserProfile(userId: number, profile: UserProfile): Promise<void> {
    await this.writeJson(this.k("user", String(userId)), profile);
  }

  async listUserProfiles(): Promise<UserProfile[]> {
    const keys = await this.client.keys(this.k("user", "*"));
    const profiles: UserProfile[] = [];
    for (const key of keys) {
      const p = await this.readJson<UserProfile>(key);
      if (p) profiles.push(p);
    }
    return profiles;
  }

  async getSignal(id: string): Promise<Signal | null> {
    return this.readJson<Signal>(this.k("signal", id));
  }

  async setSignal(id: string, signal: Signal): Promise<void> {
    await this.writeJson(this.k("signal", id), signal);
    await this.client.set(`${this.idx("signals")}:${signal.timestamp}:${id}`, id);
  }

  async listSignals(opts?: { pair?: string; status?: string; limit?: number }): Promise<Signal[]> {
    const pattern = `${this.idx("signals")}:*`;
    const keys = await this.client.keys(pattern);
    const sorted = keys.sort().reverse();
    const signals: Signal[] = [];
    for (const key of sorted) {
      const id = await this.client.get(key);
      if (!id) continue;
      const signal = await this.getSignal(id);
      if (!signal) continue;
      if (opts?.pair && signal.pair !== opts.pair) continue;
      if (opts?.status && signal.status !== opts.status) continue;
      signals.push(signal);
      if (opts?.limit && signals.length >= opts.limit) break;
    }
    return signals;
  }

  async getDelivery(signalId: string, userId: number): Promise<DeliveryLog | null> {
    return this.readJson<DeliveryLog>(this.k("delivery", `${signalId}:${userId}`));
  }

  async setDelivery(signalId: string, userId: number, log: DeliveryLog): Promise<void> {
    await this.writeJson(this.k("delivery", `${signalId}:${userId}`), log);
    await this.client.set(`${this.idx("user-del")}:${userId}:${signalId}`, `${signalId}:${userId}`);
  }

  async listUserDeliveries(userId: number): Promise<DeliveryLog[]> {
    const keys = await this.client.keys(`${this.idx("user-del")}:${userId}:*`);
    const deliveries: DeliveryLog[] = [];
    for (const key of keys) {
      const ref = await this.client.get(key);
      if (!ref) continue;
      const [sid, uid] = ref.split(":");
      const log = await this.getDelivery(sid!, Number(uid));
      if (log) deliveries.push(log);
    }
    return deliveries;
  }
}

let currentStore: Store | null = null;

export function getStore(): Store {
  if (!currentStore) throw new Error("Store not initialised — call setStore() in buildBot()");
  return currentStore;
}

export function setStore(store: Store): void {
  currentStore = store;
}

export function createStore(env: { REDIS_URL?: string } = process.env): Store {
  if (env.REDIS_URL) {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ioredis: any = require("ioredis");
    const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
    const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
    return new RedisStore(client as RedisLike);
  }
  return new MemoryStore();
}
