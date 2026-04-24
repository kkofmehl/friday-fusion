import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export class FileStore<T> {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  public async read(defaultValue: T): Promise<T> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  }

  public async write(value: T): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(value, null, 2), "utf8");
  }
}
