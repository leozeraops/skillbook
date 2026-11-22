import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

async function findJavaScriptFiles(directory) {
  const entries = await readdir(directory);
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      files.push(...await findJavaScriptFiles(path));
    } else if ([".js", ".gs"].includes(extname(entry))) {
      files.push(path);
    }
  }

  return files;
}

const files = [
  ...await findJavaScriptFiles("src"),
  ...await findJavaScriptFiles("test"),
];

for (const file of files) {
  const isAppsScriptFile = file.endsWith(".gs");
  const result = isAppsScriptFile
    ? spawnSync(process.execPath, ["--check", "-"], {
        input: await readFile(file, "utf8"),
        stdio: ["pipe", "inherit", "inherit"],
      })
    : spawnSync(process.execPath, ["--check", file], {
        stdio: "inherit",
      });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Verificação sintática concluída: ${files.length} arquivo(s).`);
