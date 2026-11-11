/** 自定义右键菜单：定位、边界收敛、点击外部/Esc 关闭。 */

export interface MenuItem {
  readonly label: string;
  readonly action: () => void;
  readonly danger?: boolean;
}

export type MenuEntry = MenuItem | { readonly separator: true };

let closeMenu: (() => void) | null = null;

export function dismissContextMenu(): void {
  closeMenu?.();
}

export function showContextMenu(x: number, y: number, items: readonly MenuEntry[]): void {
  dismissContextMenu();
  if (items.length === 0) return;

  const menu = document.createElement('div');
  menu.className = 'ctxmenu';
  menu.setAttribute('role', 'menu');

  for (const item of items) {
    if ('separator' in item) {
      const line = document.createElement('div');
      line.className = 'ctxsep';
      menu.appendChild(line);
      continue;
    }
    const button = document.createElement('button');
    button.className = `ctxitem${item.danger ? ' danger' : ''}`;
    button.setAttribute('role', 'menuitem');
    button.textContent = item.label;
    button.addEventListener('click', () => {
      dismissContextMenu();
      item.action();
    });
    menu.appendChild(button);
  }

  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 10));
  const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 10));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  requestAnimationFrame(() => menu.classList.add('open'));

  const onPointerDown = (event: PointerEvent) => {
    if (!menu.contains(event.target as Node)) dismissContextMenu();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') dismissContextMenu();
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown);

  closeMenu = () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown);
    menu.remove();
    closeMenu = null;
  };
}
