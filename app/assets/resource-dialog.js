// Shared keyboard and focus lifecycle for structured resource dialogs.
export function createResourceDialog({ React, jsxs }) {
  return function ResourceDialog({ close, children, ...props }) {
    const modalRef = React.useRef(null);
    const closeRef = React.useRef(close);
    closeRef.current = close;
    React.useEffect(() => {
      const modal = modalRef.current;
      const previousFocus = document.activeElement;
      const controls = () => Array.from(modal.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter(node => node.getClientRects().length && node.getAttribute('aria-hidden') !== 'true');
      const initial = modal.querySelector('input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), .gkx-select-trigger:not(:disabled)') || controls()[0];
      initial?.focus({ preventScroll: true });
      const onKeyDown = event => {
        if (event.isComposing || event.keyCode === 229) return;
        if (document.querySelector('.tk-picker-modal, .arco-date-picker-panel')) return;
        if (modal.querySelector('[role="combobox"][aria-expanded="true"]')) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeRef.current?.();
        }
        if (event.key !== 'Tab') return;
        const list = controls(), first = list[0], last = list.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first?.focus();
        }
      };
      modal.addEventListener('keydown', onKeyDown);
      return () => {
        modal.removeEventListener('keydown', onKeyDown);
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      };
    }, []);
    return jsxs('div', { ...props, ref: modalRef, children });
  };
}
