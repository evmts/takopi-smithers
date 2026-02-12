import { Workflow, Task, Sequence } from 'smithers';
import { ClaudeCodeAgent } from 'smithers/agents';

const agent = new ClaudeCodeAgent();

export default function BasicCICD() {
  return (
    <Workflow name="basic-ci-cd">
      <Sequence>
        <Task id="run-tests" agent={agent}>
          Run the test suite with `bun test` and report results.
          Update supervisor.summary with test status.
        </Task>

        <Task id="build" agent={agent}>
          Build the project with `bun run build`.
          Verify dist/ output exists.
        </Task>

        <Task id="report" agent={agent}>
          Update supervisor.status to 'done' and supervisor.summary
          with final build + test results.
        </Task>
      </Sequence>
    </Workflow>
  );
}
