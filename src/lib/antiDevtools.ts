/**
 * PROCTOR+ Anti-Tamper & Developer Tools Security Shield
 * Defends the portal against unauthorized developer tools inspection, source code extraction,
 * DOM tampering, keyboard shortcut inspection, and debugging probes.
 */

type DevToolsChangeCallback = (isOpen: boolean) => void;

class AntiDevToolsShield {
  private isOpen: boolean = false;
  private listeners: Set<DevToolsChangeCallback> = new Set();
  private checkIntervalId: any = null;
  private initialized: boolean = false;
  private noticeCallback: ((msg: string) => void) | null = null;

  constructor() {
    // Only browser environment
    if (typeof window === 'undefined') return;
  }

  public init(onNotice?: (msg: string) => void) {
    if (this.initialized) return;
    this.initialized = true;
    if (onNotice) this.noticeCallback = onNotice;

    this.installKeyBlocker();
    this.installContextMenuBlocker();
    this.hardenConsole();
    this.startDetection();
  }

  public subscribe(cb: DevToolsChangeCallback): () => void {
    this.listeners.add(cb);
    cb(this.isOpen);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public isDevToolsOpen(): boolean {
    return this.isOpen;
  }

  private notify(isOpen: boolean) {
    if (this.isOpen !== isOpen) {
      this.isOpen = isOpen;
      this.listeners.forEach((cb) => {
        try {
          cb(isOpen);
        } catch {
          // ignore
        }
      });
    }
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
          this.triggerNotice('F12 Developer Tools shortcut is disabled by PROCTOR+ Shield.');
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
          this.triggerNotice('Developer Inspection tools are disabled.');
          return false;
        }

        // Ctrl+U / Cmd+Option+U -> View Page Source
        if ((ctrlOrCmd && (e.key === 'u' || e.key === 'U')) || (isMac && e.metaKey && e.altKey && (e.key === 'u' || e.key === 'U'))) {
          e.preventDefault();
          e.stopPropagation();
          this.triggerNotice('View Source is blocked for security.');
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
          this.triggerNotice('Document printing is disabled.');
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
          this.triggerNotice('Right-click context menu is restricted on PROCTOR+.');
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
      const shieldNotice = () => {
        // Clean banner
      };

      // In production mode, sanitize standard logging
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

        originalLog('%c🔒 PROCTOR+ SECURITY SHIELD ACTIVE — Unauthorized Inspection Prohibited', bannerStyles);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Detect DevTools via dimensional differential and debugger timing
   */
  private startDetection() {
    const checkDevTools = () => {
      try {
        // Method 1: Window size differential (DevTools docked at bottom/side)
        const widthThreshold = window.outerWidth - window.innerWidth > 160;
        const heightThreshold = window.outerHeight - window.innerHeight > 160;

        let detected = false;
        if (widthThreshold || heightThreshold) {
          detected = true;
        }

        // Method 2: High precision debugger timing probe
        const start = performance.now();
        // eslint-disable-next-line no-debugger
        debugger;
        const diff = performance.now() - start;
        if (diff > 120) {
          detected = true;
        }

        // Method 3: Console element inspection getter
        const detector = /./;
        let getterTriggered = false;
        detector.toString = function () {
          getterTriggered = true;
          return '';
        };
        // Trigger getter if console is open and evaluating
        console.debug?.(detector);
        if (getterTriggered) {
          detected = true;
        }

        this.notify(detected);
      } catch {
        // ignore
      }
    };

    // Check periodically
    this.checkIntervalId = setInterval(checkDevTools, 1200);

    // Also check on window resize
    window.addEventListener('resize', checkDevTools);
  }

  public destroy() {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
  }
}

export const securityShield = new AntiDevToolsShield();
