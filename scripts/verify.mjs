import { execSync } from "node:child_process";

const steps = [
  { name: "TypeScript Check", cmd: "npm run typecheck" },
  { name: "ESLint Check", cmd: "npm run lint" },
  { name: "Unit Tests", cmd: "npm test" },
  { name: "Production Build", cmd: "npm run build" },
];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  execSync(step.cmd, { stdio: "inherit" });
}

console.log("\nAll verification gates passed.");
