// Native input compatibility, with one shared clear affordance.
export function createInputComponents({ React, jsx, jsxs }) {
  const clearImage = new URL('./paper-editor/input-clear.svg', import.meta.url).href;
  const textTypes = new Set(['text', 'search', 'tel', 'email', 'url']);
  const nativeDateTypes = new Set(['date', 'datetime-local', 'time', 'month', 'week']);
  const sensitiveName = /token|refresh|password|credential|密码|密钥|秘钥|凭证|api[\s_-]*key|access[\s_-]*key/i;
  const nonempty = value => value !== undefined && value !== null && String(value).length > 0;
  const cleanLabel = text => String(text ?? '').replace(/^[\s*＊]+/, '').replace(/[：:]\s*$/, '').trim();
  const steppedValue = (node, direction) => {
    // A detached native input preserves the browser's step grid and decimal
    // precision, without changing the real field before its React input event.
    const probe = node.cloneNode(false);
    probe.value = node.value;
    if (probe.step === 'any') probe.step = '1';
    try {
      if (direction > 0) probe.stepUp(); else probe.stepDown();
      return probe.value;
    } catch { return null; }
  };

  function ClearButton({ className = '', ariaLabel = '清空', title = '清空', disabled = false,
    onMouseDown, onClick, children, ...buttonProps }) {
    return jsx('button', {
      ...buttonProps, type: 'button', className: `gkx-clear-button ${className}`.trim(),
      'aria-label': buttonProps['aria-label'] ?? ariaLabel, title, disabled,
      onMouseDown: event => { event.preventDefault(); onMouseDown?.(event); }, onClick,
      // The Figma input uses a 16px instance of the 24px master icon.
      children: jsx('img', { src: clearImage, width: 16, height: 16, alt: '', 'aria-hidden': true }),
    });
  }

  function Input({ clearable, onClear, ariaLabel, label, ref: forwardedRef,
    onChange, onInput, ...inputProps }) {
    const inputRef = React.useRef(null);
    const type = String(inputProps.type ?? 'text').toLowerCase();
    const controlled = inputProps.value !== undefined && inputProps.value !== null;
    const [hasUncontrolledValue, setHasUncontrolledValue] = React.useState(() => nonempty(inputProps.defaultValue));
    const [domLabel, setDomLabel] = React.useState('');
    const [domLocked, setDomLocked] = React.useState(false);
    const [numberLimits, setNumberLimits] = React.useState({ up: false, down: false });
    const nativeProps = { ...inputProps };
    if (nativeProps['aria-label'] === undefined && ariaLabel !== undefined) nativeProps['aria-label'] = ariaLabel;
    const propsIdentity = [label, nativeProps['aria-label'], nativeProps.name, nativeProps.id,
      nativeProps.autoComplete, nativeProps.autocomplete].filter(value => value !== undefined).join(' ');
    const supportedType = textTypes.has(type) || nativeDateTypes.has(type) || type === 'number';
    const allowed = (textTypes.has(type) || nativeDateTypes.has(type) ? clearable !== false : type === 'number' && clearable === true)
      && !inputProps.disabled && !inputProps.readOnly && !domLocked && !sensitiveName.test(propsIdentity)
      && (!controlled || !!onChange || !!onInput || !!onClear);
    const hasClear = supportedType && allowed && (controlled ? nonempty(inputProps.value) : hasUncontrolledValue);
    const hasStepper = type === 'number' && !inputProps.disabled && !inputProps.readOnly && !domLocked
      && (!controlled || !!onChange || !!onInput);
    const inputLabel = cleanLabel(label || nativeProps['aria-label'] || domLabel
      || nativeProps.placeholder || nativeProps.name || nativeProps.id || '输入内容');

    const updateNumberLimits = node => {
      if (type !== 'number' || !node) return;
      const locked = node.matches(':disabled') || node.readOnly;
      const up = steppedValue(node, 1), down = steppedValue(node, -1);
      const next = { up: locked || up === null || up === node.value, down: locked || down === null || down === node.value };
      setNumberLimits(previous => previous.up === next.up && previous.down === next.down ? previous : next);
    };

    const attachRef = React.useCallback(node => {
      inputRef.current = node;
      if (typeof forwardedRef === 'function') {
        const cleanup = forwardedRef(node);
        // React 19 callback refs may return their own cleanup instead of receiving null.
        if (node && typeof cleanup === 'function') return () => {
          if (inputRef.current === node) inputRef.current = null;
          cleanup();
        };
      } else if (forwardedRef) forwardedRef.current = node;
    }, [forwardedRef]);

    React.useLayoutEffect(() => {
      const node = inputRef.current;
      if (!node || !supportedType) return;
      const labels = Array.from(node.labels ?? []).map(item => cleanLabel(item.textContent)).filter(Boolean);
      const labelledBy = (node.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean)
        .map(id => cleanLabel(node.ownerDocument.getElementById(id)?.textContent)).filter(Boolean);
      // Some legacy form labels point to a validation wrapper, not the input.
      const fieldLabel = !labels.length && !labelledBy.length
        ? cleanLabel(node.closest('.form-field, .form-component-preview')?.querySelector(':scope > .form-field-label, :scope > label')?.textContent)
        : '';
      const associatedLabel = [...labels, ...labelledBy, fieldLabel].filter(Boolean).join(' ');
      setDomLabel(previous => previous === associatedLabel ? previous : associatedLabel);
      const locked = node.matches(':disabled') || node.readOnly || sensitiveName.test(associatedLabel);
      setDomLocked(previous => previous === locked ? previous : locked);
      updateNumberLimits(node);
      if (!controlled && !locked && !sensitiveName.test(propsIdentity)) {
        const next = nonempty(node.value);
        setHasUncontrolledValue(previous => previous === next ? previous : next);
      }
    });

    React.useEffect(() => {
      const node = inputRef.current, form = node?.form;
      if (!node || !form || controlled || !supportedType) return;
      let disposed = false;
      const reset = () => queueMicrotask(() => {
        // The native reset default action runs after the reset event.
        if (!disposed && inputRef.current === node) {
          setHasUncontrolledValue(nonempty(node.value));
          updateNumberLimits(node);
        }
      });
      form.addEventListener('reset', reset);
      return () => { disposed = true; form.removeEventListener('reset', reset); };
    }, [controlled, supportedType, type, inputProps.form, inputProps.id]);

    const updatePresence = node => {
      if (!controlled && allowed) setHasUncontrolledValue(nonempty(node.value));
    };
    const change = event => { updatePresence(event.currentTarget); updateNumberLimits(event.currentTarget); onChange?.(event); };
    const input = event => { updatePresence(event.currentTarget); updateNumberLimits(event.currentTarget); onInput?.(event); };

    const stepNumber = direction => {
      const node = inputRef.current;
      if (!node || !hasStepper || node.matches(':disabled') || node.readOnly) return;
      const before = node.value;
      const next = steppedValue(node, direction);
      if (next !== null && next !== before) {
        const setter = Object.getOwnPropertyDescriptor(node.ownerDocument.defaultView.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(node, next);
        node.dispatchEvent(new node.ownerDocument.defaultView.Event('input', { bubbles: true, composed: true }));
      }
      updateNumberLimits(node);
      node.focus({ preventScroll: true });
    };

    const clear = event => {
      const node = inputRef.current;
      if (!node || !allowed || node.matches(':disabled') || node.readOnly) return;
      const view = node.ownerDocument.defaultView;
      const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')?.set;
      if (!setter) return;
      // Bypass React's own value tracker, so the real input event reaches onChange.
      setter.call(node, '');
      node.dispatchEvent(new view.Event('input', { bubbles: true, composed: true }));
      if (!controlled && inputRef.current === node) setHasUncontrolledValue(nonempty(node.value));
      // Extra business semantics run after the normal native input/onChange path.
      onClear?.(event);
      if (node.isConnected && !node.matches(':disabled')) node.focus({ preventScroll: true });
    };

    const element = jsx('input', { ...nativeProps, ref: attachRef, onChange: change, onInput: input });
    // Keep special native input types native; ordinary field layout stays stable
    // when disabled, readonly or clearable props change.
    if (!supportedType || inputProps.disabled || inputProps.readOnly
      || (!hasStepper && ((type === 'number' && clearable !== true) || clearable === false))) return element;
    return jsxs('span', {
      className: `gkx-text-input${nativeDateTypes.has(type) ? ' is-native-date' : ''}${hasStepper ? ' is-number' : ''}${hasClear ? ' has-clear' : ''}`,
      children: [element, hasClear && jsx(ClearButton, {
        ariaLabel: `清空${inputLabel}`, title: `清空${inputLabel}`, onClick: clear,
      }), hasStepper && jsxs('span', {
        className: 'gkx-number-stepper', children: [
          jsx('button', { type: 'button', tabIndex: -1, className: 'gkx-number-step is-up',
            'aria-label': `增加${inputLabel}`, title: '增加', disabled: numberLimits.up,
            onMouseDown: event => event.preventDefault(), onClick: () => stepNumber(1),
            children: jsx('span', { className: 'gkx-number-chevron', 'aria-hidden': true }) }),
          jsx('button', { type: 'button', tabIndex: -1, className: 'gkx-number-step is-down',
            'aria-label': `减少${inputLabel}`, title: '减少', disabled: numberLimits.down,
            onMouseDown: event => event.preventDefault(), onClick: () => stepNumber(-1),
            children: jsx('span', { className: 'gkx-number-chevron', 'aria-hidden': true }) }),
        ],
      })],
    });
  }

  return { Input, ClearButton };
}
