// Testing Automation Workflow
// Demonstrates: Automated test generation and coverage improvement
//
// This workflow shows:
// - Ralph loop iteration until coverage threshold is met
// - Incremental test generation for uncovered functions
// - Running tests and collecting results
// - Using test coverage metrics to guide workflow
// - Demonstrating progressive improvement over iterations

import { smithers, Workflow, Task, Ralph, ClaudeCodeAgent } from "smithers-orchestrator";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Schema - Test automation pipeline
// ---------------------------------------------------------------------------

const inputTable = sqliteTable("input", {
  runId: text("run_id").primaryKey(),
  targetPath: text("target_path").notNull(), // Directory or file to test
  coverageThreshold: integer("coverage_threshold").notNull().default(80), // Target coverage %
  maxIterations: integer("max_iterations").notNull().default(10),
});

const scanTable = sqliteTable(
  "scan",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    totalFunctions: integer("total_functions").notNull(),
    testedFunctions: integer("tested_functions").notNull(),
    untestedFunctions: text("untested_functions", { mode: "json" }).$type<Array<{
      file: string;
      name: string;
      lineNumber: number;
      complexity: number;
    }>>(),
    existingTests: text("existing_tests", { mode: "json" }).$type<string[]>(),
    currentCoverage: integer("current_coverage").notNull(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const generateTable = sqliteTable(
  "generate",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    targetFunction: text("target_function").notNull(),
    testFile: text("test_file").notNull(),
    testCases: text("test_cases", { mode: "json" }).$type<Array<{
      name: string;
      description: string;
      type: string; // "unit", "edge-case", "error-handling"
    }>>(),
    testsGenerated: integer("tests_generated").notNull(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }) })
);

const runTestsTable = sqliteTable(
  "run_tests",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    testsPassed: integer("tests_passed").notNull(),
    testsFailed: integer("tests_failed").notNull(),
    coveragePercent: integer("coverage_percent").notNull(),
    failures: text("failures", { mode: "json" }).$type<Array<{
      test: string;
      error: string;
    }>>(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }) })
);

const fixFailuresTable = sqliteTable(
  "fix_failures",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    iteration: integer("iteration").notNull().default(0),
    testsFailed: integer("tests_failed").notNull(),
    testsFixed: integer("tests_fixed").notNull(),
    fixesApplied: text("fixes_applied", { mode: "json" }).$type<string[]>(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId, t.iteration] }) })
);

const reportTable = sqliteTable(
  "report",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    initialCoverage: integer("initial_coverage").notNull(),
    finalCoverage: integer("final_coverage").notNull(),
    testsAdded: integer("tests_added").notNull(),
    iterationsCompleted: integer("iterations_completed").notNull(),
    reportPath: text("report_path").notNull(),
    summary: text("summary").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

const outputTable = sqliteTable(
  "output",
  {
    runId: text("run_id").notNull(),
    nodeId: text("node_id").notNull(),
    status: text("status").notNull(),
    coverageImprovement: integer("coverage_improvement").notNull(),
    testsGenerated: integer("tests_generated").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.runId, t.nodeId] }) })
);

export const schema = {
  input: inputTable,
  scan: scanTable,
  generate: generateTable,
  runTests: runTestsTable,
  fixFailures: fixFailuresTable,
  report: reportTable,
  output: outputTable,
};

export const db = drizzle(".smithers/testing-automation.db", { schema });

// Create tables
(db as any).$client.exec(`
  CREATE TABLE IF NOT EXISTS input (
    run_id TEXT PRIMARY KEY,
    target_path TEXT NOT NULL,
    coverage_threshold INTEGER NOT NULL DEFAULT 80,
    max_iterations INTEGER NOT NULL DEFAULT 10
  );
  CREATE TABLE IF NOT EXISTS scan (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    total_functions INTEGER NOT NULL, tested_functions INTEGER NOT NULL,
    untested_functions TEXT, existing_tests TEXT,
    current_coverage INTEGER NOT NULL, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS generate (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL, iteration INTEGER NOT NULL DEFAULT 0,
    target_function TEXT NOT NULL, test_file TEXT NOT NULL,
    test_cases TEXT, tests_generated INTEGER NOT NULL, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id, iteration)
  );
  CREATE TABLE IF NOT EXISTS run_tests (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL, iteration INTEGER NOT NULL DEFAULT 0,
    tests_passed INTEGER NOT NULL, tests_failed INTEGER NOT NULL,
    coverage_percent INTEGER NOT NULL, failures TEXT, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id, iteration)
  );
  CREATE TABLE IF NOT EXISTS fix_failures (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL, iteration INTEGER NOT NULL DEFAULT 0,
    tests_failed INTEGER NOT NULL, tests_fixed INTEGER NOT NULL,
    fixes_applied TEXT, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id, iteration)
  );
  CREATE TABLE IF NOT EXISTS report (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    initial_coverage INTEGER NOT NULL, final_coverage INTEGER NOT NULL,
    tests_added INTEGER NOT NULL, iterations_completed INTEGER NOT NULL,
    report_path TEXT NOT NULL, summary TEXT NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS output (
    run_id TEXT NOT NULL, node_id TEXT NOT NULL,
    status TEXT NOT NULL, coverage_improvement INTEGER NOT NULL,
    tests_generated INTEGER NOT NULL,
    PRIMARY KEY (run_id, node_id)
  );
  CREATE TABLE IF NOT EXISTS state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// ---------------------------------------------------------------------------
// Supervisor state management
// ---------------------------------------------------------------------------

function updateState(key: string, value: string) {
  try {
    (db as any).$client.run(
      "INSERT OR REPLACE INTO state (key, value, updated_at) VALUES (?, ?, datetime('now'))",
      [key, value]
    );
  } catch (err) {
    console.error(`Failed to update state ${key}:`, err);
  }
}

updateState("supervisor.status", "running");
updateState("supervisor.summary", "Testing automation workflow initialized");
updateState("supervisor.heartbeat", new Date().toISOString());

// Update heartbeat every 30 seconds
setInterval(() => {
  try {
    updateState("supervisor.heartbeat", new Date().toISOString());
  } catch (err) {
    console.error("Heartbeat failed:", err);
  }
}, 30000);

// ---------------------------------------------------------------------------
// Agents - Test generation and execution
// ---------------------------------------------------------------------------

const cliEnv = { ANTHROPIC_API_KEY: "" };

const scanAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior test engineer. Analyze the codebase to identify untested functions. " +
    "Find all exported functions and check if they have corresponding tests. " +
    "Calculate current test coverage. " +
    "Respond with ONLY a JSON object: " +
    '{ "totalFunctions": 50, "testedFunctions": 30, ' +
    '"untestedFunctions": [{"file": "src/utils.ts", "name": "parseDate", "lineNumber": 42, "complexity": 3}], ' +
    '"existingTests": ["src/utils.test.ts"], "currentCoverage": 60, ' +
    '"summary": "Found 20 untested functions across 5 files" }',
});

const generateAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior test engineer. Generate comprehensive tests for ONE function. " +
    "Include: happy path, edge cases, error handling, boundary conditions. " +
    "Use bun:test framework. Follow existing test patterns. " +
    "Respond with ONLY a JSON object: " +
    '{ "targetFunction": "parseDate", "testFile": "src/utils.test.ts", ' +
    '"testCases": [{"name": "parses valid ISO date", "description": "...", "type": "unit"}], ' +
    '"testsGenerated": 5, "summary": "Generated 5 test cases for parseDate()" }',
});

const runTestsAgent = new ClaudeCodeAgent({
  model: "haiku",
  env: cliEnv,
  systemPrompt: "You are a QA engineer. Run the test suite and collect coverage. " +
    "Use 'bun test' to run tests. Use 'bun test --coverage' for coverage report. " +
    "Respond with ONLY a JSON object: " +
    '{ "testsPassed": 45, "testsFailed": 2, "coveragePercent": 75, ' +
    '"failures": [{"test": "parseDate handles invalid input", "error": "Expected error not thrown"}], ' +
    '"summary": "45/47 tests passed, coverage at 75%" }',
});

const fixFailuresAgent = new ClaudeCodeAgent({
  model: "sonnet",
  env: cliEnv,
  systemPrompt: "You are a senior test engineer. Fix failing tests by correcting the test code. " +
    "Analyze why tests are failing - usually test expectations or setup issues. " +
    "Fix the test code, not the implementation (unless the implementation is clearly wrong). " +
    "Respond with ONLY a JSON object: " +
    '{ "testsFailed": 2, "testsFixed": 2, ' +
    '"fixesApplied": ["Fixed assertion in parseDate test", "Added missing test setup"], ' +
    '"summary": "Fixed 2 failing tests" }',
});

const reportAgent = new ClaudeCodeAgent({
  model: "haiku",
  env: cliEnv,
  systemPrompt: "You are a test engineer. Generate a test coverage improvement report. " +
    "Show before/after coverage, tests added, iterations completed. " +
    "Write to markdown file. " +
    "Respond with ONLY a JSON object: " +
    '{ "initialCoverage": 60, "finalCoverage": 85, "testsAdded": 25, ' +
    '"iterationsCompleted": 5, "reportPath": "test-report.md", ' +
    '"summary": "Improved coverage from 60% to 85% by adding 25 tests" }',
});

// ---------------------------------------------------------------------------
// Workflow - Ralph loop for iterative test generation
// ---------------------------------------------------------------------------

export default smithers(db, (ctx) => {
  // Read outputs from previous tasks
  const scan = ctx.outputs.scan?.[0];
  const generations = ctx.outputs.generate ?? [];
  const testRuns = ctx.outputs.runTests ?? [];
  const fixes = ctx.outputs.fixFailures ?? [];
  const report = ctx.outputs.report?.[0];

  // Calculate current iteration
  const currentIteration = generations.length;

  // Get latest test run results
  const latestTestRun = testRuns[testRuns.length - 1];
  const currentCoverage = latestTestRun?.coveragePercent ?? scan?.currentCoverage ?? 0;

  // Determine if we've met the coverage threshold
  const coverageThreshold = ctx.input.coverageThreshold ?? 80;
  const maxIterations = ctx.input.maxIterations ?? 10;
  const coverageMetThreshold = currentCoverage >= coverageThreshold;

  // Find next function to test
  const untestedFunctions = scan?.untestedFunctions ?? [];
  const testedInThisRun = generations.map((g: any) => g.targetFunction);
  const nextFunction = untestedFunctions.find((f: any) =>
    !testedInThisRun.includes(f.name)
  );

  // Check if we need to fix failing tests
  const hasFailures = latestTestRun && latestTestRun.testsFailed > 0;
  const failuresAlreadyFixed = fixes.some((f: any) => f.iteration === currentIteration - 1);
  const needsFixing = hasFailures && !failuresAlreadyFixed;

  // Determine if we should continue the loop
  const shouldContinue = !coverageMetThreshold &&
                        currentIteration < maxIterations &&
                        (nextFunction || needsFixing);

  // Update supervisor state
  updateState("supervisor.status", "running");
  updateState(
    "supervisor.summary",
    `Test Automation [iteration ${currentIteration}/${maxIterations}]: ` +
    `${currentCoverage}% coverage (target: ${coverageThreshold}%)`
  );

  return (
    <Workflow name="testing-automation">
      {/* RALPH LOOP: Continue until coverage threshold met or max iterations */}
      <Ralph until={!shouldContinue} maxIterations={maxIterations} onMaxReached="return-last">
        {/* SCAN PHASE: Analyze codebase once at the start */}
        <Task
          id="scan"
          output={schema.scan}
          agent={scanAgent}
          skipIf={!!scan}
          retries={2}
        >
          {`Scan the codebase at ${ctx.input.targetPath ?? "src/"} for untested functions.\n` +
            `\n` +
            `Steps:\n` +
            `1. Find all exported functions in TypeScript/JavaScript files\n` +
            `2. Check which functions have corresponding tests\n` +
            `3. Run 'bun test --coverage' to get current coverage percentage\n` +
            `4. List all untested functions with their file paths and complexity\n` +
            `5. Identify existing test files and their patterns\n` +
            `\n` +
            `Target coverage: ${coverageThreshold}%`}
        </Task>

        {/* FIX PHASE: Fix any failing tests before generating new ones */}
        <Task
          id="fix-failures"
          output={schema.fixFailures}
          agent={fixFailuresAgent}
          skipIf={!needsFixing}
          retries={2}
        >
          {needsFixing
            ? `Fix the ${latestTestRun.testsFailed} failing tests:\n\n` +
              JSON.stringify(latestTestRun.failures, null, 2) + "\n\n" +
              `Analyze each failure and fix the test code. ` +
              `Common issues: incorrect assertions, missing mocks, async timing. ` +
              `Run tests after fixing to verify.`
            : "No failures to fix."}
        </Task>

        {/* GENERATE PHASE: Create tests for one uncovered function */}
        <Task
          id="generate-tests"
          output={schema.generate}
          agent={generateAgent}
          skipIf={!nextFunction}
          retries={2}
        >
          {nextFunction
            ? `Generate comprehensive tests for function: ${nextFunction.name}\n` +
              `File: ${nextFunction.file}\n` +
              `Line: ${nextFunction.lineNumber}\n` +
              `Complexity: ${nextFunction.complexity}/5\n` +
              `\n` +
              `Generate tests for:\n` +
              `1. Happy path / normal usage\n` +
              `2. Edge cases (empty input, null, undefined, boundary values)\n` +
              `3. Error handling (invalid input, exceptions)\n` +
              `4. Type safety (if TypeScript)\n` +
              `\n` +
              `Use bun:test framework. Follow patterns in: ${scan?.existingTests?.[0] ?? "existing tests"}.\n` +
              `Add tests to the appropriate test file.`
            : "All functions have tests."}
        </Task>

        {/* RUN TESTS PHASE: Execute tests and collect coverage */}
        <Task
          id="run-tests"
          output={schema.runTests}
          agent={runTestsAgent}
          skipIf={!nextFunction && !needsFixing}
          retries={2}
        >
          {`Run the full test suite with coverage:\n` +
            `\n` +
            `Commands:\n` +
            `1. bun test --coverage\n` +
            `2. Parse coverage report to get percentage\n` +
            `3. Identify any test failures\n` +
            `\n` +
            `Current iteration: ${currentIteration}\n` +
            `Tests generated so far: ${generations.reduce((sum: number, g: any) => sum + g.testsGenerated, 0)}\n` +
            `\n` +
            `Report: total tests passed/failed and current coverage percentage.`}
        </Task>
      </Ralph>

      {/* REPORT PHASE: Generate summary after loop completes */}
      <Task
        id="report"
        output={schema.report}
        agent={reportAgent}
        skipIf={!!report}
        retries={1}
      >
        {`Generate test automation summary report:\n` +
          `\n` +
          `Initial Coverage: ${scan?.currentCoverage ?? 0}%\n` +
          `Final Coverage: ${currentCoverage}%\n` +
          `Tests Added: ${generations.reduce((sum: number, g: any) => sum + g.testsGenerated, 0)}\n` +
          `Iterations: ${currentIteration}\n` +
          `Target Threshold: ${coverageThreshold}%\n` +
          `Threshold Met: ${coverageMetThreshold ? "Yes" : "No"}\n` +
          `\n` +
          `Include:\n` +
          `- Coverage improvement graph\n` +
          `- List of functions tested\n` +
          `- Test quality metrics\n` +
          `- Recommendations for further improvement\n` +
          `\n` +
          `Write to: test-coverage-report-${new Date().toISOString().split('T')[0]}.md`}
      </Task>

      {/* FINAL: Output results */}
      <Task id="done" output={schema.output}>
        {{
          status: coverageMetThreshold ? "success" : "partial",
          coverageImprovement: currentCoverage - (scan?.currentCoverage ?? 0),
          testsGenerated: generations.reduce((sum: number, g: any) => sum + g.testsGenerated, 0),
        }}
      </Task>
    </Workflow>
  );
});

// ---------------------------------------------------------------------------
// Shutdown handlers
// ---------------------------------------------------------------------------

process.on("beforeExit", () => {
  try {
    const scan = (db as any).select().from(schema.scan).all();
    const testRuns = (db as any).select().from(schema.runTests).all();
    const initialCoverage = scan[0]?.currentCoverage ?? 0;
    const finalCoverage = testRuns[testRuns.length - 1]?.coveragePercent ?? initialCoverage;

    updateState("supervisor.status", "done");
    updateState(
      "supervisor.summary",
      `Testing automation complete: ${initialCoverage}% → ${finalCoverage}% coverage`
    );
  } catch (err) {
    console.error("Failed to update final state:", err);
  }
});
