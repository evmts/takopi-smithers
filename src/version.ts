/**
 * Read version from package.json
 */
export async function getVersion(): Promise<string> {
  try {
    const packageJsonPath = new URL("../package.json", import.meta.url);
    const file = Bun.file(packageJsonPath);
    const packageJson = await file.json();
    return packageJson.version || "unknown";
  } catch (error) {
    console.error("Error reading version:", error);
    return "unknown";
  }
}
