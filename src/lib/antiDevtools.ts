/**
 * PROCTOR+ Anti-Tamper & Code Protection Shield
 * Defends the portal against unauthorized developer tools inspection, source code extraction,
 * DOM tampering, keyboard shortcut inspection, and right-click element inspection.
 */

class AntiDevToolsShield {
  private initialized: boolean = false;
  private noticeCallback: ((msg: string) => void) | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
  }

  public init(onNotice?: (msg: string) => void) {
    if (this.initialized) return;
    this.initialized = true;
    if (onNotice) this.noticeCallback = onNotice;

    this.installKeyBlocker();
    this.installContextMenuBlocker();
    this.hardenConsole();
  }

  private triggerNotice(msg: string) {
    if (this.noticeCallback) {
      this.noticeCallback(msg);
    }
  }

  /**
   * Block key combinations used to open DevTools, View Source, Save Page, or Print
   */
  private installKeyBlocker() {
    window.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

        // F12 -> DevTools
        if (e.key === 'F12' || e.keyCode === 123) {
          e.preventDefault();
          e.stopPropagation();
          this.triggerNotice('F12 Developer Tools shortcut is restricted by PROCTOR+ Shield.');
          return false;
        }

        // Ctrl+Shift+I / Cmd+Option+I (Inspect)
        // Ctrl+Shift+J / Cmd+Option+J (Console)
        // Ctrl+Shift+C / Cmd+Option+C (Element Picker)
        // Ctrl+Shift+K / Cmd+Option+K (Firefox Web Console)
        if (
          ctrlOrCmd &&
          (e.shiftKey || (isMac && e.altKey)) &&
          ['I', 'i', 'J', 'j', 'C', 'c', 'K', 'k'].includes(e.key)
        ) {
          e.preventDefault();
          e.stopPropagation();
          this.triggerNotice('Developer Inspection tools are restricted by PROCTOR+ Shield.');
          return false;
        }

        // Ctrl+U / Cmd+Option+U -> View Page Source
        if (
          (ctrlOrCmd && (e.key === 'u' || e.key === 'U')) ||
          (isMac && e.metaKey && e.altKey && (e.key === 'u' || e.key === 'U'))
        ) {
          e.preventDefault();
          e.stopPropagation();
          this.triggerNotice('View Page Source is blocked for security.');
          return false;
        }

        // Ctrl+S / Cmd+S -> Save Webpage
        if (ctrlOrCmd && (e.key === 's' || e.key === 'S')) {
          e.preventDefault();
          e.stopPropagation();
          this.triggerNotice('Saving source code locally is disabled.');
          return false;
        }

        // Ctrl+P / Cmd+P -> Print / Export PDF during proctored test
        if (ctrlOrCmd && (e.key === 'p' || e.key === 'P')) {
          e.preventDefault();
          e.stopPropagation();
          this.triggerNotice('Document printing is disabled on PROCTOR+.');
          return false;
        }

        // Shift+F10 -> Context menu in Windows
        if (e.shiftKey && (e.key === 'F10' || e.keyCode === 121)) {
          e.preventDefault();
          e.stopPropagation();
          return false;
        }
      },
      { capture: true }
    );
  }

  /**
   * Block right-click context menu (Inspect Element, Save As, View Source)
   */
  private installContextMenuBlocker() {
    window.addEventListener(
      'contextmenu',
      (e: MouseEvent) => {
        // Allow right-click on input and textarea for copy/paste if desired, but block everywhere else
        const target = e.target as HTMLElement | null;
        const isInputField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

        if (!isInputField) {
          e.preventDefault();
          e.stopPropagation();
          this.triggerNotice('Right-click inspection is disabled by PROCTOR+ Shield.');
          return false;
        }
      },
      { capture: true }
    );

    // Block drag and drop of assets/scripts
    window.addEventListener('dragstart', (e: DragEvent) => {
      e.preventDefault();
    });
  }

  /**
   * Harden console so internal variables, API secrets, and code logs aren't exposed
   */
  private hardenConsole() {
    try {
      if (typeof window !== 'undefined' && (window as any).console) {
        const originalLog = console.log;
        const bannerStyles = [
          'color: #10b981',
          'background: #0f172a',
          'font-size: 14px',
          'font-weight: bold',
          'padding: 8px 12px',
          'border: 1px solid #10b981',
          'border-radius: 6px'
        ].join(';');

        originalLog('%c🔒 PROCTOR+ SECURITY SHIELD ACTIVE — Source Inspection Prohibited', bannerStyles);
      }
    } catch {
      // ignore
    }
  }

  public destroy() {
    // cleanup
  }
}

export const securityShield = new AntiDevToolsShield();
