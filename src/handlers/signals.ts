import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore, type Signal, type DeliveryLog } from "../store.js";
import { now } from "../clock.js";

registerMainMenuItem({ label: "📊 Signals", data: "signals:show", order: 10 });

let signalCounter = 0;

function signalId(): string {
  return `sig_${Date.now()}_${++signalCounter}`;
}

function formatSignal(s: Signal): string {
  const emoji = s.side === "BUY" ? "🟢" : "🔴";
  return (
    `${emoji} ${s.side} ${s.pair}\n` +
    `Entry: ${s.entryPrice} | SL: ${s.stopLoss} | TP: ${s.takeProfit}\n` +
    `Confidence: ${s.confidence}%\n` +
    `${s.rationale}`
  );
}

export async function deliverSignalToUser(
  userId: number,
  signal: Signal,
  chatId: number,
  api: { sendMessage: Function },
): Promise<void> {
  const store = getStore();
  const profile = await store.getUserProfile(userId);
  if (!profile?.subscribed) return;
  if (!profile.preferredPairs.includes(signal.pair)) return;
  if (signal.status !== "active") return;
  if (signal.expiryTime <= now()) return;

  const existing = await store.getDelivery(signal.id, userId);
  if (existing && existing.action !== "pending") return;

  const log: DeliveryLog = {
    signalId: signal.id,
    userId,
    deliveredAt: now(),
    action: "pending",
  };
  await store.setDelivery(signal.id, userId, log);

  const kb = inlineKeyboard([
    [
      inlineButton("✅ Accept", `signal:accept:${signal.id}`),
      inlineButton("❌ Dismiss", `signal:dismiss:${signal.id}`),
    ],
    [inlineButton("⏰ Snooze 1h", `signal:snooze:${signal.id}`)],
  ]);

  try {
    await api.sendMessage(chatId, formatSignal(signal), { reply_markup: kb });
  } catch {
    // 403 from user who blocked bot — ignore, don't abort loop
  }
}

export async function generateTestSignal(pair = "EUR/USD"): Promise<Signal> {
  const isBuy = Math.random() > 0.5;
  const base = pair === "EUR/USD" ? 1.0850 : pair === "GBP/USD" ? 1.2650 : 149.50;
  const sl = isBuy ? base * 0.995 : base * 1.005;
  const tp = isBuy ? base * 1.01 : base * 0.99;
  const sig: Signal = {
    id: signalId(),
    timestamp: now(),
    pair,
    side: isBuy ? "BUY" : "SELL",
    entryPrice: Number(base.toFixed(4)),
    stopLoss: Number(sl.toFixed(4)),
    takeProfit: Number(tp.toFixed(4)),
    confidence: 70 + Math.floor(Math.random() * 25),
    rationale: `Technical setup on ${pair} — key support/resistance confluence.`,
    expiryTime: now() + 3600_000,
    status: "active",
    tags: ["technical"],
  };
  await getStore().setSignal(sig.id, sig);
  return sig;
}

const composer = new Composer<Ctx>();

composer.callbackQuery("signals:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const allSignals = await store.listSignals({ status: "active", limit: 20 });
  const activeSignals = allSignals.filter((s) => s.expiryTime > now()).slice(0, 5);
  if (activeSignals.length === 0) {
    await ctx.editMessageText("No active signals right now. Check back soon.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }
  const lines = activeSignals.map((s, i) => `${i + 1}. ${formatSignal(s)}`);
  await ctx.editMessageText(lines.join("\n\n"), {
    reply_markup: inlineKeyboard([
      [inlineButton("🔄 Refresh", "signals:show")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery(/^signal:accept:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Signal accepted" });
  const signalId = ctx.match![1]!;
  const userId = ctx.from!.id;
  const store = getStore();
  const log = await store.getDelivery(signalId, userId);
  if (log) {
    log.action = "accepted";
    await store.setDelivery(signalId, userId, log);
  }
  const signal = await store.getSignal(signalId);
  if (signal) {
    signal.status = "executed";
    await store.setSignal(signalId, signal);
  }
  await ctx.editMessageText(`✅ Accepted\n\n${signal ? formatSignal(signal) : "Signal"}`, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery(/^signal:dismiss:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Signal dismissed" });
  const signalId = ctx.match![1]!;
  const userId = ctx.from!.id;
  const store = getStore();
  const log = await store.getDelivery(signalId, userId);
  if (log) {
    log.action = "dismissed";
    await store.setDelivery(signalId, userId, log);
  }
  await ctx.editMessageText("Signal dismissed.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery(/^signal:snooze:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Snoozed for 1 hour" });
  const signalId = ctx.match![1]!;
  const userId = ctx.from!.id;
  const store = getStore();
  const log = await store.getDelivery(signalId, userId);
  if (log) {
    log.action = "snoozed";
    await store.setDelivery(signalId, userId, log);
  }
  await ctx.editMessageText("⏰ Snoozed for 1 hour. I'll remind you later.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

composer.callbackQuery("signal:create-test", async (ctx) => {
  await ctx.answerCallbackQuery();
  const sig = await generateTestSignal();
  await ctx.editMessageText(
    "Test signal created:\n\n" + formatSignal(sig),
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("✅ Accept", `signal:accept:${sig.id}`),
          inlineButton("❌ Dismiss", `signal:dismiss:${sig.id}`),
        ],
        [inlineButton("⏰ Snooze 1h", `signal:snooze:${sig.id}`)],
      ]),
    },
  );
});

export default composer;
