import { log } from "./logger";

interface TelegramResponse {
  ok: boolean;
  description?: string;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  message: string,
  dryRun: boolean = false,
  messageThreadId?: number
): Promise<void> {
  if (dryRun) {
    await log(`[DRY RUN] Would send Telegram message to chat ${chatId}:`);
    await log(message);
    return;
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const body: Record<string, string | number> = {
    chat_id: chatId,
    text: message,
    parse_mode: "Markdown",
  };

  if (messageThreadId !== undefined) {
    body.message_thread_id = messageThreadId;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as TelegramResponse;

    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description || "Unknown error"}`);
    }

    await log("Telegram message sent successfully");
  } catch (error) {
    await log(`Failed to send Telegram message: ${error}`, "error");
    throw error;
  }
}

export function formatStatusMessage(
  repoName: string,
  branch: string,
  status: string | null,
  summary: string | null,
  heartbeat: string | null
): string {
  const timestamp = new Date().toISOString();
  const statusEmoji = getStatusEmoji(status);

  let message = `${statusEmoji} **${repoName}** (${branch})\n`;
  message += `\n_${timestamp}_\n`;
  message += `\n**Status:** ${status || "unknown"}`;

  if (summary) {
    message += `\n\n${summary}`;
  }

  if (heartbeat) {
    const age = getHeartbeatAge(heartbeat);
    message += `\n\n💓 Last heartbeat: ${age}`;
  }

  return message;
}

function getStatusEmoji(status: string | null): string {
  switch (status) {
    case "running":
      return "🟢";
    case "idle":
      return "🟡";
    case "error":
      return "🔴";
    case "done":
      return "✅";
    default:
      return "❓";
  }
}

function getHeartbeatAge(heartbeat: string): string {
  try {
    const heartbeatTime = new Date(heartbeat).getTime();
    const now = Date.now();
    const ageSeconds = Math.floor((now - heartbeatTime) / 1000);

    if (ageSeconds < 60) {
      return `${ageSeconds}s ago`;
    } else if (ageSeconds < 3600) {
      return `${Math.floor(ageSeconds / 60)}m ago`;
    } else {
      return `${Math.floor(ageSeconds / 3600)}h ago`;
    }
  } catch {
    return heartbeat;
  }
}
