// Telegram bot for orders: sends every new order to the owner's chat (TELEGRAM_CHAT_ID) and to every
// employee who joined with the invite link https://t.me/<bot>?start=<code>. The code keeps strangers out:
// a person who merely finds the bot gets nothing (orders carry customers' names and phones).
// The bot listens with long polling (no webhook, no open port). Subscribers live in DATA_DIR/telegram.json.
import { readFileSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export function createTelegram({ token, chatId, dataDir }) {
  const file = path.join(dataDir, 'telegram.json');
  let state = { code: '', subscribers: [], offset: 0 };
  try { state = { ...state, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch { /* first run */ }
  if (!state.code) state.code = randomBytes(9).toString('base64url');
  const save = async () => {
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 1), { mode: 0o600 });
    await rename(tmp, file);
  };
  save().catch(() => {});

  const api = async (method, body, timeout = 10_000) => {
    const r = await fetch(`${process.env.TELEGRAM_API || 'https://api.telegram.org'}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(timeout),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw Object.assign(new Error(`Telegram ${r.status}${data.description ? `: ${data.description}` : ''}`), { status: r.status });
    return data.result;
  };

  let username = '';
  const targets = () => [...new Set([chatId, ...state.subscribers.map((s) => s.id)].filter(Boolean).map(String))];

  /** order text → every target; succeeds if at least one chat got it */
  async function send(text) {
    const list = targets();
    if (!list.length) throw new Error('Telegram: нет ни одного получателя');
    const res = await Promise.allSettled(list.map((id) => api('sendMessage', { chat_id: id, text, disable_web_page_preview: true }, 8000)));
    // someone blocked the bot or left the group: stop sending to them
    let dropped = false;
    res.forEach((r, i) => {
      if (r.status === 'rejected' && r.reason?.status === 403) {
        const before = state.subscribers.length;
        state.subscribers = state.subscribers.filter((s) => String(s.id) !== list[i]);
        dropped ||= state.subscribers.length !== before;
      }
    });
    if (dropped) save().catch(() => {});
    if (!res.some((r) => r.status === 'fulfilled')) throw res.find((r) => r.status === 'rejected').reason;
    return res.filter((r) => r.status === 'fulfilled').length;
  }

  /* ---------- incoming messages: /start <code>, /stop ---------- */
  async function handle(msg) {
    const chat = msg.chat?.id;
    const text = String(msg.text || '').trim();
    if (!chat || !text.startsWith('/')) return;
    const [cmd, arg = ''] = text.split(/\s+/, 2);
    const name = [msg.chat.title, msg.from?.first_name, msg.from?.last_name, msg.from?.username && `@${msg.from.username}`].filter(Boolean).join(' ').slice(0, 80);
    const reply = (t) => api('sendMessage', { chat_id: chat, text: t }).catch(() => {});
    if (/^\/start(@\w+)?$/.test(cmd)) {
      if (arg && arg === state.code) {
        if (!state.subscribers.some((s) => String(s.id) === String(chat))) {
          state.subscribers.push({ id: chat, name, since: new Date().toISOString() });
          await save();
          console.log(`[telegram] подписан на заявки: ${name || chat}`);
        }
        return reply('✅ Вы подписаны на заявки INKUBIO. Новые заявки с сайта будут приходить сюда.\n\nОтписаться: /stop');
      }
      if (String(chat) === String(chatId) || state.subscribers.some((s) => String(s.id) === String(chat))) return reply('Вы уже получаете заявки INKUBIO. Отписаться: /stop');
      return reply('Этот бот присылает заявки сотрудникам инкубатория INKUBIO. Чтобы получать их, попросите у администратора ссылку-приглашение.\n\nЗаказать цыплят: https://inkubio.com');
    }
    if (/^\/stop(@\w+)?$/.test(cmd)) {
      const before = state.subscribers.length;
      state.subscribers = state.subscribers.filter((s) => String(s.id) !== String(chat));
      if (state.subscribers.length !== before) { await save(); return reply('Вы отписаны от заявок. Вернуться можно по ссылке-приглашению.'); }
      return reply('Вы не подписаны на заявки.');
    }
  }

  let stopped = false;
  async function poll() {
    try {
      const me = await api('getMe');
      username = me.username || '';
      await api('deleteWebhook', {}).catch(() => {}); // long polling does not work while a webhook is set
    } catch (e) {
      console.error(`✗ Telegram: токен не подходит (${e.message}). Проверьте TELEGRAM_BOT_TOKEN.`);
      return;
    }
    while (!stopped) {
      try {
        const updates = await api('getUpdates', { offset: state.offset, timeout: 25, allowed_updates: ['message'] }, 35_000);
        for (const u of updates) {
          state.offset = u.update_id + 1;
          if (u.message) await handle(u.message).catch((e) => console.error('[telegram]', e.message));
        }
        if (updates.length) save().catch(() => {});
      } catch (e) {
        if (e.status === 409) console.error('[telegram] бота опрашивает другая программа (409) — повтор через минуту');
        await new Promise((r) => setTimeout(r, e.status === 409 ? 60_000 : 5_000));
      }
    }
  }
  if (token) poll();

  return {
    ready: () => Boolean(token) && targets().length > 0,
    send,
    /** for the admin panel */
    info: () => ({
      enabled: Boolean(token),
      bot: username,
      link: username ? `https://t.me/${username}?start=${state.code}` : '',
      owner: Boolean(chatId),
      subscribers: state.subscribers.map(({ id, name, since }) => ({ id: String(id), name, since })),
    }),
    async remove(id) { state.subscribers = state.subscribers.filter((s) => String(s.id) !== String(id)); await save(); },
    async newLink() { state.code = randomBytes(9).toString('base64url'); await save(); },
    stop() { stopped = true; },
  };
}
