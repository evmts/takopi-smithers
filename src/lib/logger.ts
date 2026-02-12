const LOG_DIR = ".takopi-smithers/logs";

export async function ensureLogDir(): Promise<void> {
  await Bun.write(`${LOG_DIR}/.gitkeep`, "");
}

export async function log(message: string, level: "info" | "error" | "warn" = "info"): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

  await ensureLogDir();
  const file = Bun.file(`${LOG_DIR}/supervisor.log`);
  const writer = file.writer();
  writer.write(logEntry);
  await writer.end();

  // Also print to console
  if (level === "error") {
    console.error(logEntry.trim());
  } else {
    console.log(logEntry.trim());
  }
}
