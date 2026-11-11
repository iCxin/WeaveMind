/**
 * 自定义对话框：替代浏览器默认 confirm / prompt。
 * 支持遮罩、焦点陷阱、Esc 取消、Enter 确认与输入框。
 */

import { t } from '../i18n.ts';

export type DialogActionKind = 'primary' | 'danger' | 'ghost';

export interface DialogAction {
  readonly label: string;
  readonly value: string;
  readonly kind?: DialogActionKind;
}

export interface DialogOptions {
  readonly title: string;
  readonly message?: string;
  readonly input?: {
    readonly label?: string;
    readonly value?: string;
    readonly placeholder?: string;
  };
  readonly actions: readonly DialogAction[];
}

export interface DialogResult {
  readonly action: string;
  readonly input: string;
}

let activeClose: ((result: DialogResult | null) => void) | null = null;

function closeActive(result: DialogResult | null): void {
  if (!activeClose) return;
  const close = activeClose;
  activeClose = null;
  close(result);
}

export function isDialogOpen(): boolean {
  return activeClose !== null;
}

export function showDialog(options: DialogOptions): Promise<DialogResult | null> {
  closeActive(null);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';

    const card = document.createElement('div');
    card.className = 'dialog';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', t(options.title));

    const title = document.createElement('h2');
    title.className = 'dialog-title';
    title.textContent = t(options.title);
    card.appendChild(title);

    if (options.message) {
      const message = document.createElement('p');
      message.className = 'dialog-message';
      message.textContent = t(options.message);
      card.appendChild(message);
    }

    let input: HTMLInputElement | null = null;
    if (options.input) {
      if (options.input.label) {
        const label = document.createElement('label');
        label.className = 'dialog-label';
        label.textContent = t(options.input.label);
        card.appendChild(label);
      }
      input = document.createElement('input');
      input.className = 'dialog-input';
      input.type = 'text';
      input.value = options.input.value ?? '';
      if (options.input.placeholder) input.placeholder = t(options.input.placeholder);
      card.appendChild(input);
    }

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';

    const finish = (value: string | null) => {
      const payload = value === null ? null : { action: value, input: input?.value ?? '' };
      overlay.classList.add('closing');
      window.setTimeout(() => {
        overlay.remove();
        activeClose = null;
      }, 140);
      resolve(payload);
    };

    const buttons = options.actions.map((action) => {
      const button = document.createElement('button');
      button.className = `dbtn${action.kind ? ' ' + action.kind : ''}`;
      button.textContent = t(action.label);
      button.addEventListener('click', () => finish(action.value));
      actions.appendChild(button);
      return { button, action };
    });
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('open');
      const primary = buttons.find((item) => item.action.kind === 'primary') ?? buttons[buttons.length - 1];
      (input ?? primary?.button)?.focus();
      if (input) input.select();
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(null);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const primary = buttons.find((item) => item.action.kind === 'primary') ?? buttons[buttons.length - 1];
        if (primary) finish(primary.action.value);
      } else if (event.key === 'Tab') {
        const focusables: HTMLElement[] = [];
        if (input) focusables.push(input);
        for (const item of buttons) focusables.push(item.button);
        if (focusables.length === 0) return;
        const index = focusables.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        const next = event.shiftKey
          ? (index - 1 + focusables.length) % focusables.length
          : (index + 1) % focusables.length;
        focusables[next]?.focus();
      }
    };

    overlay.addEventListener('keydown', onKey);
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) finish(null);
    });

    activeClose = (result) => {
      overlay.remove();
      if (result === null) resolve(null);
    };
  });
}

export async function confirmDialog(
  title: string,
  message?: string,
  confirmLabel = '确定',
  danger = false
): Promise<boolean> {
  const result = await showDialog({
    title,
    message,
    actions: [
      { label: '取消', value: 'cancel', kind: 'ghost' },
      { label: confirmLabel, value: 'ok', kind: danger ? 'danger' : 'primary' }
    ]
  });
  return result?.action === 'ok';
}

export async function promptDialog(
  title: string,
  label: string,
  value = '',
  placeholder = ''
): Promise<string | null> {
  const result = await showDialog({
    title,
    input: { label, value, placeholder },
    actions: [
      { label: '取消', value: 'cancel', kind: 'ghost' },
      { label: '确定', value: 'ok', kind: 'primary' }
    ]
  });
  if (result?.action !== 'ok') return null;
  return result.input;
}
