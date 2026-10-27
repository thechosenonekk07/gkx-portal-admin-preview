// Shared resource picker. The caller owns selection cardinality and persistence.
export function createResourcePicker({ React, jsx, jsxs, createPortal, Header, SearchField, SearchActions, Button, Pagination }) {
  return function ResourcePicker({ title, searchPlaceholder, searchFields, columns, rows, rowKey, close, save, initialSelectedKey, multiple = false, disabledKeys = [] }) {
    const [draftQuery, setDraftQuery] = React.useState('');
    const [query, setQuery] = React.useState('');
    const [selectedKeys, setSelectedKeys] = React.useState(initialSelectedKey ? [String(initialSelectedKey)] : []);
    const [page, setPage] = React.useState(1);
    const [pageSize, setPageSize] = React.useState(10);
    const dialogRef = React.useRef(null);
    const radioName = React.useId();
    const keyword = query.trim().toLowerCase();
    const filtered = keyword ? rows.filter(row => searchFields.some(key => String(row[key] ?? '').toLowerCase().includes(keyword))) : rows;
    const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
    const visibleRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const selectedSet = new Set(selectedKeys);
    const disabledSet = new Set(disabledKeys.map(String));
    const selected = selectedKeys.map(key => rows.find(row => String(row[rowKey] ?? '') === key)).filter(Boolean);
    const availablePageKeys = visibleRows.map(row => String(row[rowKey] ?? '')).filter(key => !disabledSet.has(key));
    const allPageSelected = availablePageKeys.length > 0 && availablePageKeys.every(key => selectedSet.has(key));
    const somePageSelected = availablePageKeys.some(key => selectedSet.has(key));
    const toggleSelection = (key, checked) => {
      if (disabledSet.has(key)) return;
      setSelectedKeys(keys => multiple ? checked ? keys.includes(key) ? keys : [...keys, key] : keys.filter(value => value !== key) : [key]);
    };
    const togglePage = checked => setSelectedKeys(keys => checked ? [...new Set([...keys, ...availablePageKeys])] : keys.filter(key => !availablePageKeys.includes(key)));
    const rowName = row => row.nameZh || row.nameEn || row.name || String(row[rowKey]);
    const applyQuery = () => { setQuery(draftQuery); setPage(1); };
    const resetQuery = () => { setDraftQuery(''); setQuery(''); setPage(1); };

    React.useEffect(() => {
      const dialog = dialogRef.current;
      const previousFocus = document.activeElement;
      dialog.querySelector('input:not(:disabled)')?.focus({ preventScroll: true });
      const handleKeyDown = event => {
        if (event.isComposing || event.keyCode === 229) return;
        if (dialog.querySelector('[role="combobox"][aria-expanded="true"]')) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        if (event.key !== 'Tab') return;
        const controls = Array.from(dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]'))
          .filter(node => node.getClientRects().length && node.getAttribute('aria-hidden') !== 'true');
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      };
      dialog.addEventListener('keydown', handleKeyDown);
      return () => {
        dialog.removeEventListener('keydown', handleKeyDown);
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      };
    }, []);

    return createPortal(jsx('div', {
      className: 'modal-backdrop', onMouseDown: event => { if (event.target === event.currentTarget) close(); },
      children: jsxs('div', {
        ref: dialogRef, id: 'resource-candidate-dialog', className: 'modal tk-picker-modal resource-candidate-modal',
        role: 'dialog', 'aria-modal': 'true', 'aria-label': title,
        children: [jsx(Header, { title, close }), jsxs('div', { className: 'modal-form', children: [
          jsxs('div', { className: 'modal-form-body', children: [
            jsxs('div', { className: 'gkx-search-bar resource-picker-search-bar', children: [
              jsx(SearchField, { ariaLabel: '搜索资源', placeholder: searchPlaceholder, value: draftQuery,
                onChange: setDraftQuery, onEnter: applyQuery, onClear: resetQuery, clearable: true }),
              jsx(SearchActions, { query: jsx(Button, { onClick: applyQuery, children: '查询' }), reset: jsx(Button, { onClick: resetQuery, children: '重置' }) })
            ] }),
            jsx('div', { className: 'tk-picker-table-wrap', children: jsxs('table', {
              className: 'tk-picker-table', children: [
                jsx('thead', { children: jsxs('tr', { children: [
                  jsx('th', { scope: 'col', className: 'resource-picker-select-col', children: multiple ? jsx('input', {
                    type: 'checkbox', className: 'gkx-checkbox resource-picker-choice', 'aria-label': '全选当前页',
                    checked: allPageSelected, disabled: !availablePageKeys.length,
                    ref: node => { if (node) node.indeterminate = somePageSelected && !allPageSelected; },
                    onChange: event => togglePage(event.target.checked)
                  }) : '选择' }),
                  ...columns.map(column => jsx('th', { scope: 'col', style: column.width ? { width: column.width } : undefined, children: column.label }, column.key))
                ] }) }),
                jsx('tbody', { children: visibleRows.length ? visibleRows.map(row => {
                  const key = String(row[rowKey] ?? '');
                  const disabled = disabledSet.has(key);
                  return jsxs('tr', { className: `${selectedSet.has(key) ? 'selected' : ''}${disabled ? ' is-unavailable' : ''}`, onClick: () => toggleSelection(key, !selectedSet.has(key)), children: [
                    jsx('td', { className: 'resource-picker-select-col', children: jsx('input', {
                      type: multiple ? 'checkbox' : 'radio', name: radioName, className: 'gkx-checkbox resource-picker-choice', value: key,
                      checked: selectedSet.has(key), disabled, title: disabled ? '已在其他作者中' : undefined,
                      'aria-label': `选择${rowName(row)}`, onClick: event => event.stopPropagation(),
                      onChange: event => toggleSelection(key, event.target.checked)
                    }) }),
                    ...columns.map(column => jsx('td', { children: column.render ? column.render(row) : row[column.key] ?? '—' }, column.key))
                  ] }, key);
                }) : jsx('tr', { className: 'tk-picker-empty', children: jsx('td', { colSpan: columns.length + 1,
                  children: jsx('div', { className: 'resource-picker-empty', role: 'status', children: '暂无匹配结果，试试其他关键词' }) }) }) })
              ]
            }) }),
            jsx(Pagination, { total: filtered.length, currentPage, pageSize, onPageChange: setPage,
              onPageSizeChange: value => { setPageSize(value); setPage(1); } })
          ] }),
          jsxs('div', { className: 'modal-footer resource-picker-footer', children: [
            jsxs('div', { className: 'resource-picker-selection', 'aria-live': 'polite', children: [
              jsx('span', { children: multiple ? `已选 ${selected.length} 项` : selected.length ? `已选：${rowName(selected[0])}` : '请选择一项' }),
              selected.length > 0 && jsx('button', { type: 'button', className: 'resource-picker-clear-selection', onClick: () => setSelectedKeys([]), children: '清除选择' })
            ] }),
            jsxs('div', { className: 'resource-picker-footer-actions', children: [
              jsx(Button, { onClick: close, children: '取 消' }),
              jsx(Button, { variant: 'primary', disabled: !selected.length, onClick: () => { if (selected.length) { save(multiple ? selected : selected[0]); close(); } }, children: '确 定' })
            ] })
          ] })
        ] })]
      })
    }), document.body);
  };
}
