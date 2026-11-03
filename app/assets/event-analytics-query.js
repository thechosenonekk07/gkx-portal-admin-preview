// A single query owns one loading → success/error transition. The view keeps
// the last successful result until the whole next result is ready.
const cancelled = () => new DOMException('查询已取消', 'AbortError');
const throwIfAborted = signal => { if (signal?.aborted) throw cancelled(); };

function freezeSelection(query) {
  const snapshot = structuredClone(query);
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  return freeze(snapshot);
}

export function createAnalyticsQueryController({ load, onState = () => {} }) {
  if (typeof load !== 'function' || typeof onState !== 'function') throw new TypeError('查询处理器配置无效');
  let active = null;
  let disposed = false;

  function run(query) {
    if (disposed || active) return false;
    const operation = { query: freezeSelection(query), abort: new AbortController() };
    active = operation;
    try {
      onState({ status: 'loading', query: operation.query });
    } catch (error) {
      active = null;
      operation.abort.abort();
      throw error;
    }
    Promise.resolve().then(() => {
      throwIfAborted(operation.abort.signal);
      return load(operation.query, { signal: operation.abort.signal });
    }).then(result => {
      if (disposed || active !== operation || operation.abort.signal.aborted) return;
      active = null;
      onState({ status: 'success', query: operation.query, result });
    }, reason => {
      if (disposed || active !== operation || operation.abort.signal.aborted) return;
      active = null;
      const error = reason instanceof Error ? reason : new Error(String(reason || '统计查询失败'));
      onState({ status: 'error', query: operation.query, error });
    });
    return true;
  }

  return Object.freeze({
    run,
    isLoading: () => active !== null,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      const operation = active;
      active = null;
      operation?.abort.abort();
    },
  });
}

function waitForQuery(delayMs, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(cancelled());
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function abortable(value, signal) {
  if (!signal) return Promise.resolve(value);
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(cancelled()); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(value).then(result => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(cancelled()); else resolve(result);
    }, error => {
      signal.removeEventListener('abort', abort);
      reject(error);
    });
    if (signal.aborted) abort();
  });
}

// The short delay makes the prototype's request state reviewable. Replace this
// adapter with a real statistics API without changing the controller or view.
export function createPreviewAnalyticsLoader({ compute, delayMs = 450, now = () => new Date() }) {
  if (typeof compute !== 'function' || typeof now !== 'function') throw new TypeError('统计计算配置无效');
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError('查询延时无效');
  return async (query, { signal } = {}) => {
    await waitForQuery(delayMs, signal);
    throwIfAborted(signal);
    const result = await abortable(compute(query, { signal }), signal);
    throwIfAborted(signal);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('统计计算未返回有效结果');
    const updatedAt = new Date(now()).toISOString();
    throwIfAborted(signal);
    return { ...result, updatedAt };
  };
}
