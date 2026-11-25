/** Run through chrome-devtools-mcp in an isolated empty vault. / 仅在独立空库运行。 */
module.exports = async function checkboxRegression(app, scenario = 'editor') {
    const doc = app.workspace.containerEl.ownerDocument;
    const win = doc.defaultView;
    if (!app.vault.adapter.getBasePath().includes('checkbox-style-test-')) throw new Error('Isolated checkbox-style-test vault required');
    const pause = ms => new Promise(resolve => win.setTimeout(resolve, ms));
    const assert = (ok, message) => { if (!ok) throw new Error(message); };
    const mouse = (target, type, button = 0) => {
        const r = target.getBoundingClientRect();
        return target.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, button,
            buttons: type === 'mousedown' ? 1 : 0, detail: 1, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, view: win }));
    };
    doc.querySelectorAll('.checkbox-overlay, .checkbox-style-menu-widget').forEach(el => el.remove());
    const path = 'Checkbox regression.md';
    const fixture = '# Checkbox regression\n\n- [ ] First\n- [ ] Second\n* [ ] Star\n+ [ ] Plus\n1. [ ] Ordered\n2) [ ] Parenthesis\n\n> - [ ] Quote\n\n- [ ] Parent\n  - [ ] Nested\n\n- [ ] Duplicate\n- [ ] Duplicate\n';
    const p = app.plugins.plugins['checkbox-style-menu'];
    assert(p, 'Plugin not loaded');
    for (const key of Object.keys(p.settings.styles)) p.settings.styles[key] = true;
    p.settings.cycleEnabled = false;
    p.settings.longPressDuration = 100;
    await p.saveSettings();
    let file = app.vault.getAbstractFileByPath(path);
    if (!file) file = await app.vault.create(path, fixture);
    const leaf = app.workspace.activeLeaf;
    await leaf.openFile(file, { state: { mode: 'source' } });
    await pause(25);
    const v = leaf.view;
    v.editor.cm.dispatch({});
    if (scenario === 'editor') {
        const results = [];
        for (const trigger of ['right-click', 'long-press']) {
            for (const index of [0, 1]) {
                for (const symbol of ['!', '/', '*']) {
                    v.editor.setValue(fixture);
                    await pause(15);
                    for (let n = 0; n < 2; n++) {
                        const target = v.contentEl.querySelector('.cm-editor .task-list-item-checkbox');
                        mouse(target, 'mousedown'); mouse(target, 'mouseup'); target.click();
                        await pause(10);
                    }
                    const target = v.contentEl.querySelectorAll('.cm-editor .task-list-item-checkbox')[index];
                    if (trigger === 'right-click') mouse(target, 'contextmenu', 2);
                    else mouse(target, 'mousedown');
                    await pause(trigger === 'long-press' ? 140 : 25);
                    const item = [...doc.querySelectorAll('.checkbox-style-menu-widget li')].find(el => (el.dataset.styleSymbol ?? p.getEnabledStyles()[Number(el.dataset.styleIndex)]?.symbol) === symbol);
                    assert(item, `${trigger}, checkbox ${index}: menu did not open`);
                    // Full press/release/click, not just a programmatic menu callback. / 验证完整事件链。
                    const input = item.querySelector('input');
                    mouse(input, 'mousedown'); mouse(input, 'mouseup'); input.click();
                    await pause(15);
                    assert(v.editor.getLine(index + 2).startsWith(`- [${symbol}]`), `${trigger}, checkbox ${index}: ${symbol} not written`);
                    assert(!doc.querySelector('.checkbox-overlay, .checkbox-style-menu-widget'), 'Orphaned menu/overlay');
                    results.push(`${trigger}:${index}:${symbol}`);
                }
            }
        }
        return { scenario, passed: results.length, results, multistate: !!app.plugins.plugins['multistate-checkboxes'], tasks: !!app.plugins.plugins['obsidian-tasks-plugin'] };
    }
    if (scenario === 'lifecycle') {
        v.editor.setValue(fixture);
        v.editor.cm.dispatch({});
        await pause(20);
        mouse(v.contentEl.querySelectorAll('.cm-editor .task-list-item-checkbox')[1], 'contextmenu', 2);
        await pause(25);
        assert(doc.querySelector('.checkbox-style-menu-widget'), 'Initial menu missing');
        v.editor.replaceRange('\n', { line: 0, ch: 0 });
        await pause(20);
        assert(!doc.querySelector('.checkbox-overlay, .checkbox-style-menu-widget'), 'Stale menu/overlay survived document edit');

        v.editor.setValue(fixture);
        await pause(20);
        const oldTarget = v.contentEl.querySelector('.cm-editor .task-list-item-checkbox');
        mouse(oldTarget, 'mousedown');
        v.editor.setLine(2, '- [x] First');
        // Model another renderer replacing the input during the hold. / 模拟按住时其他渲染器替换输入节点。
        const replacement = v.contentEl.querySelector('.cm-editor .task-list-item-checkbox');
        replacement.replaceWith(replacement.cloneNode(true));
        await pause(140);
        const important = [...doc.querySelectorAll('.checkbox-style-menu-widget li')]
            .find(el => (el.dataset.styleSymbol ?? p.getEnabledStyles()[Number(el.dataset.styleIndex)]?.symbol) === '!');
        assert(important, 'Long press lost its target after native DOM replacement');
        important.querySelector('input').click();
        await pause(20);
        assert(v.editor.getLine(2) === '- [!] First', 'Replacement target write failed');
        assert(!doc.querySelector('.checkbox-overlay, .checkbox-style-menu-widget'), 'Overlay remained after selection');
        return { scenario, passed: 2, replaced: !oldTarget.isConnected };
    }
    if (scenario === 'reading') {
        v.editor.setValue(fixture);
        await v.save();
        await leaf.setViewState({ type: 'markdown', state: { file: path, mode: 'preview' } });
        await pause(30);
        const view = leaf.view;
        const render = async () => {
            view.previewMode.rerender(true);
            await pause(20);
            // Offscreen test windows may not receive animation frames. / 后台测试窗可能没有动画帧。
            view.previewMode.renderer.onRender();
            await pause(20);
            view.previewMode.renderer.onRender();
            await pause(20);
        };
        const results = [];
        for (const text of ['Star', 'Plus', 'Parenthesis', 'Quote', 'Nested', 'Duplicate']) {
            await render();
            const boxes = [...view.previewMode.containerEl.querySelectorAll('.task-list-item-checkbox')];
            const matches = boxes.filter(el => el.closest('li').textContent.trim() === text);
            const target = matches[matches.length - 1];
            assert(target, `Reading checkbox not found: ${text}`);
            mouse(target, 'contextmenu', 2);
            await pause(25);
            const item = [...doc.querySelectorAll('.checkbox-style-menu-widget li')].find(el => (el.dataset.styleSymbol ?? p.getEnabledStyles()[Number(el.dataset.styleIndex)]?.symbol) === '!');
            assert(item, `Reading menu not found: ${text}`);
            item.querySelector('input').click();
            await pause(25);
            const content = await app.vault.read(file);
            const lines = content.split('\n').filter(line => line.endsWith(` ${text}`));
            assert(lines[lines.length - 1].includes('[!]'), `Reading marker not written: ${text}`);
            if (text === 'Duplicate') assert(lines[0].includes('[ ]'), 'Wrong duplicate task changed');
            results.push(text);
        }
        return { scenario, passed: results.length, results };
    }
    throw new Error(`Unknown scenario: ${scenario}`);
};
