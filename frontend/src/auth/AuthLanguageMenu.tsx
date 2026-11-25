import { ChevronDown, Globe2 } from 'lucide-react';
import { KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

type LanguageOption = {
  code: string;
  label: string;
  nativeLabel: string;
};

const LANGUAGE_STORAGE_KEY = 'eingress_auth_language';

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'fil', label: 'Filipino', nativeLabel: 'Filipino' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { code: 'zh', label: 'Chinese', nativeLabel: '中文' },
];

function getInitialLanguage(): LanguageOption {
  if (typeof window === 'undefined') {
    return LANGUAGE_OPTIONS[0];
  }

  try {
    const savedCode = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const match = LANGUAGE_OPTIONS.find((option) => option.code === savedCode);
    return match ?? LANGUAGE_OPTIONS[0];
  } catch {
    return LANGUAGE_OPTIONS[0];
  }
}

export function AuthLanguageMenu() {
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageOption>(getInitialLanguage);
  const [isOpen, setIsOpen] = useState(false);

  const triggerId = useId();
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const enterOnOpenRef = useRef(false);
  const pointerActivationRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.lang = selectedLanguage.code;
  }, [selectedLanguage.code]);

  useEffect(() => {
    const popover = popoverRef.current;
    const group = groupRef.current;
    const trigger = triggerRef.current;

    if (!popover || !group || !trigger) {
      return;
    }

    const supportsFocusGroup = 'focusGroup' in HTMLElement.prototype;
    if (!supportsFocusGroup) {
      group.setAttribute('role', 'menu');
    }

    const supportsAnchorPositioning =
      typeof CSS !== 'undefined' && CSS.supports('position-area', 'block-end');

    const positionFallback = () => {
      if (supportsAnchorPositioning) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = popover.getBoundingClientRect();
      const gap = 8;
      const margin = 8;

      let top = triggerRect.bottom + gap;
      if (top + menuRect.height > window.innerHeight - margin) {
        top = Math.max(margin, triggerRect.top - menuRect.height - gap);
      }

      let left = triggerRect.left;
      if (left + menuRect.width > window.innerWidth - margin) {
        left = Math.max(margin, triggerRect.right - menuRect.width);
      }

      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    };

    const handleToggle = (event: Event) => {
      const toggleEvent = event as ToggleEvent;
      const open = toggleEvent.newState === 'open';
      setIsOpen(open);

      if (open) {
        positionFallback();
        if (enterOnOpenRef.current) {
          enterOnOpenRef.current = false;
          const firstItem = group.querySelector<HTMLButtonElement>('button:not(:disabled)');
          firstItem?.focus({ preventScroll: true });
        }
      } else {
        enterOnOpenRef.current = false;
      }
    };

    const handleFocusGroupKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Tab') {
        if (popover.matches(':popover-open')) {
          popover.hidePopover();
        }
        return;
      }

      if (supportsFocusGroup) {
        return;
      }

      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        return;
      }

      const items = Array.from(group.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if (items.length === 0) {
        return;
      }

      const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : currentIndex < 0
              ? 0
              : (currentIndex + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;

      event.preventDefault();
      event.stopImmediatePropagation();
      items[nextIndex].focus({ preventScroll: true });
    };

    const handleDocumentFocusIn = (event: FocusEvent) => {
      if (!popover.matches(':popover-open')) {
        return;
      }

      const target = event.target as Node | null;
      if (target && !popover.contains(target) && !trigger.contains(target)) {
        popover.hidePopover();
      }
    };

    popover.addEventListener('toggle', handleToggle);
    group.addEventListener('keydown', handleFocusGroupKeyDown, true);
    document.addEventListener('focusin', handleDocumentFocusIn);

    return () => {
      popover.removeEventListener('toggle', handleToggle);
      group.removeEventListener('keydown', handleFocusGroupKeyDown, true);
      document.removeEventListener('focusin', handleDocumentFocusIn);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  function handleTriggerClick() {
    if ('commandForElement' in HTMLButtonElement.prototype) {
      return;
    }

    popoverRef.current?.togglePopover();
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      enterOnOpenRef.current = true;
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const popover = popoverRef.current;
      const group = groupRef.current;
      if (!popover || !group) {
        return;
      }

      if (popover.matches(':popover-open')) {
        group.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({
          preventScroll: true,
        });
      } else {
        enterOnOpenRef.current = true;
        triggerRef.current?.click();
      }
    }
  }

  function handleSelectLanguage(option: LanguageOption) {
    setSelectedLanguage(option);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, option.code);
    } catch {
      // Ignore storage failures in restricted browser modes.
    }

    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }

    const fromPointer = pointerActivationRef.current;
    pointerActivationRef.current = false;

    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (popoverRef.current?.matches(':popover-open')) {
        popoverRef.current.hidePopover();
      }
      if (!fromPointer) {
        triggerRef.current?.focus({ preventScroll: true });
      }
    }, 150);
  }

  return (
    <div className="language-menu-shell">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="language-button"
        id={triggerId}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        onPointerDown={() => {
          enterOnOpenRef.current = false;
        }}
        ref={triggerRef}
        type="button"
        {...({
          command: 'toggle-popover',
          commandfor: menuId,
        } as Record<string, string>)}
      >
        <Globe2 size={18} aria-hidden="true" />
        <span>{selectedLanguage.label}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={isOpen ? 'language-chevron open' : 'language-chevron'}
        />
      </button>

      <div className="language-menu-popover" id={menuId} popover="auto" ref={popoverRef}>
        <div
          aria-labelledby={triggerId}
          className="language-menu-list"
          ref={groupRef}
          {...({ focusgroup: 'menu nomemory' } as Record<string, string>)}
        >
          <div aria-label="Select language" role="group">
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                aria-checked={selectedLanguage.code === option.code}
                className="language-menu-item"
                key={option.code}
                onClick={() => handleSelectLanguage(option)}
                onPointerDown={() => {
                  pointerActivationRef.current = true;
                }}
                onPointerMove={(event) => {
                  if (
                    document.elementFromPoint(event.clientX, event.clientY)?.closest('button') ===
                    event.currentTarget
                  ) {
                    event.currentTarget.focus({ preventScroll: true });
                  }
                }}
                role="menuitemradio"
                type="button"
              >
                <span>{option.label}</span>
                {option.nativeLabel !== option.label ? (
                  <span className="hint" aria-hidden="true">
                    {option.nativeLabel}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
