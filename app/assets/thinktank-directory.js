// Directory IDs identify separate lists; resourceKind selects their schema.
export const thinktankDirectoryTypes = Object.freeze([
  { value: 'paper', label: '论文' },
  { value: 'journal', label: '期刊' },
  { value: 'patent', label: '专利' },
]);

const legacyKinds = Object.freeze({
  'thinktank-policy': 'paper',
  'thinktank-future': 'journal',
  'thinktank-region': 'patent',
});

export function getThinktankDirectoryKind(directory) {
  if (!directory) return null;
  return thinktankDirectoryTypes.some(type => type.value === directory.resourceKind)
    ? directory.resourceKind : legacyKinds[directory.id] ?? null;
}

export function createThinktankDirectory({ id, name, kind }, definitions) {
  const definition = definitions.find(directory => getThinktankDirectoryKind(directory) === kind);
  if (!definition || !thinktankDirectoryTypes.some(type => type.value === kind)) return null;
  return {
    id, name, resourceKind: kind, count: 0,
    columns: [...definition.columns],
    requiredColumns: [...definition.requiredColumns],
    rows: [],
  };
}
