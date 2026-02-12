import packageJson from '../../package.json';

export function showVersion(): void {
  console.log(`takopi-smithers v${packageJson.version}`);
}
