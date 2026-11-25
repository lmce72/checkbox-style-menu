import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import Module from 'node:module';
const compiled = buildSync({ entryPoints: ['src/task-markdown.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const parser = new Module('task-markdown-test');
parser._compile(compiled.outputFiles[0].text, 'task-markdown-test.cjs');
const { taskMarker, replaceTaskSymbol } = parser.exports;

for (const line of ['- [ ] Task', '* [ ] Task', '+ [ ] Task', '1. [ ] Task', '2) [ ] Task', '  - [ ] Nested', '> - [ ] Quoted', '> > + [ ] Nested quote', '- [ ] Task with [x] text', '- [ ] Task\r', '- [ ]']) {
    test(`updates only the marker: ${JSON.stringify(line)}`, () => {
        const marker = taskMarker(line);
        assert.equal(marker.symbol, ' ');
        const changed = replaceTaskSymbol(line, '!');
        assert.equal(changed[marker.offset], '!');
        assert.equal(changed.slice(0, marker.offset), line.slice(0, marker.offset));
        assert.equal(changed.slice(marker.offset + 1), line.slice(marker.offset + 1));
    });
}
for (const line of ['Description - [ ] Task', '- [ ]not a task', '- [xx] Task', '- Task [x]', '- [] Task', '--- [ ] Task', '- [\n] Task']) {
    test(`rejects non-task syntax: ${JSON.stringify(line)}`, () => {
        assert.equal(taskMarker(line), null);
        assert.equal(replaceTaskSymbol(line, '!'), line);
    });
}
