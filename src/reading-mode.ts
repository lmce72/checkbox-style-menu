import { MarkdownRenderChild, MarkdownPostProcessorContext, MarkdownView, Notice, TFile } from 'obsidian';
import type CheckboxStyleMenuPlugin from './main';
import { CheckboxMenuHost, replaceTaskSymbol, taskMarker } from './task-markdown';

type Trigger = 'long-press' | 'right-click';
type ShowMenu = (target: HTMLElement, host: CheckboxMenuHost, trigger: Trigger) => () => void;

/** Render-child lifetime follows its section, including embeds. / 生命周期跟随阅读区块与嵌入。 */
class ReadingCheckboxes extends MarkdownRenderChild {
    private timer: ReturnType<typeof setTimeout> | null = null;
    private press: { target: HTMLElement; x: number; y: number } | null = null;
    private suppressClick = false;
    private destroyMenu: (() => void) | null = null;

    constructor(
        el: HTMLElement,
        private plugin: CheckboxStyleMenuPlugin,
        private ctx: MarkdownPostProcessorContext,
        private showMenu: ShowMenu
    ) {
        super(el);
    }

    onload(): void {
        const options = { capture: true };
        this.registerDomEvent(this.containerEl, 'contextmenu', event => {
            const target = this.checkbox(event);
            if (!target || this.plugin.settings.triggerMethod === 'long-press') return;
            const host = this.host(target);
            if (!host) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.cancelPress();
            this.open(target, host, 'right-click');
        }, options);
        this.registerDomEvent(this.containerEl, 'pointerdown', event => {
            this.suppressClick = false;
            const target = this.checkbox(event);
            if (!target || event.button !== 0 || !event.isPrimary) return;
            this.cancelPress();
            this.press = { target, x: event.clientX, y: event.clientY };
            if (this.plugin.settings.triggerMethod === 'right-click') return;
            this.timer = setTimeout(() => {
                const host = this.host(target);
                if (!host || !target.isConnected) return;
                this.suppressClick = true;
                this.open(target, host, 'long-press');
            }, event.pointerType === 'touch'
                ? this.plugin.settings.touchLongPressDuration
                : this.plugin.settings.longPressDuration);
        }, options);
        this.registerDomEvent(this.containerEl, 'pointermove', event => {
            if (this.press && (Math.abs(event.clientX - this.press.x) > 10 || Math.abs(event.clientY - this.press.y) > 10)) {
                this.cancelPress();
            }
        }, options);
        this.registerDomEvent(this.containerEl, 'pointerup', () => this.cancelPress(), options);
        this.registerDomEvent(this.containerEl, 'pointercancel', () => {
            this.cancelPress();
            this.suppressClick = false;
        }, options);
        this.registerDomEvent(this.containerEl, 'click', event => {
            const target = this.checkbox(event);
            if (!target || !event.isTrusted) return;
            if (this.suppressClick) {
                this.suppressClick = false;
                event.preventDefault();
                event.stopImmediatePropagation();
                return;
            }
            const { cycleEnabled, cycleStates } = this.plugin.settings;
            if (!cycleEnabled || cycleStates.length < 2) return;
            const host = this.host(target);
            const symbol = host?.readSymbol();
            if (!host || symbol == null) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            const next = cycleStates[(cycleStates.indexOf(symbol) + 1) % cycleStates.length];
            void Promise.resolve(host.writeSymbol(next)).catch(error => {
                console.error('Checkbox Style Menu: Reading cycle failed', error);
                new Notice('Could not update checkbox. Reopen the note and try again.');
            });
        }, options);
    }

    private checkbox(event: Event): HTMLElement | null {
        const target = event.target;
        if (!(target instanceof this.containerEl.ownerDocument.defaultView!.HTMLElement)) return null;
        if (!target.matches('.task-list-item-checkbox') || target.closest('.checkbox-style-menu-widget, .block-language-tasks')) return null;
        return target.closest('.markdown-preview-view') ? target : null;
    }

    private host(target: HTMLElement): CheckboxMenuHost | null {
        const section = this.ctx.getSectionInfo(target);
        const dataLine = target.getAttribute('data-line') ?? target.closest('li')?.getAttribute('data-line');
        if (dataLine == null || !/^\d+$/.test(dataLine)) return null;
        const relativeLine = Number(dataLine);
        if (!section || !Number.isInteger(relativeLine) || relativeLine < 0) return null;
        const line = section.lineStart + relativeLine;
        if (line > section.lineEnd) return null;
        const snapshot = section.text;
        const expected = snapshot.split('\n')[line];
        const marker = expected === undefined ? null : taskMarker(expected);
        const file = this.plugin.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
        if (!marker || !(file instanceof TFile)) return null;
        return {
            readSymbol: () => marker.symbol,
            overlayManager: { remove() {} },
            dismiss: () => {
                this.destroyMenu?.();
                this.destroyMenu = null;
            },
            writeSymbol: async symbol => {
                // An open editor owns unsaved changes. / 有编辑器时走编辑器，避免覆盖未保存内容。
                const view = this.plugin.app.workspace.getLeavesOfType('markdown')
                    .map(leaf => leaf.view)
                    .find((view): view is MarkdownView => view instanceof MarkdownView && view.file === file && view.getMode() === 'source');
                if (view) {
                    if (view.editor.getValue() !== snapshot) throw new Error('Task source changed while menu was open');
                    const offset = marker.offset;
                    view.editor.replaceRange(symbol, { line, ch: offset }, { line, ch: offset + 1 });
                } else {
                    // Atomic compare-and-write: identical tasks must never be guessed. / 原子校验后写入，不猜测同名任务。
                    await this.plugin.app.vault.process(file, content => {
                        if (content !== snapshot) throw new Error('Task source changed while menu was open');
                        const lines = content.split('\n');
                        lines[line] = replaceTaskSymbol(lines[line], symbol);
                        return lines.join('\n');
                    });
                }
            }
        };
    }

    private open(target: HTMLElement, host: CheckboxMenuHost, trigger: Trigger): void {
        this.destroyMenu?.();
        this.destroyMenu = this.showMenu(target, host, trigger);
    }

    private cancelPress(): void {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.press = null;
    }

    onunload(): void {
        this.cancelPress();
        this.destroyMenu?.();
        this.destroyMenu = null;
    }
}

export function registerReadingCheckboxes(plugin: CheckboxStyleMenuPlugin, showMenu: ShowMenu): void {
    const children = new Set<ReadingCheckboxes>();
    plugin.register(() => {
        for (const child of children) child.unload();
        children.clear();
    });
    plugin.registerMarkdownPostProcessor((el, ctx) => {
        if (!el.querySelector('.task-list-item-checkbox') || el.closest('.checkbox-style-menu-widget')) return;
        const child = new ReadingCheckboxes(el, plugin, ctx, showMenu);
        children.add(child);
        child.register(() => children.delete(child));
        ctx.addChild(child);
    });
}
