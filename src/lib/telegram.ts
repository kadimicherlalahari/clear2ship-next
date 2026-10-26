// Telegram alerts through a bot (create one with @BotFather; set TELEGRAM_BOT_TOKEN).
// Each seller gives their chat ID. Without a token or chat ID, the alert says Telegram isn't connected.

export type ChannelResult = { status: "sent" | "outbox" | "not_connected" | "failed"; detail: string };

export async function sendTelegram(chatId: string | null, text: string, buttons: { text: string; url: string }[]): Promise<ChannelResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { status: "not_connected", detail: "Telegram isn't connected yet (no bot token)." };
  if (!chatId) return { status: "not_connected", detail: "No Telegram chat ID for this seller." };

  // Telegram only accepts public web addresses on buttons; local links go in the text instead.
  const publicLinks = buttons.every((b) => /^https:\/\/(?!localhost|127\.)/.test(b.url));
  const body = {
    chat_id: chatId,
    text: publicLinks || !buttons.length ? text : `${text}\n\n${buttons.map((b) => `${b.text}: ${b.url}`).join("\n")}`,
    disable_web_page_preview: true,
    ...(publicLinks && buttons.length ? { reply_markup: { inline_keyboard: buttons.map((b) => [{ text: b.text, url: b.url }]) } } : {}),
  };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    return data.ok ? { status: "sent", detail: "Sent on Telegram." } : { status: "failed", detail: `Telegram: ${data.description ?? res.status}` };
  } catch (e) {
    return { status: "failed", detail: `Telegram: ${e instanceof Error ? e.message : String(e)}` };
  }
}
