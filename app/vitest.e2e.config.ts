import { defineConfig } from "vitest/config";
import E2eSequencer from "./e2e/sequencer";

export default defineConfig({ test: { include: ["e2e/**/*.e2e.ts"], testTimeout: 180_000, hookTimeout: 60_000, fileParallelism: false, sequence: { sequencer: E2eSequencer } } });
