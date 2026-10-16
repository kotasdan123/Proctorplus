import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Calculator,
  X,
  GripHorizontal,
  RotateCcw,
  Copy,
  Check,
  Divide,
  Percent,
  Plus,
  Minus,
  Equal,
  Delete,
  Sparkles
} from 'lucide-react';

interface ExamCalculatorProps {
  /** If proctoring or exam is active, ensure zero anti-cheat interference */
  className?: string;
}

export const ExamCalculator: React.FC<ExamCalculatorProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Position state for drag & drop
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number }>({
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0
  });

  const panelRef = useRef<HTMLDivElement | null>(null);

  // Calculator logic state
  const [display, setDisplay] = useState<string>('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [waitingForOperand, setWaitingForOperand] = useState<boolean>(false);
  const [expression, setExpression] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Initialize position on first open near bottom-right, above the Tools button
  useEffect(() => {
    if (isOpen && position === null && typeof window !== 'undefined') {
      const panelWidth = 300;
      const panelHeight = 440;
      const initialX = Math.max(16, window.innerWidth - panelWidth - 24);
      const initialY = Math.max(70, window.innerHeight - panelHeight - 84);
      setPosition({ x: initialX, y: initialY });
    }
  }, [isOpen, position]);

  // Keep within bounds on window resize
  useEffect(() => {
    const handleResize = () => {
      if (position && typeof window !== 'undefined') {
        const panelWidth = 300;
        const panelHeight = 440;
        const clampedX = Math.min(Math.max(12, position.x), window.innerWidth - panelWidth - 12);
        const clampedY = Math.min(Math.max(12, position.y), window.innerHeight - panelHeight - 12);
        if (clampedX !== position.x || clampedY !== position.y) {
          setPosition({ x: clampedX, y: clampedY });
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position]);

  // Dragging logic
  const handleDragStart = (clientX: number, clientY: number) => {
    if (!position) return;
    setIsDragging(true);
    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initialX: position.x,
      initialY: position.y
    };
  };

  const onMouseDownHeader = (e: React.MouseEvent) => {
    // Only drag with left click and not on interactive buttons
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  };

  const onTouchStartHeader = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    if (e.touches.length === 1) {
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const panelWidth = 300;
      const panelHeight = 440;

      const newX = Math.min(
        Math.max(8, dragStartRef.current.initialX + dx),
        window.innerWidth - panelWidth - 8
      );
      const newY = Math.min(
        Math.max(64, dragStartRef.current.initialY + dy),
        window.innerHeight - panelHeight - 8
      );

      setPosition({ x: newX, y: newY });
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - dragStartRef.current.startX;
      const dy = e.touches[0].clientY - dragStartRef.current.startY;
      const panelWidth = 300;
      const panelHeight = 440;

      const newX = Math.min(
        Math.max(8, dragStartRef.current.initialX + dx),
        window.innerWidth - panelWidth - 8
      );
      const newY = Math.min(
        Math.max(64, dragStartRef.current.initialY + dy),
        window.innerHeight - panelHeight - 8
      );

      setPosition({ x: newX, y: newY });
    };

    const onDragEnd = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onDragEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onDragEnd);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onDragEnd);
    };
  }, [isDragging]);

  // Clean floating point math helper (prevents 0.1 + 0.2 = 0.30000000000000004)
  const sanitizeNumber = (num: number): number => {
    return parseFloat(num.toPrecision(12));
  };

  // Calculator operations
  const inputDigit = useCallback((digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay((prev) => (prev === '0' || prev === 'Error' ? digit : prev + digit));
    }
  }, [waitingForOperand]);

  const inputDecimal = useCallback(() => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaitingForOperand(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay((prev) => (prev === 'Error' ? '0.' : prev + '.'));
    }
  }, [waitingForOperand, display]);

  const clearAll = useCallback(() => {
    setDisplay('0');
    setPrevValue(null);
    setOperation(null);
    setWaitingForOperand(false);
    setExpression('');
  }, []);

  const clearEntry = useCallback(() => {
    setDisplay('0');
  }, []);

  const backspace = useCallback(() => {
    if (waitingForOperand || display === 'Error') {
      setDisplay('0');
      return;
    }
    setDisplay((prev) => {
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith('-'))) {
        return '0';
      }
      return prev.slice(0, -1);
    });
  }, [waitingForOperand, display]);

  const toggleSign = useCallback(() => {
    if (display === '0' || display === 'Error') return;
    setDisplay((prev) => (prev.startsWith('-') ? prev.slice(1) : '-' + prev));
  }, [display]);

  const inputPercent = useCallback(() => {
    const current = parseFloat(display);
    if (isNaN(current)) return;
    const res = sanitizeNumber(current / 100);
    setDisplay(String(res));
  }, [display]);

  const calculate = (firstVal: number, secondVal: number, op: string): number => {
    switch (op) {
      case '+':
        return sanitizeNumber(firstVal + secondVal);
      case '-':
        return sanitizeNumber(firstVal - secondVal);
      case '×':
      case '*':
        return sanitizeNumber(firstVal * secondVal);
      case '÷':
      case '/':
        if (secondVal === 0) return NaN;
        return sanitizeNumber(firstVal / secondVal);
      default:
        return secondVal;
    }
  };

  const performOperation = useCallback((nextOperator: string) => {
    const inputValue = parseFloat(display);

    if (isNaN(inputValue)) {
      clearAll();
      return;
    }

    if (prevValue === null) {
      setPrevValue(inputValue);
      setExpression(`${inputValue} ${nextOperator}`);
    } else if (operation) {
      const currentValue = prevValue || 0;
      const result = calculate(currentValue, inputValue, operation);

      if (isNaN(result)) {
        setDisplay('Error');
        setPrevValue(null);
        setOperation(null);
        setExpression('');
        setWaitingForOperand(true);
        return;
      }

      setPrevValue(result);
      setDisplay(String(result));
      setExpression(`${result} ${nextOperator}`);
    }

    setWaitingForOperand(true);
    setOperation(nextOperator);
  }, [display, prevValue, operation, clearAll]);

  const handleEquals = useCallback(() => {
    const inputValue = parseFloat(display);

    if (prevValue === null || operation === null || isNaN(inputValue)) {
      return;
    }

    const result = calculate(prevValue, inputValue, operation);

    if (isNaN(result) || !isFinite(result)) {
      setDisplay('Error');
      setExpression(`${prevValue} ${operation} ${inputValue} =`);
      setPrevValue(null);
      setOperation(null);
      setWaitingForOperand(true);
      return;
    }

    setExpression(`${prevValue} ${operation} ${inputValue} =`);
    setDisplay(String(result));
    setPrevValue(null);
    setOperation(null);
    setWaitingForOperand(true);
  }, [display, prevValue, operation]);

  // Copy result to clipboard
  const handleCopyResult = () => {
    if (display === 'Error') return;
    navigator.clipboard.writeText(display);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Reset calculator to default bottom-right position
  const handleResetPosition = () => {
    const panelWidth = 300;
    const panelHeight = 440;
    setPosition({
      x: Math.max(16, window.innerWidth - panelWidth - 24),
      y: Math.max(70, window.innerHeight - panelHeight - 84)
    });
  };

  // Keyboard navigation when calculator is open and focused
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
      e.preventDefault();
      inputDigit(e.key);
    } else if (e.key === '.') {
      e.preventDefault();
      inputDecimal();
    } else if (e.key === '+') {
      e.preventDefault();
      performOperation('+');
    } else if (e.key === '-') {
      e.preventDefault();
      performOperation('-');
    } else if (e.key === '*') {
      e.preventDefault();
      performOperation('×');
    } else if (e.key === '/') {
      e.preventDefault();
      performOperation('÷');
    } else if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      handleEquals();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      backspace();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearAll();
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* 1. Floating Tools Button on Bottom-Right */}
      <div className="fixed bottom-5 right-5 z-30 select-none">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border text-xs font-bold shadow-2xl backdrop-blur-xl transition-all duration-200 hover:scale-105 active:scale-95 ${
            isOpen
              ? 'bg-emerald-600 border-emerald-400 text-white shadow-emerald-500/25 ring-2 ring-emerald-400/30'
              : 'bg-slate-900/90 hover:bg-slate-800 border-slate-700/80 text-slate-200 hover:text-white shadow-black/40'
          }`}
          title={isOpen ? 'Close Tools Panel' : 'Open Exam Calculator Tools'}
        >
          <div className="relative">
            <Calculator className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-12 text-white' : 'text-emerald-400'}`} />
          </div>
          <span className="tracking-wide">Tools</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-950/60 text-slate-300 font-mono border border-slate-700/50">
            {isOpen ? 'Close' : 'Calc'}
          </span>
        </button>
      </div>

      {/* 2. Floating Draggable Calculator Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          style={{
            position: 'fixed',
            left: position ? `${position.x}px` : 'auto',
            top: position ? `${position.y}px` : 'auto',
            right: position ? 'auto' : '20px',
            bottom: position ? 'auto' : '76px',
            width: '300px',
            zIndex: 35
          }}
          className="rounded-3xl bg-slate-950/95 border border-slate-700/80 shadow-2xl shadow-black/80 backdrop-blur-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 outline-none select-none text-slate-100"
        >
          {/* Draggable Header */}
          <div
            onMouseDown={onMouseDownHeader}
            onTouchStart={onTouchStartHeader}
            className="px-4 py-3 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between cursor-move group hover:bg-slate-900 transition-colors"
            title="Drag to reposition calculator anywhere on screen"
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
              <div className="flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-white tracking-wide">Exam Calculator</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Reset to default position */}
              <button
                type="button"
                onClick={handleResetPosition}
                title="Reset calculator to bottom corner"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close calculator"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Calculator Digital Screen Display */}
          <div className="p-4 bg-slate-900/50 border-b border-slate-800/60">
            {/* Expression / Formula Trail */}
            <div className="h-4 text-[11px] font-mono text-slate-400 text-right truncate">
              {expression || '\u00A0'}
            </div>

            {/* Main Value Display */}
            <div className="flex items-baseline justify-between mt-1">
              <button
                type="button"
                onClick={handleCopyResult}
                className="text-[10px] text-slate-500 hover:text-emerald-400 flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-800 hover:border-emerald-500/30 transition-colors"
                title="Copy current value"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <div
                className="text-2xl font-black font-mono tracking-wider text-white text-right overflow-x-auto overflow-y-hidden max-w-[200px] scrollbar-none"
                title={display}
              >
                {display}
              </div>
            </div>
          </div>

          {/* Keypad Grid (Standard Exam Layout) */}
          <div className="p-3 grid grid-cols-4 gap-1.5 bg-slate-950/60">
            {/* Row 1: Clear and Functions */}
            <button
              type="button"
              onClick={clearAll}
              className="py-2.5 rounded-xl bg-red-950/40 hover:bg-red-950/70 border border-red-900/50 text-red-300 font-bold text-xs transition-colors active:scale-95"
              title="Clear All (Esc)"
            >
              C
            </button>
            <button
              type="button"
              onClick={clearEntry}
              className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold text-xs transition-colors active:scale-95"
              title="Clear Entry"
            >
              CE
            </button>
            <button
              type="button"
              onClick={backspace}
              className="py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold text-xs flex items-center justify-center transition-colors active:scale-95"
              title="Backspace"
            >
              <Delete className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => performOperation('÷')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-colors active:scale-95 flex items-center justify-center ${
                operation === '÷'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-850 hover:bg-slate-800 border border-slate-700/80 text-emerald-400'
              }`}
            >
              ÷
            </button>

            {/* Row 2: 7, 8, 9, × */}
            <button
              type="button"
              onClick={() => inputDigit('7')}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              7
            </button>
            <button
              type="button"
              onClick={() => inputDigit('8')}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              8
            </button>
            <button
              type="button"
              onClick={() => inputDigit('9')}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              9
            </button>
            <button
              type="button"
              onClick={() => performOperation('×')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-colors active:scale-95 flex items-center justify-center ${
                operation === '×'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-850 hover:bg-slate-800 border border-slate-700/80 text-emerald-400'
              }`}
            >
              ×
            </button>

            {/* Row 3: 4, 5, 6, - */}
            <button
              type="button"
              onClick={() => inputDigit('4')}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              4
            </button>
            <button
              type="button"
              onClick={() => inputDigit('5')}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              5
            </button>
            <button
              type="button"
              onClick={() => inputDigit('6')}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              6
            </button>
            <button
              type="button"
              onClick={() => performOperation('-')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-colors active:scale-95 flex items-center justify-center ${
                operation === '-'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-850 hover:bg-slate-800 border border-slate-700/80 text-emerald-400'
              }`}
            >
              −
            </button>

            {/* Row 4: 1, 2, 3, + */}
            <button
              type="button"
              onClick={() => inputDigit('1')}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => inputDigit('2')}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              2
            </button>
            <button
              type="button"
              onClick={() => inputDigit('3')}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              3
            </button>
            <button
              type="button"
              onClick={() => performOperation('+')}
              className={`py-2.5 rounded-xl font-bold text-sm transition-colors active:scale-95 flex items-center justify-center ${
                operation === '+'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-850 hover:bg-slate-800 border border-slate-700/80 text-emerald-400'
              }`}
            >
              +
            </button>

            {/* Row 5: ±, 0, ., = */}
            <button
              type="button"
              onClick={toggleSign}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-xs transition-colors active:scale-95"
              title="Toggle Positive/Negative"
            >
              ±
            </button>
            <button
              type="button"
              onClick={() => inputDigit('0')}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800/80 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={inputDecimal}
              className="py-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-white font-bold text-sm transition-colors active:scale-95"
            >
              .
            </button>
            <button
              type="button"
              onClick={handleEquals}
              className="py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-base shadow-lg shadow-emerald-600/30 transition-all active:scale-95 flex items-center justify-center"
              title="Calculate (Enter)"
            >
              =
            </button>
          </div>

          {/* Quick Helper Footer */}
          <div className="px-3.5 py-2 bg-slate-900/80 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
            <span>Supports keyboard &amp; numpad</span>
            <span className="font-mono text-emerald-400">Esc: Clear</span>
          </div>
        </div>
      )}
    </div>
  );
};
