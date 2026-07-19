import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { mainMenuKeyboard, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getStore, type UserProfile } from "../store.js";

const MAJOR_PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CHF", "USD/CAD", "NZD/USD"];

const TIMEZONES = [
  { label: "UTC", data: "onb:tz:UTC" },
  { label: "EST (UTC-5)", data: "onb:tz:EST" },
  { label: "CST (UTC-6)", data: "onb:tz:CST" },
  { label: "PST (UTC-8)", data: "onb:tz:PST" },
  { label: "CET (UTC+1)", data: "onb:tz:CET" },
  { label: "JST (UTC+9)", data: "onb:tz:JST" },
  { label: "AEST (UTC+10)", data: "onb:tz:AEST" },
];

const NOTIFY_OPTIONS = [
  { label: "24/5 — all hours", data: "onb:notify:24x5" },
  { label: "London + NY overlap", data: "onb:notify:overlap" },
];

const WELCOME = "👋 Welcome to Forex Signals!\n\nI deliver algorithmic trading signals straight to your chat. Tap a button to get started.";

function buildPairButtons(selected: string[]) {
  const rows = [];
  for (const pair of MAJOR_PAIRS) {
    const isSelected = selected.includes(pair);
    const tick = isSelected ? "✓ " : "";
    rows.push([inlineButton(`${tick}${pair}`, `onb:pair:${pair.replace("/", "")}`)]);
  }
  rows.push([inlineButton(selected.length > 0 ? "Confirm" : "Select all", "onb:pairs:ok")]);
  return inlineKeyboard(rows);
}

const composer = new Composer<Ctx>();

composer.command("start", async (ctx) => {
  const userId = ctx.from!.id;
  const existing = await getStore().getUserProfile(userId);
  if (existing?.subscribed) {
    await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
    return;
  }
  ctx.session.step = "onboarding_tz";
  ctx.session.onboarding = {};
  await ctx.reply(
    "First, what's your timezone?\nThis helps me send signals at the right time for you.",
    {
      reply_markup: inlineKeyboard(
        TIMEZONES.map((tz) => [inlineButton(tz.label, tz.data)]),
      ),
    },
  );
});

composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

composer.callbackQuery(/^onb:tz:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const tz = ctx.match![1]!;
  ctx.session.onboarding = { ...ctx.session.onboarding, timezone: tz };
  ctx.session.step = "onboarding_pairs";
  await ctx.editMessageText(
    `Timezone set to ${tz}.\n\nNow select the pairs you want signals for:`,
    { reply_markup: buildPairButtons([]) },
  );
});

composer.callbackQuery(/^onb:pair:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const pairCode = ctx.match![1]!;
  const pair = pairCode.replace(/(\w{3})(\w{3})/, "$1/$2");
  const current = ctx.session.onboarding?.pairs ?? [];
  const updated = current.includes(pair) ? current.filter((p) => p !== pair) : [...current, pair];
  ctx.session.onboarding = { ...ctx.session.onboarding, pairs: updated };
  await ctx.editMessageText("Select the pairs you want signals for:", {
    reply_markup: buildPairButtons(updated),
  });
});

composer.callbackQuery("onb:pairs:ok", async (ctx) => {
  await ctx.answerCallbackQuery();
  const pairs = ctx.session.onboarding?.pairs ?? MAJOR_PAIRS;
  if (pairs.length === 0) {
    ctx.session.onboarding = { ...ctx.session.onboarding, pairs: MAJOR_PAIRS };
  }
  ctx.session.step = "onboarding_notify";
  await ctx.editMessageText(
    "Great choices!\n\nWhen should I send you signals?",
    {
      reply_markup: inlineKeyboard(
        NOTIFY_OPTIONS.map((opt) => [inlineButton(opt.label, opt.data)]),
      ),
    },
  );
});

composer.callbackQuery(/^onb:notify:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const notify = ctx.match![1] === "24x5" ? "24/5" : "overlap";
  const userId = ctx.from!.id;
  const pairs = ctx.session.onboarding?.pairs ?? MAJOR_PAIRS;
  const timezone = ctx.session.onboarding?.timezone ?? "UTC";

  const profile: UserProfile = {
    userId,
    timezone,
    preferredPairs: pairs,
    notificationHours: notify,
    maxSignalsDay: 10,
    subscribed: true,
  };
  await getStore().setUserProfile(userId, profile);

  ctx.session.step = undefined;
  ctx.session.onboarding = undefined;

  await ctx.editMessageText(
    "You're all set!\n\nI'll send you signals for " +
      pairs.join(", ") +
      " during " +
      (notify === "24/5" ? "all trading hours" : "London + NY overlap") +
      ".\n\nTap a button below to explore.",
    { reply_markup: mainMenuKeyboard() },
  );
});

export default composer;
