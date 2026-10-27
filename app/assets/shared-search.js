// The existing GKX input/button styles are shared by list and picker searches.
export function createSearchComponents({ React, jsx, jsxs, ClearIcon }) {
  function SearchField({ label, ariaLabel = label, placeholder = label, value,
    onChange, onEnter, onClear, clearable = false, className = '', disabled = false }) {
    const inputRef = React.useRef(null);
    const hasClear = clearable && !disabled && String(value ?? '').length > 0;
    return jsxs('label', {
      className: `filter-field gkx-search-field ${label ? '' : 'filter-field-unlabeled'} ${className}`.trim(),
      children: [label && jsx('span', { className: 'filter-label', children: label }),
        jsxs('span', {
          className: `filter-search-control${hasClear ? ' has-clear' : ''}`,
          children: [jsx('input', {
            ref: inputRef, type: 'text', className: 'arco-input arco-input-size-default',
            'aria-label': ariaLabel, placeholder, value, disabled,
            onChange: event => onChange?.(event.target.value),
            onKeyDown: event => {
              const composing = event.isComposing || event.nativeEvent?.isComposing || event.keyCode === 229;
              if (event.key === 'Enter' && !composing && onEnter) {
                event.preventDefault();
                onEnter();
              }
            },
          }), hasClear && jsx('button', {
            type: 'button', className: 'gkx-search-clear', 'aria-label': '清空搜索关键词', title: '清空搜索关键词',
            onMouseDown: event => event.preventDefault(),
            onClick: () => {
              if (onClear) onClear(); else onChange?.('');
              inputRef.current?.focus();
            },
            children: jsx(ClearIcon, { size: 14, 'aria-hidden': 'true' }),
          })],
        })],
    });
  }

  function SearchActions({ query, reset }) {
    return jsxs(React.Fragment, {
      children: [React.cloneElement(query, { variant: 'primary', searchAction: 'query' }),
        React.cloneElement(reset, { variant: 'default', type: 'button', searchAction: 'reset' })],
    });
  }

  return { SearchField, SearchActions };
}
