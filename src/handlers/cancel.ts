import { Composer } from "grammy";
import type { Ctx } from "../bot.js";

const composer = new Composer<Ctx>();

composer.command("cancel", async (ctx) => {
  ctx.session.step = undefined;
  ctx.session.onboarding = undefined;
  ctx.session.settingsEdit = undefined;
  await ctx.reply("Cancelled. Tap /start to begin again.");
});

export default composer;
