/** Match only a task marker, never brackets in its description. / 只匹配任务标记。 */
const TASK_MARKER = /^([\t ]*(?:>[\t ]*)*(?:[-+*]|\d+[.)])[\t ]+\[)([^\]\r\n])(\])(?=[\t ]|$)/;

export function taskMarker(line: string): { symbol: string; offset: number } | null {
    const match = TASK_MARKER.exec(line);
    return match ? { symbol: match[2], offset: match[1].length } : null;
}

export function replaceTaskSymbol(line: string, symbol: string): string {
    const marker = taskMarker(line);
    return marker ? line.slice(0, marker.offset) + symbol + line.slice(marker.offset + 1) : line;
}

/** One menu contract for editor and reading views. / 编辑与阅读模式共用菜单契约。 */
export interface CheckboxMenuHost {
    readSymbol(): string | null;
    writeSymbol(symbol: string): void | Promise<void>;
    dismiss(): void;
    overlayManager: { remove(): void };
}
