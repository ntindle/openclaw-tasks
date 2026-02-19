# @ntindle/openclaw-tasks

Persistent task and plan tracking plugin for [OpenClaw](https://github.com/openclaw/openclaw).

## Features

- **Native tools**: `task_create`, `task_update`, `task_list`, `task_get`
- **File-based storage**: Tasks survive context compaction in `tasks/{project}.json`
- **Plan tracking**: Markdown plans in `plans/{project}.md`
- **Cascading unblocks**: When a blocker completes, blocked tasks auto-unblock
- **Auto-inject**: Active tasks summary injected into session context on startup

## Installation

```bash
# From npm
openclaw plugins install @ntindle/openclaw-tasks

# From GitHub
openclaw plugins install ntindle/openclaw-tasks
```

## Usage

Once installed, the plugin provides these tools to the agent:

### task_create

Create a new task in a project. Creates the project if it doesn't exist.

```
task_create(project: "my-project", subject: "Build the thing")
task_create(project: "my-project", subject: "Deploy", blockedBy: ["task-001"])
```

### task_update

Update a task's status or notes. Handles cascading unblocks automatically.

```
task_update(project: "my-project", taskId: "task-001", status: "completed")
task_update(project: "my-project", taskId: "task-002", notes: "In progress...")
```

### task_list

List tasks for a project or all active projects.

```
task_list()                           # All active projects
task_list(project: "my-project")      # Specific project
task_list(status: "pending")          # Filter by status
```

### task_get

Get details of a specific task.

```
task_get(project: "my-project", taskId: "task-001")
```

## File Format

Tasks are stored as JSON in `tasks/{project}.json`:

```json
{
  "project": "my-project",
  "created": "2026-02-19T20:00:00.000Z",
  "updated": "2026-02-19T21:00:00.000Z",
  "tasks": [
    {
      "id": "task-001",
      "subject": "Build the thing",
      "status": "completed",
      "created": "2026-02-19T20:00:00.000Z",
      "updated": "2026-02-19T21:00:00.000Z",
      "blockedBy": [],
      "notes": ""
    }
  ]
}
```

Plans are stored as Markdown in `plans/{project}.md`.

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Release (patch version)
npm run release

# Release minor/major
npm run release:minor
npm run release:major
```

See [docs/RELEASING.md](docs/RELEASING.md) for detailed release instructions.

## License

MIT
