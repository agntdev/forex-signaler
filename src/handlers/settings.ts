import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore, type UserProfile } from "../store.js";

registerMainMenuItem({ label: "⚙️ Settings", data: "settings:show", order: 30 });

const MAJOR_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CHF", "USD/CAD", "NZD/USD"];

const TIMEZONES = [
  { label: "UTC", data: "set:tz:UTC" },
  { label: "EST (UTC-5)", data: "set:tz:EST" },
  { label: "CST (UTC-6)", data: "set:tz:CST" },
  { label: "PST (UTC-8)", data: "set:tz:PST" },
  { label: "CET (UTC+1)", data: "set:tz:CET" },
  { label: "JST (UTC+9)", data: "set:tz:JST" },
  { label: "AEST (UTC+10)", data: "set:tz:AEST" },
];

const NOTIFY_OPTIONS = [
  { label: "24/5 — all hours", data: "set:notify:24x5" },
  { label: "London + NY overlap", data: "set:notify:overlap" },
];

function formatProfile(p: UserProfile): string {
  return (
    `🌍 Timezone: ${p.timezone}\n` +
    `📊 Pairs: ${p.preferredPairs.join(", ")}\n` +
    `🔔 Notifications: ${p.notificationHours === "24/5" ? "All trading hours" : "London + NY overlap"}\n` +
    `📈 Max signals/day: ${p.maxSignalsDay}\n` +
    `✅ Subscribed: ${p.subscribed ? "Yes" : "No"}`
  );
}

function settingsMenu(p: UserProfile) {
  return inlineKeyboard([
    [inlineButton("🌍 Timezone", "settings:tz")],
    [inlineButton("📊 Preferred pairs", "settings:pairs")],
    [inlineButton("🔔 Notification hours", "settings:notify")],
    [inlineButton("📈 Max signals/day", "settings:max")],
    [inlineButton("🚫 Unsubscribe", "settings:unsub")],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
}

const composer = new Composer<Ctx>();

composer.command("settings", async (ctx) => {
  await showSettings(ctx);
});

composer.callbackQuery("settings:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const profile = await store.getUserProfile(ctx.from!.id);
  if (!profile) {
    await ctx.editMessageText("You haven't set up yet. Tap /start to begin.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }
  await ctx.editMessageText("Your settings:\n\n" + formatProfile(profile), {
    reply_markup: settingsMenu(profile),
  });
});

composer.callbackQuery("settings:tz", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "editing_tz";
  await ctx.editMessageText("Select your timezone:", {
    reply_markup: inlineKeyboard(TIMEZONES.map((tz) => [inlineButton(tz.label, tz.data)])),
  });
});

composer.callbackQuery(/^set:tz:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tz = ctx.match![1]!;
  const store = getStore();
  const profile = await store.getUserProfile(ctx.from!.id);
  if (profile) {
    profile.timezone = tz;
    await store.setUserProfile(ctx.from!.id, profile);
  }
  ctx.session.step = undefined;
  await ctx.editMessageText("Timezone updated to " + tz + ".", {
    reply_markup: settingsMenu(profile ?? { userId: ctx.from!.id, timezone: tz, preferredPairs: MAJOR_PAIRS, notificationHours: "24/5", maxSignalsDay: 10, subscribed: true }),
  });
});

composer.callbackQuery("settings:pairs", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const profile = await store.getUserProfile(ctx.from!.id);
  const selected = profile?.preferredPairs ?? MAJOR_PAIRS;
  ctx.session.step = "editing_pairs";
  const rows = MAJOR_PAIRS.map((pair) => {
    const tick = selected.includes(pair) ? "✓ " : "";
    return [inlineButton(`${tick}${pair}`, `set:pair:${pair.replace("/", "")}`)];
  });
  rows.push([inlineButton("Done", "set:pairs:ok")]);
  await ctx.editMessageText("Select your preferred pairs:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery(/^set:pair:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const pairCode = ctx.match![1]!;
  const pair = pairCode.replace(/(\w{3})(\w{3})/, "$1/$2");
  const store = getStore();
  const profile = await store.getUserProfile(ctx.from!.id);
  if (!profile) return;
  const current = profile.preferredPairs;
  profile.preferredPairs = current.includes(pair) ? current.filter((p) => p !== pair) : [...current, pair];
  await store.setUserProfile(ctx.from!.id, profile);
  const rows = MAJOR_PAIRS.map((p) => {
    const tick = profile!.preferredPairs.includes(p) ? "✓ " : "";
    return [inlineButton(`${tick}${p}`, `set:pair:${p.replace("/", "")}`)];
  });
  rows.push([inlineButton("Done", "set:pairs:ok")]);
  await ctx.editMessageText("Select your preferred pairs:", {
    reply_markup: inlineKeyboard(rows),
  });
});

composer.callbackQuery("set:pairs:ok", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  const store = getStore();
  const profile = await store.getUserProfile(ctx.from!.id);
  if (profile) {
    if (profile.preferredPairs.length === 0) {
      profile.preferredPairs = MAJOR_PAIRS;
      await store.setUserProfile(ctx.from!.id, profile);
    }
    await ctx.editMessageText("Pairs updated.", {
      reply_markup: settingsMenu(profile),
    });
  }
});

composer.callbackQuery("settings:notify", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "editing_notify";
  await ctx.editMessageText("Select notification hours:", {
    reply_markup: inlineKeyboard(NOTIFY_OPTIONS.map((opt) => [inlineButton(opt.label, opt.data)])),
  });
});

composer.callbackQuery(/^set:notify:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const val = ctx.match![1] === "24x5" ? "24/5" : "overlap";
  const store = getStore();
  const profile = await store.getUserProfile(ctx.from!.id);
  if (profile) {
    profile.notificationHours = val;
    await store.setUserProfile(ctx.from!.id, profile);
  }
  ctx.session.step = undefined;
  await ctx.editMessageText("Notification hours updated.", {
    reply_markup: settingsMenu(profile ?? { userId: ctx.from!.id, timezone: "UTC", preferredPairs: MAJOR_PAIRS, notificationHours: val, maxSignalsDay: 10, subscribed: true }),
  });
});

composer.callbackQuery("settings:max", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const profile = await store.getUserProfile(ctx.from!.id);
  if (!profile) return;
  const options = [5, 10, 20, 50];
  await ctx.editMessageText(`Max signals per day: ${profile.maxSignalsDay}\n\nSelect new limit:`, {
    reply_markup: inlineKeyboard([
      ...options.map((n) => [inlineButton(`${n}`, `set:max:${n}`)]),
      [inlineButton("⬅️ Back", "settings:show")],
    ]),
  });
});

composer.callbackQuery(/^set:max:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const max = parseInt(ctx.match![1]!, 10);
  const store = getStore();
  const profile = await store.getUserProfile(ctx.from!.id);
  if (profile) {
    profile.maxSignalsDay = max;
    await store.setUserProfile(ctx.from!.id, profile);
  }
  await ctx.editMessageText(`Max signals/day set to ${max}.`, {
    reply_markup: settingsMenu(profile ?? { userId: ctx.from!.id, timezone: "UTC", preferredPairs: MAJOR_PAIRS, notificationHours: "24/5", maxSignalsDay: max, subscribed: true }),
  });
});

composer.callbackQuery("settings:unsub", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("Unsubscribe from signals?\n\nYou can re-subscribe anytime from Settings.", {
    reply_markup: inlineKeyboard([
      [inlineButton("Yes, unsubscribe", "set:unsub:yes")],
      [inlineButton("Cancel", "settings:show")],
    ]),
  });
});

composer.callbackQuery("set:unsub:yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  const store = getStore();
  const profile = await store.getUserProfile(ctx.from!.id);
  if (profile) {
    profile.subscribed = false;
    await store.setUserProfile(ctx.from!.id, profile);
  }
  await ctx.editMessageText("You've been unsubscribed. Tap /start to re-subscribe.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
});

async function showSettings(ctx: Ctx) {
  const store = getStore();
  const profile = await store.getUserProfile(ctx.from!.id);
  if (!profile) {
    await ctx.reply("You haven't set up yet. Tap /start to begin.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }
  await ctx.reply("Your settings:\n\n" + formatProfile(profile), {
    reply_markup: settingsMenu(profile),
  });
}

export default composer;
