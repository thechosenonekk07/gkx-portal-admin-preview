// Figma patent editor presentation; the enclosing editor owns draft and save.
export function createPatentEditor({ React, jsx, jsxs, Group, Row, Field, Card }) {
  const field = (label, props) => jsx(Field, { ...props, ariaLabel: label });
  const row = (label, children, props = {}) => jsx(Row, { label, ...props, children });
  const pair = children => jsxs('div', { className: 'resource-field-pair', children });
  const divider = () => jsx('div', { className: 'paper-section-divider', 'aria-hidden': true });
  const add = (label, onClick) => jsxs('button', {
    type: 'button', className: 'resource-add', onClick,
    children: [jsx('img', { src: new URL('./paper-editor/add.svg', import.meta.url).href, width: 16, height: 16, alt: '', 'aria-hidden': true }), label]
  });

  return function PatentEditorFields({ draft, onChange, countries, patentTypes, documentTypes, languages, notify }) {
    const [classSystems, setClassSystems] = React.useState(() => draft.classSystems ?? ['CPC', 'IPC', 'IPCR'].filter(system => draft[system.toLowerCase()]?.length));
    const radioName = React.useId();
    const change = key => value => onChange(key, value);
    const update = (key, index, changes) => onChange(key, draft[key].map((entry, i) => i === index ? { ...entry, ...changes } : entry));
    const remove = (key, index) => onChange(key, draft[key].filter((_, i) => i !== index));
    const parties = (key, title, nameLabel) => jsxs('div', { className: 'resource-party-group', children: [
      jsx('h4', { children: title }),
      ...draft[key].map((party, index) => jsxs(Card, {
        title: `${title} ${index + 1}`,
        onRemove: key === 'inventors' || draft[key].length > 1 ? () => remove(key, index) : undefined,
        children: [
          row(nameLabel, field(`${title} ${index + 1} 名称`, { value: party.name, placeholder: `请输入${nameLabel}`, onChange: value => update(key, index, { name: value }) }), { required: true }),
          row(`${title}ID`, field(`${title} ${index + 1} ID`, { value: party.id, placeholder: '选填，24 位数字或字母 a-f', onChange: value => update(key, index, { id: value }) }), { note: `（${party.id.length}/24）` })
        ]
      }, `${key}-${index}`)),
      add(`新增${title}`, () => onChange(key, [...draft[key], { name: '', id: '' }]))
    ] });

    return jsxs('div', { className: 'resource-editor-fields', children: [
      jsxs(Group, { title: '基础信息', children: [
        pair([
          row('国家地区代码', field('国家地区代码', { value: draft.country, options: countries, onChange: change('country') }), { required: true }),
          row('申请号', field('申请号', { value: draft.appNo, placeholder: '请输入申请号', onChange: change('appNo') }), { required: true })
        ]),
        pair([
          row('申请日', field('申请日', { type: 'date', value: draft.appDate, onChange: change('appDate') }), { required: true }),
          row('专利类型', jsxs('div', { className: 'resource-radio-group', role: 'radiogroup', 'aria-label': '专利类型', children: patentTypes.map(type => jsxs('label', {
            children: [jsx('input', { type: 'radio', name: radioName, value: type, checked: draft.patentType === type, onChange: () => onChange('patentType', type) }), type]
          }, type)) }), { required: true })
        ]),
        pair([
          row('公开号', field('公开号', { value: draft.pubNo, placeholder: '请输入公开号', onChange: change('pubNo') }), { required: true }),
          row('公开日', field('公开日', { type: 'date', value: draft.pubDate, onChange: change('pubDate') }))
        ]),
        pair([row('文献种类', field('文献种类', { value: draft.docType, options: documentTypes, onChange: change('docType') }))])
      ] }),
      divider(),
      jsxs(Group, { title: '标题与摘要信息', children: [
        ...draft.langs.map((entry, index) => jsxs(Card, {
          title: `语种 ${index + 1}`, headerAction: jsx('div', { className: 'resource-card-header-control', children: field(`语种 ${index + 1} 语言`, { value: entry.lang, options: languages, onChange: value => update('langs', index, { lang: value }) }) }), onRemove: draft.langs.length > 1 ? () => remove('langs', index) : undefined,
          children: [
            row(`${entry.lang}标题`, field(`语种 ${index + 1} 标题`, { value: entry.title, placeholder: '请输入标题', onChange: value => update('langs', index, { title: value }) }), { required: index === 0 }),
            row(`${entry.lang}摘要`, field(`语种 ${index + 1} 摘要`, { value: entry.abstract, textarea: true, placeholder: '请输入摘要', onChange: value => update('langs', index, { abstract: value }) }))
          ]
        }, index)),
        add('新增语言', () => onChange('langs', [...draft.langs, { lang: '中文', title: '', abstract: '' }]))
      ] }),
      divider(),
      jsxs(Group, { title: '扩展属性信息', children: [
        parties('applicants', '申请人', '申请人名称'),
        divider(),
        parties('assignees', '受让人', '受让人名称'),
        divider(),
        parties('inventors', '发明人', '发明人姓名')
      ] }),
      divider(),
      jsxs(Group, { title: '分类号', children: [
        jsxs('div', { className: 'resource-class-systems', children: [
          jsx('span', { children: '分类体系' }),
          ...['CPC', 'IPC', 'IPCR'].map(system => jsxs('label', { children: [
            jsx('input', { type: 'checkbox', className: 'gkx-checkbox', checked: classSystems.includes(system), onChange: event => { const next = event.target.checked ? [...classSystems, system] : classSystems.filter(value => value !== system); setClassSystems(next); onChange('classSystems', next); } }),
            system
          ] }, system)),
          jsxs('button', { type: 'button', className: 'resource-format-help', onClick: () => notify('标准格式示例：H04L 9/32；G06T 9/001', 'info'), children: [jsx('img', { src: new URL('./paper-editor/info.svg', import.meta.url).href, width: 16, height: 16, alt: '', 'aria-hidden': true }), '格式说明'] })
        ] }),
        ...classSystems.map(system => {
          const key = system.toLowerCase();
          return jsxs('div', { className: 'resource-class-block', children: [
            jsx('h4', { children: `${system} 分类号` }),
            ...draft[key].map((value, index) => jsxs('div', { className: 'resource-class-row', children: [
              field(`${system} 分类号 ${index + 1}`, { value, clearable: true, placeholder: `请输入 ${system} 分类号`, onChange: next => onChange(key, draft[key].map((item, i) => i === index ? next : item)) }),
              jsx('button', { type: 'button', className: 'resource-remove-icon', 'aria-label': `删除${system}分类号 ${index + 1}`, title: `删除${system}分类号`, onClick: () => onChange(key, draft[key].filter((_, i) => i !== index)) })
            ] }, index)),
            add(`添加${system}分类号`, () => onChange(key, [...draft[key], '']))
          ] }, key);
        })
      ] }),
      divider(),
      jsxs(Group, { title: 'PCT数据', children: [
        pair([
          row('国际申请号', field('国际申请号', { value: draft.pctAppNo, placeholder: '请输入国际申请号', onChange: change('pctAppNo') })),
          row('国际公布号', field('国际公布号', { value: draft.pctPubNo, placeholder: '请输入国际公布号', onChange: change('pctPubNo') }))
        ])
      ] }),
      divider(),
      jsxs(Group, { title: '优先权信息', children: [
        ...draft.priorities.map((priority, index) => jsxs(Card, {
          title: `优先权 ${index + 1}`, onRemove: () => remove('priorities', index), children: [
            row('国家/地区', field(`优先权 ${index + 1} 国家/地区`, { value: priority.country, options: countries, onChange: value => update('priorities', index, { country: value }) })),
            row('优先权号', field(`优先权 ${index + 1} 申请号`, { value: priority.no, placeholder: '请输入优先权号', onChange: value => update('priorities', index, { no: value }) })),
            row('优先权日', field(`优先权 ${index + 1} 日期`, { type: 'date', value: priority.date, onChange: value => update('priorities', index, { date: value }) }))
          ]
        }, index)),
        add('新增优先权', () => onChange('priorities', [...draft.priorities, { country: countries[0], no: '', date: '' }]))
      ] }),
      divider(),
      jsxs(Group, { title: '权利要求与说明书', children: [
        row('权利要求', field('权利要求', { value: draft.claims, textarea: true, placeholder: '请输入权利要求', onChange: change('claims') })),
        row('说明书', field('说明书', { value: draft.description, textarea: true, placeholder: '请输入说明书', onChange: change('description') }))
      ] })
    ] });
  };
}
