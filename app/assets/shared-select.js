// One implementation for the existing GKX select and migrated native selects.
// React and icons come from the captured app so there is no second runtime.
export function createSelectComponents({ React, jsx, jsxs, createPortal, ChevronDown }) {
  const asText = children => React.Children.toArray(children).map(child =>
    React.isValidElement(child) ? asText(child.props.children) : String(child ?? '')
  ).join('');

  function Select({ id, options = [], value, defaultValue, onChange, placeholder = '请选择',
    ariaLabel, disabled = false, multiple = false, name, form, required, className = '',
    style, title, tabIndex, invalid, onFocus, onBlur }) {
    const entries = options.map(option => typeof option === 'object' && option !== null
      ? { value: String(option.value ?? ''), label: String(option.label ?? option.value ?? ''), disabled: !!option.disabled }
      : { value: String(option), label: String(option), disabled: false });
    const controlled = value !== undefined;
    const [localValue, setLocalValue] = React.useState(() => defaultValue !== undefined
      ? defaultValue : multiple ? [] : entries.find(option => !option.disabled)?.value ?? '');
    const currentValue = controlled ? value : localValue;
    const selectedValues = multiple
      ? (Array.isArray(currentValue) ? currentValue.map(String) : [])
      : [String(currentValue ?? '')];
    const matchingEntries = entries.filter(option => selectedValues.includes(option.value));
    const selectedEntries = multiple ? matchingEntries : matchingEntries.slice(0, 1);
    const label = selectedEntries.map(option => option.label).join('、');
    const [open, setOpen] = React.useState(false);
    const [activeIndex, setActiveIndex] = React.useState(0);
    const [position, setPosition] = React.useState(null);
    const triggerRef = React.useRef(null);
    const menuRef = React.useRef(null);
    const typeaheadRef = React.useRef({ text: '', time: 0 });
    const previousMultipleRef = React.useRef(multiple);
    const listId = React.useId();
    const isOpen = open && !disabled;
    const enabledIndices = entries.flatMap((option, index) => option.disabled ? [] : [index]);

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const gutter = 8, gap = 4;
      const desiredHeight = Math.min(224, entries.length * 32 + 10);
      const below = Math.max(0, window.innerHeight - rect.bottom - gutter - gap);
      const above = Math.max(0, rect.top - gutter - gap);
      const upward = below < Math.min(desiredHeight, 128) && above > below;
      const maxHeight = Math.min(desiredHeight, upward ? above : below);
      const width = Math.min(rect.width, window.innerWidth - gutter * 2);
      const next = {
        left: Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter)),
        top: upward ? Math.max(gutter, rect.top - gap - maxHeight) : rect.bottom + gap,
        width, maxHeight,
      };
      setPosition(previous => previous && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
    }

    React.useEffect(() => {
      if (!isOpen) return;
      updatePosition();
      const outside = event => {
        if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
      };
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      document.addEventListener('pointerdown', outside);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
        document.removeEventListener('pointerdown', outside);
      };
    }, [isOpen, entries.length]);

    React.useLayoutEffect(() => {
      if (isOpen) menuRef.current?.querySelectorAll('[role="option"]')[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }, [isOpen, activeIndex]);

    React.useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
    React.useEffect(() => {
      if (previousMultipleRef.current === multiple) return;
      previousMultipleRef.current = multiple;
      if (!controlled) setLocalValue(defaultValue !== undefined
        ? defaultValue : multiple ? [] : entries.find(option => !option.disabled)?.value ?? '');
      setOpen(false);
      setActiveIndex(0);
    }, [multiple, controlled, defaultValue]);

    function openMenu(last = false) {
      if (disabled || !enabledIndices.length) return;
      const selected = entries.findIndex(option => !option.disabled && selectedValues.includes(option.value));
      setActiveIndex(selected >= 0 ? selected : enabledIndices[last ? enabledIndices.length - 1 : 0]);
      updatePosition();
      setOpen(true);
    }

    function choose(index) {
      const option = entries[index];
      if (!option || option.disabled) return;
      const next = multiple
        ? selectedValues.includes(option.value) ? selectedValues.filter(item => item !== option.value) : [...selectedValues, option.value]
        : option.value;
      if (!controlled) setLocalValue(next);
      onChange?.(next);
      if (!multiple) setOpen(false);
    }

    function onKeyDown(event) {
      if (disabled) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!isOpen) openMenu(event.key === 'ArrowUp');
        else {
          const current = enabledIndices.indexOf(activeIndex), direction = event.key === 'ArrowDown' ? 1 : -1;
          setActiveIndex(enabledIndices[(current + direction + enabledIndices.length) % enabledIndices.length]);
        }
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        openMenu();
        setActiveIndex(enabledIndices[event.key === 'Home' ? 0 : enabledIndices.length - 1]);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (isOpen) choose(activeIndex); else openMenu();
      } else if (event.key === 'Escape' && isOpen) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      } else if (event.key === 'Tab') setOpen(false);
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
        const now = Date.now(), previous = typeaheadRef.current;
        const text = (now - previous.time < 700 ? previous.text : '') + event.key;
        typeaheadRef.current = { text, time: now };
        const index = entries.findIndex(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(text.toLocaleLowerCase()));
        if (index >= 0) { event.preventDefault(); openMenu(); setActiveIndex(index); }
      }
    }

    const placeholderVisible = !label || (!multiple && selectedValues[0] === '' && label === placeholder);
    return jsxs('div', {
      className: `gkx-select ${isOpen ? 'is-open' : ''} ${className}`.trim(), style,
      onBlur: event => {
        const next = event.relatedTarget;
        if (!event.currentTarget.contains(next) && !menuRef.current?.contains(next)) setOpen(false);
        onBlur?.(event);
      },
      children: [
        jsxs('button', {
          ref: triggerRef, id, type: 'button', role: 'combobox', className: 'gkx-select-trigger',
          'aria-label': ariaLabel, 'aria-controls': listId, 'aria-expanded': isOpen,
          'aria-activedescendant': isOpen ? `${listId}-option-${activeIndex}` : undefined,
          'aria-haspopup': 'listbox', 'aria-required': required || undefined, 'aria-invalid': invalid,
          disabled, title, tabIndex, onFocus, onKeyDown,
          onClick: () => isOpen ? setOpen(false) : openMenu(),
          children: [jsx('span', { className: placeholderVisible ? 'is-placeholder' : '', children: label || placeholder }),
            jsx(ChevronDown, { 'aria-hidden': 'true', size: 16 })],
        }),
        isOpen && position && createPortal(jsx('div', {
          ref: menuRef, id: listId, role: 'listbox', 'aria-label': ariaLabel,
          'aria-multiselectable': multiple || undefined,
          className: `gkx-select-menu${multiple ? ' gkx-multiselect-menu' : ''}`,
          style: position, onMouseDown: event => event.preventDefault(),
          children: entries.map((option, index) => {
            const selected = selectedValues.includes(option.value);
            return jsxs('button', {
              id: `${listId}-option-${index}`, type: 'button', role: 'option', tabIndex: -1,
              disabled: option.disabled, 'aria-disabled': option.disabled || undefined, 'aria-selected': selected,
              className: `${selected ? multiple ? 'is-selected' : 'active' : ''} ${activeIndex === index ? 'is-active' : ''}`.trim(),
              onClick: () => { setActiveIndex(index); choose(index); },
              children: [multiple && jsx('i', { 'aria-hidden': 'true' }), option.label],
            }, `${option.value}-${index}`);
          }),
        }), document.body),
        name && selectedValues.map((item, index) => jsx('input', { type: 'hidden', name, form, disabled, value: item }, index)),
      ],
    });
  }

  function NativeSelect(props) {
    const options = [];
    function visit(children, inheritedDisabled = false) {
      React.Children.forEach(children, child => {
        if (!React.isValidElement(child)) return;
        if (child.type === 'option') options.push({
          value: String(child.props.value ?? asText(child.props.children)),
          label: asText(child.props.children), disabled: inheritedDisabled || !!child.props.disabled,
        });
        else visit(child.props.children, inheritedDisabled || !!child.props.disabled);
      });
    }
    visit(props.children);
    const { children, onChange, ...rest } = props;
    return jsx(Select, {
      ...rest, options, ariaLabel: props['aria-label'], invalid: props['aria-invalid'],
      onChange: next => {
        const values = Array.isArray(next) ? next : [next];
        const selectedOptions = options.filter(option => values.includes(option.value)).map(option => ({
          value: option.value, label: option.label, text: option.label, selected: true,
        }));
        const target = { value: selectedOptions[0]?.value ?? '', selectedOptions, name: props.name, id: props.id };
        onChange?.({ target, currentTarget: target, type: 'change' });
      },
    });
  }

  return { Select, NativeSelect };
}
