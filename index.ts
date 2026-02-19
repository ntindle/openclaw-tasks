/**
 * OpenClaw Tasks Plugin
 * 
 * Persistent task and plan tracking that survives context compaction.
 * Inspired by Claude Code's Task system.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
// Types
// ============================================================================

type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";

type Task = {
  id: string;
  subject: string;
  status: TaskStatus;
  blockedBy: string[];
  blocks: string[];
  notes: string;
};

type TaskProject = {
  project: string;
  status: "active" | "paused" | "completed";
  created: string;
  updated: string;
  tasks: Task[];
};

type TasksConfig = {
  tasksDir: string;
  plansDir: string;
  autoInject: boolean;
  autoSaveOnCompaction: boolean;
};

// ============================================================================
// Storage Layer
// ============================================================================

class TaskStorage {
  constructor(
    private readonly tasksDir: string,
    private readonly plansDir: string,
  ) {
    // Ensure directories exist
    fs.mkdirSync(this.tasksDir, { recursive: true });
    fs.mkdirSync(this.plansDir, { recursive: true });
  }

  private projectPath(project: string): string {
    return path.join(this.tasksDir, `${project}.json`);
  }

  private planPath(project: string): string {
    return path.join(this.plansDir, `${project}.md`);
  }

  listProjects(): string[] {
    try {
      return fs.readdirSync(this.tasksDir)
        .filter(f => f.endsWith(".json"))
        .map(f => f.replace(".json", ""));
    } catch {
      return [];
    }
  }

  getProject(project: string): TaskProject | null {
    const filePath = this.projectPath(project);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as TaskProject;
    } catch {
      return null;
    }
  }

  saveProject(data: TaskProject): void {
    const filePath = this.projectPath(data.project);
    data.updated = new Date().toISOString().split("T")[0];
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  createProject(project: string): TaskProject {
    const today = new Date().toISOString().split("T")[0];
    const data: TaskProject = {
      project,
      status: "active",
      created: today,
      updated: today,
      tasks: [],
    };
    this.saveProject(data);
    
    // Create plan file
    const planContent = `# ${project}

**Status:** active
**Started:** ${today}
**Last Updated:** ${today}

## Goal
[Describe the objective]

## Phases

### Phase 1: [Name]
- [ ] Step 1
- [ ] Step 2

## Notes
[Context, decisions, blockers]
`;
    fs.writeFileSync(this.planPath(project), planContent);
    
    return data;
  }

  getActiveProjects(): TaskProject[] {
    return this.listProjects()
      .map(p => this.getProject(p))
      .filter((p): p is TaskProject => p !== null && p.status === "active");
  }

  addTask(project: string, subject: string): Task {
    let data = this.getProject(project);
    if (!data) {
      data = this.createProject(project);
    }

    const maxId = data.tasks.reduce((max, t) => Math.max(max, parseInt(t.id) || 0), 0);
    const task: Task = {
      id: String(maxId + 1),
      subject,
      status: "pending",
      blockedBy: [],
      blocks: [],
      notes: "",
    };

    data.tasks.push(task);
    this.saveProject(data);
    return task;
  }

  updateTaskStatus(project: string, taskId: string, status: TaskStatus): { task: Task; unblocked: string[] } {
    const data = this.getProject(project);
    if (!data) {
      throw new Error(`Project '${project}' not found`);
    }

    const task = data.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found in project '${project}'`);
    }

    task.status = status;
    const unblocked: string[] = [];

    // If completing, check for cascading unblocks
    if (status === "completed") {
      for (const t of data.tasks) {
        if (t.blockedBy.includes(taskId)) {
          t.blockedBy = t.blockedBy.filter(id => id !== taskId);
          if (t.blockedBy.length === 0 && t.status === "blocked") {
            t.status = "pending";
            unblocked.push(t.id);
          }
        }
      }
    }

    this.saveProject(data);
    return { task, unblocked };
  }

  setBlocker(project: string, taskId: string, blockerId: string): void {
    const data = this.getProject(project);
    if (!data) {
      throw new Error(`Project '${project}' not found`);
    }

    const task = data.tasks.find(t => t.id === taskId);
    const blocker = data.tasks.find(t => t.id === blockerId);
    if (!task || !blocker) {
      throw new Error(`Task not found`);
    }

    if (!task.blockedBy.includes(blockerId)) {
      task.blockedBy.push(blockerId);
      task.status = "blocked";
    }
    if (!blocker.blocks.includes(taskId)) {
      blocker.blocks.push(taskId);
    }

    this.saveProject(data);
  }

  updateTaskNotes(project: string, taskId: string, notes: string): void {
    const data = this.getProject(project);
    if (!data) {
      throw new Error(`Project '${project}' not found`);
    }

    const task = data.tasks.find(t => t.id === taskId);
    if (!task) {
      throw new Error(`Task '${taskId}' not found`);
    }

    task.notes = notes;
    this.saveProject(data);
  }
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatTaskList(project: TaskProject): string {
  const lines = [`=== ${project.project} ===`];
  for (const task of project.tasks) {
    const statusIcon = 
      task.status === "completed" ? "✓" :
      task.status === "in_progress" ? "→" :
      task.status === "blocked" ? "⊘" : " ";
    
    let line = `[${statusIcon}] #${task.id}: ${task.subject}`;
    if (task.blockedBy.length > 0) {
      line += ` (blocked by: ${task.blockedBy.join(", ")})`;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function formatActiveTasksSummary(projects: TaskProject[]): string {
  if (projects.length === 0) {
    return "";
  }

  const lines = ["<active-tasks>", "Active task projects for context:"];
  
  for (const project of projects) {
    const inProgress = project.tasks.filter(t => t.status === "in_progress");
    const pending = project.tasks.filter(t => t.status === "pending");
    const blocked = project.tasks.filter(t => t.status === "blocked");
    
    lines.push(`\n## ${project.project}`);
    
    if (inProgress.length > 0) {
      lines.push("In Progress:");
      for (const t of inProgress) {
        lines.push(`  - #${t.id}: ${t.subject}`);
      }
    }
    
    if (pending.length > 0) {
      lines.push(`Pending: ${pending.length} tasks`);
    }
    
    if (blocked.length > 0) {
      lines.push(`Blocked: ${blocked.length} tasks`);
    }
  }
  
  lines.push("</active-tasks>");
  return lines.join("\n");
}

// ============================================================================
// Plugin Definition
// ============================================================================

const tasksPlugin = {
  id: "tasks",
  name: "Tasks",
  description: "Persistent task and plan tracking with dependency management",

  register(api: OpenClawPluginApi) {
    const cfg = (api.pluginConfig ?? {}) as Partial<TasksConfig>;
    const tasksDir = api.resolvePath(cfg.tasksDir ?? "tasks");
    const plansDir = api.resolvePath(cfg.plansDir ?? "plans");
    const autoInject = cfg.autoInject !== false;
    const autoSaveOnCompaction = cfg.autoSaveOnCompaction !== false;

    const storage = new TaskStorage(tasksDir, plansDir);

    api.logger.info(`tasks: plugin registered (tasks: ${tasksDir}, plans: ${plansDir})`);

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool({
      name: "task_create",
      label: "Task Create",
      description: "Create a new task in a project. Creates the project if it doesn't exist.",
      parameters: Type.Object({
        project: Type.String({ description: "Project name (kebab-case)" }),
        subject: Type.String({ description: "Task description" }),
        blockedBy: Type.Optional(Type.Array(Type.String(), { description: "Task IDs this is blocked by" })),
      }),
      async execute(_id, params) {
        const { project, subject, blockedBy } = params as { 
          project: string; 
          subject: string; 
          blockedBy?: string[];
        };

        const task = storage.addTask(project, subject);
        
        if (blockedBy && blockedBy.length > 0) {
          for (const blockerId of blockedBy) {
            try {
              storage.setBlocker(project, task.id, blockerId);
            } catch {
              // Ignore if blocker doesn't exist
            }
          }
        }

        return {
          content: [{ type: "text", text: `Created task #${task.id}: ${subject}` }],
          details: { taskId: task.id, project },
        };
      },
    });

    api.registerTool({
      name: "task_update",
      label: "Task Update",
      description: "Update a task's status or notes. Handles cascading unblocks automatically.",
      parameters: Type.Object({
        project: Type.String({ description: "Project name" }),
        taskId: Type.String({ description: "Task ID" }),
        status: Type.Optional(Type.Union([
          Type.Literal("pending"),
          Type.Literal("in_progress"),
          Type.Literal("completed"),
          Type.Literal("blocked"),
        ], { description: "New status" })),
        notes: Type.Optional(Type.String({ description: "Task notes" })),
      }),
      async execute(_id, params) {
        const { project, taskId, status, notes } = params as {
          project: string;
          taskId: string;
          status?: TaskStatus;
          notes?: string;
        };

        const results: string[] = [];

        if (status) {
          const { task, unblocked } = storage.updateTaskStatus(project, taskId, status);
          results.push(`Task #${taskId} status: ${status}`);
          
          for (const id of unblocked) {
            results.push(`Task #${id} unblocked!`);
          }
        }

        if (notes !== undefined) {
          storage.updateTaskNotes(project, taskId, notes);
          results.push(`Notes updated for task #${taskId}`);
        }

        return {
          content: [{ type: "text", text: results.join("\n") }],
          details: { project, taskId, status, notes },
        };
      },
    });

    api.registerTool({
      name: "task_list",
      label: "Task List",
      description: "List tasks for a project or all active projects.",
      parameters: Type.Object({
        project: Type.Optional(Type.String({ description: "Project name (omit for all active)" })),
        status: Type.Optional(Type.String({ description: "Filter by status" })),
      }),
      async execute(_id, params) {
        const { project, status } = params as { project?: string; status?: string };

        if (project) {
          const data = storage.getProject(project);
          if (!data) {
            return {
              content: [{ type: "text", text: `Project '${project}' not found` }],
              details: { found: false },
            };
          }

          let tasks = data.tasks;
          if (status) {
            tasks = tasks.filter(t => t.status === status);
          }

          return {
            content: [{ type: "text", text: formatTaskList({ ...data, tasks }) }],
            details: { project, taskCount: tasks.length },
          };
        }

        // List all projects
        const projects = storage.listProjects();
        const summaries = projects.map(p => {
          const data = storage.getProject(p);
          if (!data) return `${p}: (error reading)`;
          const completed = data.tasks.filter(t => t.status === "completed").length;
          return `${p} [${data.status}]: ${completed}/${data.tasks.length} completed`;
        });

        return {
          content: [{ type: "text", text: summaries.join("\n") || "No projects found" }],
          details: { projectCount: projects.length },
        };
      },
    });

    api.registerTool({
      name: "task_get",
      label: "Task Get",
      description: "Get details of a specific task.",
      parameters: Type.Object({
        project: Type.String({ description: "Project name" }),
        taskId: Type.String({ description: "Task ID" }),
      }),
      async execute(_id, params) {
        const { project, taskId } = params as { project: string; taskId: string };

        const data = storage.getProject(project);
        if (!data) {
          return {
            content: [{ type: "text", text: `Project '${project}' not found` }],
            details: { found: false },
          };
        }

        const task = data.tasks.find(t => t.id === taskId);
        if (!task) {
          return {
            content: [{ type: "text", text: `Task '${taskId}' not found in project '${project}'` }],
            details: { found: false },
          };
        }

        const lines = [
          `Task #${task.id}: ${task.subject}`,
          `Status: ${task.status}`,
          task.blockedBy.length > 0 ? `Blocked by: ${task.blockedBy.join(", ")}` : null,
          task.blocks.length > 0 ? `Blocks: ${task.blocks.join(", ")}` : null,
          task.notes ? `Notes: ${task.notes}` : null,
        ].filter(Boolean);

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { task },
        };
      },
    });

    // ========================================================================
    // Lifecycle Hooks
    // ========================================================================

    // Auto-inject: add active tasks summary to context on session start
    if (autoInject) {
      api.on("before_agent_start", async () => {
        const activeProjects = storage.getActiveProjects();
        if (activeProjects.length === 0) {
          return;
        }

        const summary = formatActiveTasksSummary(activeProjects);
        if (summary) {
          api.logger.info?.(`tasks: injecting ${activeProjects.length} active project(s) into context`);
          return { prependContext: summary };
        }
      });
    }

    // Auto-save on compaction: ensure task state is persisted
    if (autoSaveOnCompaction) {
      api.on("before_compaction", async () => {
        api.logger.info?.("tasks: context compacting, task state is already file-backed");
        // Tasks are already file-backed, nothing extra needed
        // But we could add a timestamp marker here if useful
      });
    }

    // ========================================================================
    // CLI Commands
    // ========================================================================

    api.registerCli(
      ({ program }) => {
        const tasks = program.command("tasks").description("Task management commands");

        tasks
          .command("list")
          .description("List all projects or tasks in a project")
          .argument("[project]", "Project name")
          .action(async (project?: string) => {
            if (project) {
              const data = storage.getProject(project);
              if (!data) {
                console.log(`Project '${project}' not found`);
                return;
              }
              console.log(formatTaskList(data));
            } else {
              const projects = storage.listProjects();
              for (const p of projects) {
                const data = storage.getProject(p);
                if (data) {
                  const completed = data.tasks.filter(t => t.status === "completed").length;
                  console.log(`${p} [${data.status}]: ${completed}/${data.tasks.length} completed`);
                }
              }
            }
          });

        tasks
          .command("active")
          .description("Show active projects with in-progress tasks")
          .action(async () => {
            const activeProjects = storage.getActiveProjects();
            console.log(formatActiveTasksSummary(activeProjects) || "No active projects");
          });

        tasks
          .command("add")
          .description("Add a task to a project")
          .argument("<project>", "Project name")
          .argument("<subject>", "Task description")
          .action(async (project: string, subject: string) => {
            const task = storage.addTask(project, subject);
            console.log(`Added task #${task.id}: ${subject}`);
          });
      },
      { commands: ["tasks"] },
    );

    // ========================================================================
    // Service
    // ========================================================================

    api.registerService({
      id: "tasks",
      start: () => {
        const projects = storage.listProjects();
        const active = storage.getActiveProjects();
        api.logger.info(
          `tasks: initialized (${projects.length} projects, ${active.length} active)`
        );
      },
      stop: () => {
        api.logger.info("tasks: stopped");
      },
    });
  },
};

export default tasksPlugin;
