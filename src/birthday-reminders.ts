import {
  birthdaysTodayJst,
  birthdayAlertKey,
  formatBirthdayLabel,
  getJstYmd,
} from "./student-birthdays";

interface BirthdayEnv {
  HOMEWORK_KV?: KVNamespace;
  DISCORD_WEBHOOK_URL?: string;
  DISCORD_CHANNEL_ID?: string;
}

function sanitizeWebhookUrl(raw: string | undefined): string | null {
  if (raw == null || raw === "") return null;
  let url = String(raw).trim().replace(/[\u0000-\u001F\u007F]/g, "");
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1).trim();
  }
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//i.test(url)) {
    return null;
  }
  return url;
}

async function getWebhookChannelMismatch(
  webhookUrl: string,
  expectedChannelId: string | undefined
): Promise<string | null> {
  const expected = expectedChannelId?.trim();
  if (!expected) return null;

  const res = await fetch(webhookUrl);
  if (!res.ok) return "Could not verify Discord webhook configuration.";

  const wh = (await res.json()) as { channel_id?: string };
  if (wh.channel_id === expected) return null;

  return (
    `Discord webhook is not pointed at #website-inquiries (expected channel ${expected}).`
  );
}

async function postDiscordBirthday(
  webhookUrl: string,
  name: string,
  label: string,
  uncertain: boolean
): Promise<boolean> {
  const body = {
    embeds: [
      {
        title: "Website inquiries — student birthday today",
        color: 0xd4a853,
        fields: [
          { name: "Student", value: name, inline: true },
          { name: "Birthday", value: label, inline: true },
          ...(uncertain
            ? [{ name: "Note", value: "Date marked uncertain in your list.", inline: false }]
            : []),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function runBirthdayReminders(env: BirthdayEnv): Promise<void> {
  const webhookUrl = sanitizeWebhookUrl(env.DISCORD_WEBHOOK_URL);
  if (!webhookUrl) {
    console.error("birthday-reminders: DISCORD_WEBHOOK_URL not configured");
    return;
  }

  const channelError = await getWebhookChannelMismatch(
    webhookUrl,
    env.DISCORD_CHANNEL_ID
  );
  if (channelError) {
    console.error("birthday-reminders:", channelError);
    return;
  }

  const kv = env.HOMEWORK_KV;
  if (!kv) {
    console.error("birthday-reminders: HOMEWORK_KV not configured");
    return;
  }

  const { year, month, day } = getJstYmd();
  const today = birthdaysTodayJst();

  if (!today.length) return;

  for (const entry of today) {
    const alertKey = birthdayAlertKey(year, month, day, entry.id);
    const already = await kv.get(alertKey);
    if (already) continue;

    const ok = await postDiscordBirthday(
      webhookUrl,
      entry.name,
      formatBirthdayLabel(entry),
      !!entry.uncertain
    );

    if (ok) {
      await kv.put(alertKey, "1", { expirationTtl: 60 * 60 * 48 });
    } else {
      console.error("birthday-reminders: Discord post failed for", entry.id);
    }
  }
}
