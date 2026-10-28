// Shared resource field definitions used by create, edit and detail forms.
// Include disciplines already present in the talent and report resource data.
export const subjectOptions = Object.freeze([
  '计算机科学', '人工智能', '数据科学', '数据挖掘', '自动化', '电子工程',
  '材料科学', '高分子化学', '能源工程', '航空航天', '生物医学工程',
  '生物医药', '基因工程', '神经科学', '物理学', '应用经济学',
]);

export function getResourceFieldOptions(field, configuredOptions = {}, currentValue) {
  const configured = configuredOptions[field];
  const options = field === '所属学科'
    ? [...subjectOptions, ...(configured ?? [])]
    : configured;
  if (!options) return undefined;
  const unique = [...new Set(options)];
  // Existing values must remain visible when a resource predates the enum.
  const current = String(currentValue ?? '');
  if (current.trim() && !unique.includes(current)) unique.push(current);
  return unique;
}
