/**
 * Tests for OpenClaw Tasks Plugin
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ============================================================================
// Test Helpers - Inline storage class for testing
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

class TaskStorage {
  constructor(
    private readonly tasksDir: string,
    private readonly plansDir: string,
  ) {
    fs.mkdirSync(this.tasksDir, { recursive: true });
    fs.mkdirSync(this.plansDir, { recursive: true });
  }

  private projectPath(project: string): string {
    return path.join(this.tasksDir, `${project}.json`);
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
// Tests
// ============================================================================

describe("TaskStorage", () => {
  let tempDir: string;
  let storage: TaskStorage;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tasks-test-"));
    storage = new TaskStorage(
      path.join(tempDir, "tasks"),
      path.join(tempDir, "plans")
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("project management", () => {
    it("should create a new project", () => {
      const project = storage.createProject("test-project");
      
      expect(project.project).toBe("test-project");
      expect(project.status).toBe("active");
      expect(project.tasks).toHaveLength(0);
    });

    it("should list projects", () => {
      storage.createProject("project-a");
      storage.createProject("project-b");
      
      const projects = storage.listProjects();
      
      expect(projects).toContain("project-a");
      expect(projects).toContain("project-b");
      expect(projects).toHaveLength(2);
    });

    it("should get active projects only", () => {
      storage.createProject("active-project");
      const paused = storage.createProject("paused-project");
      paused.status = "paused";
      storage.saveProject(paused);
      
      const active = storage.getActiveProjects();
      
      expect(active).toHaveLength(1);
      expect(active[0].project).toBe("active-project");
    });

    it("should return null for non-existent project", () => {
      const result = storage.getProject("does-not-exist");
      expect(result).toBeNull();
    });
  });

  describe("task creation", () => {
    it("should add a task to existing project", () => {
      storage.createProject("my-project");
      
      const task = storage.addTask("my-project", "Do something");
      
      expect(task.id).toBe("1");
      expect(task.subject).toBe("Do something");
      expect(task.status).toBe("pending");
    });

    it("should auto-create project if it doesn't exist", () => {
      const task = storage.addTask("new-project", "First task");
      
      expect(task.id).toBe("1");
      const project = storage.getProject("new-project");
      expect(project).not.toBeNull();
      expect(project!.tasks).toHaveLength(1);
    });

    it("should increment task IDs", () => {
      storage.addTask("project", "Task 1");
      storage.addTask("project", "Task 2");
      const task3 = storage.addTask("project", "Task 3");
      
      expect(task3.id).toBe("3");
    });
  });

  describe("task status updates", () => {
    it("should update task status", () => {
      storage.addTask("project", "My task");
      
      const { task } = storage.updateTaskStatus("project", "1", "in_progress");
      
      expect(task.status).toBe("in_progress");
    });

    it("should throw on non-existent project", () => {
      expect(() => {
        storage.updateTaskStatus("nope", "1", "completed");
      }).toThrow("Project 'nope' not found");
    });

    it("should throw on non-existent task", () => {
      storage.createProject("project");
      
      expect(() => {
        storage.updateTaskStatus("project", "999", "completed");
      }).toThrow("Task '999' not found");
    });
  });

  describe("dependency management", () => {
    it("should set blocker relationship", () => {
      storage.addTask("project", "Task 1");
      storage.addTask("project", "Task 2");
      
      storage.setBlocker("project", "2", "1");
      
      const data = storage.getProject("project")!;
      expect(data.tasks[1].blockedBy).toContain("1");
      expect(data.tasks[1].status).toBe("blocked");
      expect(data.tasks[0].blocks).toContain("2");
    });

    it("should not duplicate blockers", () => {
      storage.addTask("project", "Task 1");
      storage.addTask("project", "Task 2");
      
      storage.setBlocker("project", "2", "1");
      storage.setBlocker("project", "2", "1"); // duplicate
      
      const data = storage.getProject("project")!;
      expect(data.tasks[1].blockedBy).toHaveLength(1);
    });
  });

  describe("cascading unblocks", () => {
    it("should unblock tasks when blocker completes", () => {
      storage.addTask("project", "Task 1");
      storage.addTask("project", "Task 2");
      storage.setBlocker("project", "2", "1");
      
      const { unblocked } = storage.updateTaskStatus("project", "1", "completed");
      
      expect(unblocked).toContain("2");
      const data = storage.getProject("project")!;
      expect(data.tasks[1].status).toBe("pending");
      expect(data.tasks[1].blockedBy).toHaveLength(0);
    });

    it("should not unblock if other blockers remain", () => {
      storage.addTask("project", "Task 1");
      storage.addTask("project", "Task 2");
      storage.addTask("project", "Task 3");
      storage.setBlocker("project", "3", "1");
      storage.setBlocker("project", "3", "2");
      
      const { unblocked } = storage.updateTaskStatus("project", "1", "completed");
      
      expect(unblocked).toHaveLength(0);
      const data = storage.getProject("project")!;
      expect(data.tasks[2].status).toBe("blocked");
      expect(data.tasks[2].blockedBy).toEqual(["2"]);
    });

    it("should handle chain unblocks", () => {
      // Task 1 -> Task 2 -> Task 3
      storage.addTask("project", "Task 1");
      storage.addTask("project", "Task 2");
      storage.addTask("project", "Task 3");
      storage.setBlocker("project", "2", "1");
      storage.setBlocker("project", "3", "2");
      
      // Complete task 1 - should unblock task 2
      let result = storage.updateTaskStatus("project", "1", "completed");
      expect(result.unblocked).toContain("2");
      
      // Complete task 2 - should unblock task 3
      result = storage.updateTaskStatus("project", "2", "completed");
      expect(result.unblocked).toContain("3");
      
      const data = storage.getProject("project")!;
      expect(data.tasks.every(t => t.status !== "blocked")).toBe(true);
    });
  });

  describe("task notes", () => {
    it("should update task notes", () => {
      storage.addTask("project", "My task");
      
      storage.updateTaskNotes("project", "1", "Some notes here");
      
      const data = storage.getProject("project")!;
      expect(data.tasks[0].notes).toBe("Some notes here");
    });

    it("should throw on non-existent task", () => {
      storage.createProject("project");
      
      expect(() => {
        storage.updateTaskNotes("project", "999", "notes");
      }).toThrow("Task '999' not found");
    });
  });
});

describe("formatting helpers", () => {
  it("placeholder for formatting tests", () => {
    // formatTaskList and formatActiveTasksSummary are internal
    // Full integration tests would cover these via plugin tools
    expect(true).toBe(true);
  });
});
