// Paper-only presentation. Draft data, reset, validation and saving remain in Ab.
export function createPaperEditor({ React, jsx, jsxs, Group, Row, Field, Card, AddButton }) {
  const field = (label, props) => jsx(Field, { ...props, ariaLabel: label });
  const row = (label, children, props = {}) => jsx(Row, { label, ...props, children });
  const pair = (children) => jsxs('div', { className: 'paper-field-pair', children });
  return function PaperEditorFields({ draft, onChange, onChoose, onClose, languages, activePicker }) {
    const change = (key) => (value) => onChange(key, value);
    const updateAuthor = (index, changes) => onChange('authors', draft.authors.map((author, i) => i === index ? { ...author, ...changes } : author));
    const bilingual = (label, zhKey, enKey, placeholders, textarea = false) => row(label, [
      field(`${label}（中文）`, { sub: '中文', value: draft[zhKey], placeholder: placeholders[0], textarea, onChange: change(zhKey) }),
      field(`${label}（英文）`, { sub: '英文', value: draft[enKey], placeholder: placeholders[1], textarea, onChange: change(enKey) })
    ], { required: true, note: '（中文或英文至少填写一项）' });
    const picker = (label, value, kind, index, key) => jsxs('span', {
      className: 'tk-pick-field', children: [
        field(`${label}（作者 ${index + 1}）`, { value, placeholder: '选填，24 位数字或字母 a-f', onChange: (next) => updateAuthor(index, { [key]: next }) }),
        jsx('button', { type: 'button', className: 'tk-icon-btn', 'aria-label': `选择${kind === 'scholar' ? '作者' : '机构'}（作者 ${index + 1}）`,
          'aria-haspopup': 'dialog', 'aria-controls': 'resource-candidate-dialog',
          'aria-expanded': activePicker?.kind === kind && activePicker?.authorIndex === index,
          title: kind === 'scholar' ? '从学者库选择' : '从机构库选择', onClick: () => onChoose({ kind, authorIndex: index }) })
      ]
    });
    const journal = (key) => (value) => onChange('journal', { ...draft.journal, [key]: value });
    const divider = () => jsx('div', { className: 'paper-section-divider', 'aria-hidden': true });

    return jsxs('div', { className: 'paper-editor-fields', children: [
      jsxs(Group, { title: '基础信息', children: [
        row('论文ID', field('论文ID', { value: draft.id, onChange: () => {}, disabled: true })),
        bilingual('论文标题', 'titleZh', 'titleEn', ['请输入中文标题', 'Please enter English title']),
        bilingual('关键词', 'keywordsZh', 'keywordsEn', ['多个关键词用逗号分隔', 'Separate keywords with commas']),
        bilingual('摘要', 'abstractZh', 'abstractEn', ['请输入中文摘要', 'Please enter English abstract'], true),
        pair([
          row('发表年份', field('发表年份', { value: draft.year, placeholder: '例如：2024', onChange: change('year') }), { required: true }),
          row('语言', field('语言', { value: draft.lang, options: languages, onChange: change('lang') }), { required: true })
        ])
      ] }),
      divider(),
      jsxs(Group, { title: '作者信息', children: [
        ...draft.authors.map((author, index) => jsxs(Card, {
          title: `作者 ${index + 1}`,
          onRemove: draft.authors.length > 1 ? () => onChange('authors', draft.authors.filter((_, i) => i !== index)) : undefined,
          children: [
            row('作者姓名', [
              field(`作者 ${index + 1} 中文姓名`, { sub: '中文姓名', value: author.nameZh, placeholder: '请输入中文姓名', onChange: (value) => updateAuthor(index, { nameZh: value }) }),
              field(`作者 ${index + 1} 英文姓名`, { sub: '英文姓名', value: author.nameEn, placeholder: 'Please enter English name', onChange: (value) => updateAuthor(index, { nameEn: value }) })
            ], { required: true, note: '（中文或英文至少填写一项）' }),
            row('作者机构', field(`作者 ${index + 1} 机构名称`, { value: author.org, placeholder: '请输入作者机构', onChange: (value) => updateAuthor(index, { org: value }) })),
            pair([
              row('作者ID', picker('作者ID', author.authorId, 'scholar', index, 'authorId'), { note: `（${author.authorId.length}/24）` }),
              row('机构ID', picker('机构ID', author.orgId, 'institution', index, 'orgId'), { note: `（${author.orgId.length}/24）` })
            ])
          ]
        }, index)),
        jsxs('button', { type: 'button', className: 'tk-add paper-add-author',
          onClick: () => onChange('authors', [...draft.authors, { nameZh: '', nameEn: '', authorId: '', org: '', orgId: '' }]),
          children: [jsx('img', { src: new URL('./paper-editor/add.svg', import.meta.url).href, width: 16, height: 16, alt: '', 'aria-hidden': true }), jsx('span', { children: '添加作者' })] })
      ] }),
      divider(),
      jsxs(Group, { title: '期刊信息', children: [
        pair([
          row('所属期刊', field('所属期刊', { value: draft.journal.name, placeholder: '请输入期刊名称', onChange: journal('name') })),
          row('ISSN', field('ISSN', { value: draft.journal.issn, placeholder: '如 1234-5678', onChange: journal('issn') }))
        ]),
        row('DOI', field('DOI', { value: draft.journal.doi, placeholder: '例如：10.1038/nature12345', onChange: journal('doi') })),
        pair([
          row('所在期刊起始页码', field('所在期刊起始页码', { type: 'number', value: draft.journal.pageStart, onChange: journal('pageStart') })),
          row('所在期刊截止页码', field('所在期刊截止页码', { type: 'number', value: draft.journal.pageEnd, onChange: journal('pageEnd') }))
        ])
      ] })
    ] });
  };
}

// One candidate fills the target card; additional candidates become author cards.
// Other cards and any hand-edited fields on the retained author stay intact.
export function applyAuthorSelection(authors, targetIndex, records, institutions) {
  const occupied = new Set(authors.filter((_, index) => index !== targetIndex).map(author => author.authorId).filter(Boolean));
  const seen = new Set(occupied);
  const choices = (Array.isArray(records) ? records : [records]).filter(record => {
    if (!record?.id || seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
  if (!choices.length) return authors;
  const fromRecord = record => ({
    nameZh: record.nameZh || '', nameEn: record.nameEn || '', authorId: record.id,
    org: record.org || '', orgId: record.orgId || institutions.find(institution => institution.name === record.org)?.id || ''
  });
  const current = authors[targetIndex];
  const first = choices[0].id === current?.authorId ? current : { ...current, ...fromRecord(choices[0]) };
  return [...authors.map((author, index) => index === targetIndex ? first : author), ...choices.slice(1).map(fromRecord)];
}
