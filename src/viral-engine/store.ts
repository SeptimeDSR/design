import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BanditState } from "./bandit";
import type { Platform, PublishMode } from "./publish-plan";
import type { Trend } from "./trends";
import type { TemplateId, Timeline, ViralScript, Lang } from "./types";

export type JobStatus = "rendered" | "notified" | "publishing" | "published" | "rejected" | "failed";

export type Job = {
  id: string;
  createdAt: string;
  status: JobStatus;
  request: { topic?: string; template?: TemplateId; lang?: Lang; script?: unknown };
  script: ViralScript;
  timeline: Timeline;
  arm: string;
  source: "ollama" | "fallback" | "claude";
  ttsEngine: string;
  trend?: Trend;
  jobDir: string;
  videoPath?: string;
  publishMode?: PublishMode;
  postIds?: string[];
  // Registre de publication : ce qui est déjà parti, par plateforme. Une relance ne reposte jamais ces plateformes.
  posted?: Partial<Record<Platform, string[]>>;
  publishingSince?: string;
  publishedAt?: string;
  views?: number;
  rewarded?: boolean;
  error?: string;
};

export type ViralState = { bandit: BanditState; viewsHistory: number[]; recentTopics: string[] };

export function createStore(home: string) {
  const jobsDir = join(home, "jobs");
  mkdirSync(jobsDir, { recursive: true });
  const statePath = join(home, "state.json");
  const jobPath = (id: string) => join(jobsDir, id, "job.json");

  const listJobs = (): Job[] =>
    readdirSync(jobsDir)
      .filter((id) => existsSync(jobPath(id)))
      .map((id) => JSON.parse(readFileSync(jobPath(id), "utf8")) as Job)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    home,
    jobsDir,
    loadState(): ViralState {
      return existsSync(statePath)
        ? JSON.parse(readFileSync(statePath, "utf8"))
        : { bandit: {}, viewsHistory: [], recentTopics: [] };
    },
    saveState(state: ViralState) {
      writeFileSync(statePath, JSON.stringify(state, null, 2));
    },
    saveJob(job: Job) {
      mkdirSync(join(jobsDir, job.id), { recursive: true });
      writeFileSync(jobPath(job.id), JSON.stringify(job, null, 2));
    },
    getJob(id: string): Job | undefined {
      return existsSync(jobPath(id)) ? JSON.parse(readFileSync(jobPath(id), "utf8")) : undefined;
    },
    listJobs,
    latestJob(status?: JobStatus): Job | undefined {
      return listJobs().find((j) => !status || j.status === status);
    },
    findJob(ref: string): Job | undefined {
      return listJobs().find((j) => j.id.startsWith(ref.toLowerCase()));
    },
  };
}

export type Store = ReturnType<typeof createStore>;
