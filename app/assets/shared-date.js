// The captured app supplies its existing React runtime, portal and icons.
export function createDatePicker({ React, jsx, jsxs, createPortal, ChevronLeft, ChevronRight, Calendar, ClearButton }) {
  const fromParts = (year, month, day = 1) => {
    const date = new Date(0);
    date.setHours(12, 0, 0, 0);
    date.setFullYear(year, month, day);
    return date;
  };
  const format = date => [String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const parse = value => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const [, year, month, day] = match.map(Number);
    const date = fromParts(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  };
  const today = () => {
    const date = new Date();
    return fromParts(date.getFullYear(), date.getMonth(), date.getDate());
  };
  const inRange = date => date.getFullYear() >= 0 && date.getFullYear() <= 9999;
  const clampDate = date => inRange(date) ? date
    : date.getFullYear() < 0 ? fromParts(0, 0, 1) : fromParts(9999, 11, 31);
  const monthStart = date => fromParts(date.getFullYear(), date.getMonth());
  const offsetDay = (date, offset) => clampDate(fromParts(date.getFullYear(), date.getMonth(), date.getDate() + offset));
  const offsetMonth = (date, offset) => {
    const first = fromParts(date.getFullYear(), date.getMonth() + offset);
    const lastDay = fromParts(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    return clampDate(fromParts(first.getFullYear(), first.getMonth(), Math.min(date.getDate(), lastDay)));
  };
  const monthDays = month => {
    const first = monthStart(month);
    const leading = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, index) => fromParts(first.getFullYear(), first.getMonth(), 1 - leading + index));
  };
  const composing = event => event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229;
  const focusableSelector = 'button,input,select,textarea,a[href],area[href],summary,iframe,[tabindex],[contenteditable="true"]';
  const visibleControls = scope => Array.from(scope.querySelectorAll(focusableSelector)).filter(node =>
    node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden],[inert],[aria-hidden="true"]')
      && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden'
  ).map((node, order) => ({ node, order })).sort((a, b) => {
    const left = a.node.tabIndex > 0 ? a.node.tabIndex : Infinity;
    const right = b.node.tabIndex > 0 ? b.node.tabIndex : Infinity;
    return left === right ? a.order - b.order : left - right;
  }).map(item => item.node);

  return function DatePicker({ id, value = '', onChange, ariaLabel, disabled = false, clearable = true }) {
    const initial = parse(value) || today();
    const [open, setOpen] = React.useState(false);
    const [month, setMonth] = React.useState(() => monthStart(initial));
    const [activeDate, setActiveDate] = React.useState(initial);
    const [position, setPosition] = React.useState(null);
    const triggerRef = React.useRef(null);
    const panelRef = React.useRef(null);
    const focusPendingRef = React.useRef(false);
    const focusFrameRef = React.useRef(null);
    const panelHadFocusRef = React.useRef(false);
    const panelId = React.useId();
    const monthId = `${panelId}-month`;
    const isOpen = open && !disabled;
    const activeKey = format(activeDate);
    const currentDay = format(today());
    const days = React.useMemo(() => monthDays(month), [month]);

    const updatePosition = React.useCallback(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const viewLeft = viewport?.offsetLeft || 0, viewTop = viewport?.offsetTop || 0;
      const viewWidth = viewport?.width || document.documentElement.clientWidth || window.innerWidth;
      const viewHeight = viewport?.height || window.innerHeight;
      const gutter = 8, gap = 4;
      const width = Math.max(0, Math.min(Math.max(280, rect.width), viewWidth - gutter * 2));
      const panel = panelRef.current;
      const desiredHeight = panel ? panel.scrollHeight + panel.offsetHeight - panel.clientHeight : 354;
      const below = Math.max(0, viewTop + viewHeight - gutter - rect.bottom - gap);
      const above = Math.max(0, rect.top - gap - viewTop - gutter);
      const upward = below < desiredHeight && above > below;
      const maxHeight = Math.max(0, Math.min(desiredHeight, viewHeight - gutter * 2, Math.max(80, upward ? above : below)));
      const top = upward ? rect.top - gap - maxHeight : rect.bottom + gap;
      const next = {
        left: Math.max(viewLeft + gutter, Math.min(rect.left, viewLeft + viewWidth - width - gutter)),
        top: Math.max(viewTop + gutter, Math.min(top, viewTop + viewHeight - maxHeight - gutter)),
        width, maxHeight, overflowY: 'auto', boxSizing: 'border-box',
      };
      setPosition(previous => previous && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
    }, []);

    function cancelFocusFrame() {
      if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
      focusFrameRef.current = null;
    }

    function focusTrigger() {
      cancelFocusFrame();
      focusFrameRef.current = requestAnimationFrame(() => {
        focusFrameRef.current = null;
        const trigger = triggerRef.current;
        if (trigger?.isConnected && !trigger.disabled) trigger.focus({ preventScroll: true });
      });
    }

    function closePicker(restoreFocus = false) {
      focusPendingRef.current = false;
      panelHadFocusRef.current = false;
      setOpen(false);
      if (restoreFocus) focusTrigger();
    }

    function openPicker() {
      if (disabled) return;
      cancelFocusFrame();
      const selected = parse(value) || today();
      setActiveDate(selected);
      setMonth(monthStart(selected));
      focusPendingRef.current = true;
      updatePosition();
      setOpen(true);
    }

    function selectDate(date) {
      if (disabled || !inRange(date)) return;
      onChange?.(format(date));
      setActiveDate(date);
      setMonth(monthStart(date));
      closePicker(true);
    }

    function moveDate(date, focusDate = true) {
      const next = clampDate(date);
      focusPendingRef.current = focusDate;
      setActiveDate(next);
      setMonth(monthStart(next));
    }

    function moveMonth(offset) {
      const target = fromParts(month.getFullYear(), month.getMonth() + offset,
        Math.min(activeDate.getDate(), fromParts(month.getFullYear(), month.getMonth() + offset + 1, 0).getDate()));
      moveDate(target, false);
    }

    // The portal's Tab order belongs between its source trigger and the next field.
    // At the ends, return to that logical order instead of entering unrelated body portals.
    function leavePanel(event) {
      const trigger = triggerRef.current;
      if (!trigger) { closePicker(); return; }
      const dialog = trigger.closest('[role="dialog"],dialog');
      const controls = visibleControls(dialog || document).filter(node => !panelRef.current?.contains(node));
      const index = controls.indexOf(trigger);
      let destination;
      if (event.shiftKey) destination = trigger;
      else if (index >= 0) destination = controls[index + 1] || (dialog ? controls[0] : null);
      closePicker();
      if (destination) {
        event.preventDefault();
        destination.focus({ preventScroll: true });
      } else trigger.focus({ preventScroll: true });
    }

    React.useLayoutEffect(() => {
      if (!isOpen || !position) return;
      updatePosition();
      if (focusPendingRef.current) {
        const button = panelRef.current?.querySelector(`[data-date="${activeKey}"]`);
        if (button) {
          focusPendingRef.current = false;
          button.focus({ preventScroll: true });
        }
      }
    }, [isOpen, position, activeKey, month, updatePosition]);

    React.useEffect(() => {
      if (!isOpen) return;
      const belongsToPicker = target => triggerRef.current?.contains(target) || panelRef.current?.contains(target);
      const outsidePointer = event => {
        if (event.target instanceof Node && !belongsToPicker(event.target)) closePicker();
      };
      const outsideFocus = event => {
        if (event.target instanceof Node && !belongsToPicker(event.target)) closePicker();
        else panelHadFocusRef.current = !!panelRef.current?.contains(event.target);
      };
      const keyboard = event => {
        if (composing(event) || !belongsToPicker(event.target)) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          closePicker(true);
        } else if (event.key === 'Tab') {
          event.stopImmediatePropagation();
          if (panelRef.current?.contains(event.target)) {
            const controls = visibleControls(panelRef.current);
            const index = controls.indexOf(document.activeElement);
            const next = controls[index + (event.shiftKey ? -1 : 1)];
            if (index >= 0 && next) {
              event.preventDefault();
              next.focus({ preventScroll: true });
            } else leavePanel(event);
          } else {
            closePicker();
            // The trigger remains in the parent form, so its own Tab order applies.
            const trigger = triggerRef.current;
            const dialog = trigger?.closest('[role="dialog"],dialog');
            if (dialog) {
              const controls = visibleControls(dialog);
              const index = controls.indexOf(trigger);
              const next = controls[index + (event.shiftKey ? -1 : 1)]
                || controls[event.shiftKey ? controls.length - 1 : 0];
              if (next) { event.preventDefault(); next.focus({ preventScroll: true }); }
            }
          }
        }
      };
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      window.visualViewport?.addEventListener('resize', updatePosition);
      window.visualViewport?.addEventListener('scroll', updatePosition);
      document.addEventListener('pointerdown', outsidePointer, true);
      document.addEventListener('focusin', outsideFocus, true);
      document.addEventListener('keydown', keyboard, true);
      const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updatePosition) : null;
      if (triggerRef.current) observer?.observe(triggerRef.current);
      if (panelRef.current) observer?.observe(panelRef.current);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
        window.visualViewport?.removeEventListener('resize', updatePosition);
        window.visualViewport?.removeEventListener('scroll', updatePosition);
        document.removeEventListener('pointerdown', outsidePointer, true);
        document.removeEventListener('focusin', outsideFocus, true);
        document.removeEventListener('keydown', keyboard, true);
        observer?.disconnect();
      };
    }, [isOpen, updatePosition]);

    React.useLayoutEffect(() => {
      if (!disabled || !open) return;
      // Disabled props remove the portal in this commit, before this layout effect.
      const needsFocus = panelHadFocusRef.current || panelRef.current?.contains(document.activeElement);
      closePicker();
      if (needsFocus) {
        const trigger = triggerRef.current;
        const scope = trigger?.closest('[role="dialog"],dialog') || document;
        const controls = visibleControls(scope).filter(node => !panelRef.current?.contains(node));
        const next = controls.find(node => trigger?.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)
          || controls[controls.length - 1];
        next?.focus({ preventScroll: true });
      }
    }, [disabled, open]);

    React.useEffect(() => () => cancelFocusFrame(), []);

    function onTriggerKeyDown(event) {
      if (disabled || composing(event) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        openPicker();
      }
    }

    function onGridKeyDown(event) {
      if (composing(event) || event.ctrlKey || event.metaKey || event.altKey) return;
      const date = parse(event.target.dataset?.date);
      if (!date) return;
      let next;
      const weekDay = (date.getDay() + 6) % 7;
      switch (event.key) {
        case 'ArrowLeft': next = offsetDay(date, -1); break;
        case 'ArrowRight': next = offsetDay(date, 1); break;
        case 'ArrowUp': next = offsetDay(date, -7); break;
        case 'ArrowDown': next = offsetDay(date, 7); break;
        case 'Home': next = offsetDay(date, -weekDay); break;
        case 'End': next = offsetDay(date, 6 - weekDay); break;
        case 'PageUp': next = offsetMonth(date, -1); break;
        case 'PageDown': next = offsetMonth(date, 1); break;
        case 'Enter': case ' ': event.preventDefault(); event.stopPropagation(); selectDate(date); return;
        default: return;
      }
      event.preventDefault();
      event.stopPropagation();
      moveDate(next);
    }

    return jsxs('span', {
      className: `date-field-control ${isOpen ? 'is-open' : ''} ${clearable && !disabled && value ? 'has-clear' : ''}`.trim(),
      children: [
        jsxs('button', {
          ref: triggerRef, id, type: 'button', role: 'combobox', className: 'date-field-trigger', disabled,
          'aria-label': ariaLabel || (id ? undefined : '选择日期'), 'aria-controls': panelId,
          'aria-expanded': isOpen, 'aria-haspopup': 'dialog', 'aria-disabled': disabled || undefined,
          onClick: () => isOpen ? closePicker() : openPicker(), onKeyDown: onTriggerKeyDown,
          children: [jsx('span', { className: value ? '' : 'is-placeholder', children: value || '年 / 月 / 日' }),
            jsx(Calendar, { 'aria-hidden': 'true', size: 16 })],
        }),
        clearable && !disabled && value && jsx(ClearButton, {
          type: 'button', className: 'date-field-clear', disabled,
          'aria-label': `清空${ariaLabel || '日期'}`,
          title: `清空${ariaLabel || '日期'}`,
          onMouseDown: event => event.preventDefault(),
          onClick: event => {
            event.stopPropagation();
            if (disabled) return;
            onChange?.('');
            closePicker(true);
          },
        }),
        isOpen && position && createPortal(jsxs('div', {
          ref: panelRef, id: panelId, className: 'arco-date-picker-panel', role: 'dialog',
          'aria-label': ariaLabel ? `选择${ariaLabel}` : '选择日期', style: position,
          onFocusCapture: () => { panelHadFocusRef.current = true; },
          children: [
            jsxs('div', { className: 'arco-date-picker-header', children: [
              jsx('button', { type: 'button', 'aria-label': '上一月',
                disabled: month.getFullYear() === 0 && month.getMonth() === 0,
                onClick: () => moveMonth(-1), children: jsx(ChevronLeft, { 'aria-hidden': 'true', size: 16 }) }),
              jsxs('strong', { id: monthId, 'aria-live': 'polite', 'aria-atomic': true,
                children: [month.getFullYear(), '年', month.getMonth() + 1, '月'] }),
              jsx('button', { type: 'button', 'aria-label': '下一月',
                disabled: month.getFullYear() === 9999 && month.getMonth() === 11,
                onClick: () => moveMonth(1), children: jsx(ChevronRight, { 'aria-hidden': 'true', size: 16 }) }),
            ] }),
            jsx('div', { className: 'arco-date-picker-week', 'aria-hidden': true,
              children: ['一', '二', '三', '四', '五', '六', '日'].map(day => jsx('span', { children: day }, day)) }),
            jsx('div', { className: 'arco-date-picker-grid', role: 'grid', 'aria-labelledby': monthId,
              onKeyDown: onGridKeyDown,
              children: Array.from({ length: 6 }, (_, row) => jsx('div', {
                role: 'row', style: { display: 'contents' },
                children: days.slice(row * 7, row * 7 + 7).map(date => {
                  const key = format(date);
                  const selected = key === value;
                  return jsx('div', { role: 'gridcell', 'aria-selected': selected, style: { display: 'contents' },
                    children: jsx('button', {
                      type: 'button', 'data-date': key, tabIndex: key === activeKey ? 0 : -1,
                      disabled: !inRange(date),
                      'aria-label': `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
                      'aria-pressed': selected, 'aria-current': key === currentDay ? 'date' : undefined,
                      className: [date.getMonth() !== month.getMonth() ? 'is-outside' : '',
                        key === currentDay ? 'is-today' : '', selected ? 'is-selected' : ''].filter(Boolean).join(' '),
                      onFocus: () => setActiveDate(date), onClick: () => selectDate(date), children: date.getDate(),
                    }),
                  }, key);
                }),
              }, row)),
            }),
            jsx('div', { className: 'arco-date-picker-footer', children: jsx('button', {
              type: 'button', onClick: () => selectDate(today()), children: '今天',
            }) }),
          ],
        }), document.body),
      ],
    });
  };
}
