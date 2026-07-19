import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, paginate } from "../toolkit/index.js";
import { getStore } from "../store.js";

registerMainMenuItem({ label: "📜 History", data: "history:show", order: 20 });

function formatSignalShort(s: { pair: string; side: string; entryPrice: number; confidence: number; timestamp: number }): string {
  const emoji = s.side === "BUY" ? "🟢" : "🔴";
  const date = new Date(s.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  return `${emoji} ${s.side} ${s.pair} @ ${s.entryPrice} (${s.confidence}%) — ${date}`;
}

const composer = new Composer<Ctx>();

composer.command("history", async (ctx) => {
  await showHistory(ctx, 0);
});

composer.callbackQuery("history:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showHistoryEdit(ctx, 0);
});

composer.callbackQuery(/^history:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match![1]!, 10);
  await showHistoryEdit(ctx, page);
});

composer.callbackQuery(/^history:filter:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const filter = ctx.match![1]!;
  const store = getStore();
  const userId = ctx.from!.id;
  const deliveries = await store.listUserDeliveries(userId);
  const signalIds = deliveries.map((d) => d.signalId);
  const signals = (
    await Promise.all(signalIds.map((id) => store.getSignal(id)))
  ).filter((s): s is NonNullable<typeof s> => s !== null);
  const filtered = filter === "all" ? signals : signals.filter((s) => s.pair === filter);
  if (filtered.length === 0) {
    await ctx.editMessageText("No signals match that filter.", {
      reply_markup: inlineKeyboard([
        [inlineButton("All pairs", "history:filter:all")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }
  const { pageItems, controls } = paginate(filtered, { page: 0, perPage: 5, callbackPrefix: "history:page" });
  const lines = pageItems.map((s, i) => `${i + 1}. ${formatSignalShort(s)}`);
  const kb = inlineKeyboard([
    ...pageItems.map((s) => [inlineButton(s.pair, `history:filter:${s.pair}`)]),
    ...controls.inline_keyboard,
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
  await ctx.editMessageText(lines.join("\n"), { reply_markup: kb });
});

async function showHistory(ctx: Ctx, page: number) {
  const store = getStore();
  const userId = ctx.from!.id;
  const deliveries = await store.listUserDeliveries(userId);
  const signalIds = deliveries.map((d) => d.signalId);
  const signals = (
    await Promise.all(signalIds.map((id) => store.getSignal(id)))
  ).filter((s): s is NonNullable<typeof s> => s !== null);

  if (signals.length === 0) {
    await ctx.reply("No signals yet. Signals you receive will appear here.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const { pageItems, controls, totalPages } = paginate(signals, { page, perPage: 5, callbackPrefix: "history:page" });
  const lines = pageItems.map((s, i) => `${i + 1}. ${formatSignalShort(s)}`);
  const kb = inlineKeyboard([
    ...controls.inline_keyboard,
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
  await ctx.reply(`Signal history (${totalPages > 1 ? `page ${page + 1}/${totalPages}` : `${signals.length} signals`}):\n\n${lines.join("\n")}`, {
    reply_markup: kb,
  });
}

async function showHistoryEdit(ctx: Ctx, page: number) {
  const store = getStore();
  const userId = ctx.from!.id;
  const deliveries = await store.listUserDeliveries(userId);
  const signalIds = deliveries.map((d) => d.signalId);
  const signals = (
    await Promise.all(signalIds.map((id) => store.getSignal(id)))
  ).filter((s): s is NonNullable<typeof s> => s !== null);

  if (signals.length === 0) {
    await ctx.editMessageText("No signals yet. Signals you receive will appear here.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const { pageItems, controls, totalPages } = paginate(signals, { page, perPage: 5, callbackPrefix: "history:page" });
  const lines = pageItems.map((s, i) => `${i + 1}. ${formatSignalShort(s)}`);
  const kb = inlineKeyboard([
    ...controls.inline_keyboard,
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
  await ctx.editMessageText(`Signal history (${totalPages > 1 ? `page ${page + 1}/${totalPages}` : `${signals.length} signals`}):\n\n${lines.join("\n")}`, {
    reply_markup: kb,
  });
}

export default composer;
