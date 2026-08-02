// Testing Automation Workflow
// Demonstrates: iterative test generation until a coverage threshold is met.

import { createSmithers, ClaudeCodeAgent } from "smthrs";
import { z } from "zod";

const inputSchema = z.object({
  targetPath: z.string().default("src"),
  coverageThreshold: z.number().default(80),
  maxIterations: z.number().default(10),
});

const functionGapSchema = z.object({
  file: z.string(),
  name: z.string(),
  lineNumber: z.number(),
  complexity: z.number(),
});

const scanSchema = z.object({
  totalFunctions: z.number(),
  testedFunctions: z.number(),
  untestedFunctions: z.array(functionGapSchema).default([]),
  existingTests: z.array(z.string()).default([]),
  currentCoverage: z.number(),
  summary: z.string(),
});

const generateSchema = z.object({
  targetFunction: z.string(),
  testFile: z.string(),
  testCases: z.array(z.object({
    name: z.string(),
    description: z.string(),
    type: z.string(),
  })).default([]),
  testsGenerated: z.number(),
  summary: z.string(),
});

const runTestsSchema = z.object({
  testsPassed: z.number(),
  testsFailed: z.number(),
  coveragePercent: z.number(),
  failures: z.array(z.object({
    test: z.string(),
    error: z.string(),
  })).default([]),
  summary: z.string(),
});

const fixFailuresSchema = z.object({
  testsFailed: z.number(),
  testsFixed: z.number(),
  fixesApplied: z.array(z.string()).default([]),
  summary: z.string(),
});

const reportSchema = z.object({
  initialCoverage: z.number(),
  finalCoverage: z.number(),
  testsAdded: z.number(),
  iterationsCompleted: z.number(),
  reportPath: z.string(),
  summary: z.string(),
});

const outputSchema = z.object({
  status: z.string(),
  coverageImprovement: z.number(),
  testsGenerated: z.number(),
});

const { Workflow, Task, Ralph, smithers, outputs, db } = createSmithers(
  {
    input: inputSchema,
    scan: scanSchema,
    generate: generateSchema,
    runTests: runTestsSchema,
    fixFailures: fixFailuresSchema,
    report: reportSchema,
    output: outputSchema,
  },
  { dbPath: ".smithers/testing-automation.db" }
);

const sqlite = (db as any).$client as {
  exec: (sql: string) => unknown;
  run: (sql: string, params?: unknown[]) => unknown;
};

sqlite.exec([
  "CREATE TABLE IF NOT EXISTS state (",
  "  key TEXT PRIMARY KEY,",
  "  value TEXT NOT NULL,",
  "  updated_at TEXT DEFAULT (datetime('now'))",
  ")",
].join("\n"));

function updateState(key: string, value: string) {
  sqlite.run(
    "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    [key, value]
  );
}

updateState("supervisor.status", "running");
updateState("supervisor.summary", "Testing automation workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

const heartbeatTimer = setInterval(() => {
  updateState("supervisor.heartbeat", new Date().toISOString());
}, 30000);
heartbeatTimer.unref?.();

const cliEnv = { ANTHROPIC_API_KEY: "" };

const scanAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior test engineer. Find untested exported functions and current coverage. " +
    "Respond with only JSON matching the scan schema.",
});

const generateAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior test engineer. Generate comprehensive tests for one function. " +
    "Use bun:test and respond with only JSON matching the generate schema.",
});

const runTestsAgent = new ClaudeCodeAgent({
  model: "haiku",
  env: cliEnv,
  systemPrompt: "You are a QA engineer. Run tests and coverage, then respond with only JSON matching the runTests schema.",
});

const fixFailuresAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior test engineer. Fix failing generated tests and respond with only JSON matching the fixFailures schema.",
});

const reportAgent = new ClaudeCodeAgent({
  model: "haiku",
  env: cliEnv,
  systemPrompt: "You are a test engineer. Write a coverage improvement report and respond with only JSON matching the report schema.",
});

export default smithers((ctx) => {
  const scan = ctx.outputs.scan?.[0];
  const generations = ctx.outputs.generate ?? [];
  const testRuns = ctx.outputs.runTests ?? [];
  const fixes = ctx.outputs.fixFailures ?? [];
  const report = ctx.outputs.report?.[0];

  const currentIteration = generations.length;
  const latestTestRun = testRuns[testRuns.length - 1];
  const currentCoverage = latestTestRun?.coveragePercent ?? scan?.currentCoverage ?? 0;
  const coverageThreshold = ctx.input.coverageThreshold ?? 80;
  const maxIterations = ctx.input.maxIterations ?? 10;
  const coverageMetThreshold = currentCoverage >= coverageThreshold;

  const untestedFunctions = scan?.untestedFunctions ?? [];
  const testedInThisRun = generations.map((g: any) => g.targetFunction);
  const nextFunction = untestedFunctions.find((f: any) => !testedInThisRun.includes(f.name));

  const hasFailures = latestTestRun && latestTestRun.testsFailed > 0;
  const failuresAlreadyFixed = fixes.length >= testRuns.length;
  const needsFixing = hasFailures && !failuresAlreadyFixed;
  const shouldContinue =
    !coverageMetThreshold &&
    currentIteration < maxIterations &&
    (nextFunction || needsFixing);

  updateState("supervisor.status", "running");
  updateState(
    "supervisor.summary",
    `Test Automation [iteration ${currentIteration}/${maxIterations}]: ${currentCoverage}% coverage (target: ${coverageThreshold}%)`
  );

  return (
    <Workflow name="testing-automation">
      <Ralph until={!shouldContinue} maxIterations={maxIterations} onMaxReached="return-last">
        <Task id="scan" output={outputs.scan} agent={scanAgent} skipIf={!!scan} retries={2}>
          {`Scan ${ctx.input.targetPath ?? "src"} for exported functions, existing tests, and current coverage.`}
        </Task>

        <Task id="fix-failures" output={outputs.fixFailures} agent={fixFailuresAgent} skipIf={!needsFixing} retries={2}>
          {needsFixing
            ? `Fix these failing tests: ${JSON.stringify(latestTestRun?.failures ?? [])}.`
            : "No failing generated tests to fix."}
        </Task>

        <Task id="generate" output={outputs.generate} agent={generateAgent} skipIf={!nextFunction || needsFixing} retries={2}>
          {nextFunction
            ? `Generate tests for ${nextFunction.name} in ${nextFunction.file}. Include edge cases and error handling.`
            : "No more untested functions."}
        </Task>

        <Task id="run-tests" output={outputs.runTests} agent={runTestsAgent} skipIf={!scan || (!nextFunction && !needsFixing)} retries={1}>
          {"Run the test suite with coverage and report current coverage plus failures."}
        </Task>
      </Ralph>

      <Task id="report" output={outputs.report} agent={reportAgent} skipIf={!scan || !!report} retries={1}>
        {`Generate a coverage report. Initial coverage: ${scan?.currentCoverage ?? 0}. Final coverage: ${currentCoverage}.`}
      </Task>

      <Task id="done" output={outputs.output}>
        {{
          status: coverageMetThreshold ? "threshold-met" : "max-iterations-or-no-work",
          coverageImprovement: currentCoverage - (scan?.currentCoverage ?? currentCoverage),
          testsGenerated: generations.reduce((sum: number, g: any) => sum + (g.testsGenerated ?? 0), 0),
        }}
      </Task>
    </Workflow>
  );
});

process.on("beforeExit", () => {
  updateState("supervisor.status", "done");
  updateState("supervisor.summary", "Testing automation workflow completed");
});
