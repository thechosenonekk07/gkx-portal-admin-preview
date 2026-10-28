// Journal-only presentation adapted from Figma 1187:48763 and 1187:49777.
// The shared modal owns validation, reset, saving and the focus lifecycle.
export function createJournalEditor({ React, jsx, jsxs, Group, Row, Field, Card, AddButton }) {
  const field = (ariaLabel, props) => jsx(Field, { clearable: true, ...props, ariaLabel });
  const row = (label, children, props = {}) => jsx(Row, { label, ...props, children });
  const pair = children => jsxs('div', { className: 'resource-field-pair', children });
  const divider = () => jsx('div', { className: 'paper-section-divider resource-editor-divider', 'aria-hidden': true });
  const addIcon = new URL('./paper-editor/add.svg', import.meta.url).href;
  const closeIcon = new URL('./paper-editor/tag-close.svg', import.meta.url).href;

  // Keep a legacy value visible, rather than replacing it with the placeholder.
  const selectOptions = (choices, current) => [
    { value: '', label: '请选择' },
    ...[...new Set([...choices, current].filter(value => value !== undefined && value !== null && String(value) !== '').map(String))]
      .map(value => ({ value, label: value })),
  ];

  return function JournalEditorFields({ draft, onChange, cycles = [], onClose, notify }) {
    const [aliasDraft, setAliasDraft] = React.useState('');
    const composing = React.useRef(false);
    const [coverFailed, setCoverFailed] = React.useState(false);
    React.useEffect(() => { setCoverFailed(false); }, [draft.coverUrl]);
    const aliases = draft.aliases ?? [];
    const categories = draft.categories ?? [];
    const change = key => value => onChange(key, value);
    const updateCategory = (index, changes) => onChange('categories', categories.map((category, i) => i === index ? { ...category, ...changes } : category));

    const addAlias = () => {
      const alias = aliasDraft.trim();
      if (!alias) return;
      if (aliases.includes(alias)) {
        setAliasDraft('');
        notify?.('该期刊别名已存在', 'info');
        return;
      }
      onChange('aliases', [...aliases, alias]);
      setAliasDraft('');
    };

    const addCategory = () => onChange('categories', [...categories, { source: '', category: '', zone: '' }]);
    const addCategoryButton = jsxs('button', {
      type: 'button', className: 'resource-add journal-add-category', 'aria-label': '添加期刊分类',
      onClick: addCategory,
      children: [jsx('img', { src: addIcon, width: 16, height: 16, alt: '', 'aria-hidden': true }), jsx('span', { children: '添加分类' })],
    });

    return jsxs('div', { className: 'resource-editor-fields journal-editor-fields', children: [
      jsxs(Group, { title: '基础信息', children: [
        row('期刊名称', pair([
          field('期刊中文名称', { sub: '中文名称', value: draft.nameZh ?? '', placeholder: '请输入中文名称', onChange: change('nameZh') }),
          field('期刊英文名称', { sub: '英文名称', value: draft.nameEn ?? '', placeholder: 'Please enter English name', onChange: change('nameEn') }),
        ]), { required: true, note: '（中文或英文至少填写一项）' }),
        pair([
          row('ISSN', field('期刊 ISSN', { value: draft.issn ?? '', placeholder: '例如：1234-5678', onChange: change('issn') }), { required: true }),
          row('EISSN', field('期刊 EISSN', { value: draft.eissn ?? '', placeholder: '请输入 EISSN', onChange: change('eissn') })),
        ]),
        pair([
          row('影响因子', field('期刊影响因子', { value: draft.impact ?? '', placeholder: '请输入影响因子', onChange: change('impact') })),
          row('官网链接', field('期刊官网链接', { value: draft.site ?? '', placeholder: '请输入官网链接', onChange: change('site') })),
        ]),
        pair([
          row('简称', field('期刊简称', { value: draft.shortName ?? '', placeholder: '请输入简称', onChange: change('shortName') })),
          row('封面图 URL', jsxs('div', { className: 'resource-editor-fields journal-cover-field', children: [
            field('期刊封面图 URL', { value: draft.coverUrl ?? '', placeholder: '请粘贴封面图 URL', onChange: change('coverUrl') }),
            draft.coverUrl && (coverFailed
              ? jsx('div', { className: 'journal-cover-preview-empty', role: 'status', children: '封面暂无法预览' })
              : jsx('img', { className: 'journal-cover-preview-image', src: draft.coverUrl, alt: '期刊封面预览', onError: () => setCoverFailed(true) })),
          ] })),
        ]),
      ] }),
      divider(),
      jsxs(Group, { title: '期刊分类', children: [
        ...categories.map((category, index) => jsx(Card, {
          title: `分类 ${index + 1}`,
          onRemove: () => onChange('categories', categories.filter((_, i) => i !== index)),
          children: jsxs('div', { className: 'resource-field-triple', children: [
            row('数据源', field(`期刊分类 ${index + 1} 数据源`, { value: category.source ?? '', placeholder: '请输入', onChange: value => updateCategory(index, { source: value }) })),
            row('期刊分类', field(`期刊分类 ${index + 1} 名称`, { value: category.category ?? '', placeholder: '请输入', onChange: value => updateCategory(index, { category: value }) })),
            row('分区', field(`期刊分类 ${index + 1} 分区`, { value: category.zone ?? '', placeholder: '请输入', onChange: value => updateCategory(index, { zone: value }) })),
          ] }),
        }, index)),
        addCategoryButton,
      ] }),
      divider(),
      jsxs(Group, { title: '期刊属性', children: [
        pair([
          row('开放获取', field('期刊开放获取', { value: draft.oa ?? '', options: selectOptions(['OA', '非OA'], draft.oa), onChange: change('oa') })),
          row('预警期刊', field('是否为预警期刊', { value: draft.warning ?? '', options: selectOptions(['是', '否'], draft.warning), onChange: change('warning') })),
        ]),
        row('出版周期', field('期刊出版周期', { value: draft.cycle ?? '', options: selectOptions(cycles, draft.cycle), onChange: change('cycle') })),
      ] }),
      divider(),
      jsx(Group, { title: '期刊别名', children: row('添加别名', jsxs('div', {
        className: 'resource-editor-fields journal-alias-editor',
        onCompositionStart: () => { composing.current = true; },
        onCompositionEnd: () => { composing.current = false; },
        onKeyDown: event => {
          if (event.key === 'Enter' && event.target.tagName === 'INPUT'
            && !composing.current && !event.isComposing && !event.nativeEvent?.isComposing && event.keyCode !== 229) {
            event.preventDefault();
            addAlias();
          }
        },
        children: [
          jsxs('div', { className: 'journal-alias-entry', children: [
            field('期刊别名', { value: aliasDraft, placeholder: '输入别名后按回车添加', onChange: setAliasDraft }),
            jsx('button', { type: 'button', className: 'resource-alias-add', onClick: addAlias, children: '添加' }),
          ] }),
          aliases.length > 0 && jsx('div', { className: 'journal-alias-tags', 'aria-label': '已添加的期刊别名', children: aliases.map(alias => jsxs('span', {
            className: 'resource-alias-tag', children: [jsx('span', { children: alias }), jsx('button', {
              type: 'button', 'aria-label': `删除期刊别名 ${alias}`, title: `删除期刊别名 ${alias}`,
              onClick: () => onChange('aliases', aliases.filter(value => value !== alias)),
              children: jsx('img', { src: closeIcon, width: 14, height: 14, alt: '', 'aria-hidden': true }),
            })],
          }, alias)) }),
        ],
      })) }),
    ] });
  };
}
