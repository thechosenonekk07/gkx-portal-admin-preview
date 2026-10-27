// 本模块仅提供本地选择弹窗的演示数据，未连接学者库、机构库或其他远程服务。
// 姓名、机构及其关联均为虚构场景；example.org 地址不代表真实机构绑定。
// logo 为本地文字标识，不依赖远程头像或图片。
const demoId = (group, index) => `${group}${index.toString(16).padStart(21, '0')}`;

export const demoInstitutions = [
  {
    id: demoId('de2', 1), name: '星河智能研究中心',
    desc: '围绕人工智能基础方法与可信系统开展交叉研究。',
    site: 'https://xinghe-ai.example.org', logo: '星', category: '科研机构', isDemo: true,
  },
  {
    id: demoId('de2', 2), name: '青岚先进材料实验室',
    desc: '以先进功能材料、材料计算与实验验证为主题。',
    site: 'https://qinglan-materials.example.org', logo: '青', category: '科研机构', isDemo: true,
  },
  {
    id: demoId('de2', 3), name: '云舟未来制造研究院',
    desc: '围绕智能制造、工业机器人与生产系统开展研究。',
    site: 'https://yunzhou-manufacturing.example.org', logo: '云', category: '研究机构', isDemo: true,
  },
  {
    id: demoId('de2', 4), name: '澄明生命科学中心',
    desc: '面向生物信息、生命健康与多学科协作开展研究。',
    site: 'https://chengming-life.example.org', logo: '澄', category: '科研机构', isDemo: true,
  },
  {
    id: demoId('de2', 5), name: '远山能源技术研究院',
    desc: '聚焦储能、能源系统与低碳技术研究。',
    site: 'https://yuanshan-energy.example.org', logo: '远', category: '研究机构', isDemo: true,
  },
  {
    id: demoId('de2', 6), name: '云帆数字治理智库',
    desc: '聚焦数字治理、公共政策与产业发展议题。',
    site: 'https://yunfan-policy.example.org', logo: '帆', category: '智库', isDemo: true,
  },
  {
    id: demoId('de2', 7), name: '新域交叉科学学院',
    desc: '推进跨学科人才培养、联合研究与开放交流。',
    site: 'https://xinyu-science.example.org', logo: '新', category: '高等院校', isDemo: true,
  },
  {
    id: demoId('de2', 8), name: '启辰产业创新实验室',
    desc: '开展产业技术验证与创新应用研究。',
    site: 'https://qichen-innovation.example.org', logo: '启', category: '企业研发', isDemo: true,
  },
];

export const demoScholars = [
  { id: demoId('de1', 1), nameZh: '林知远', nameEn: 'Zhiyuan Lin', gender: '男', org: demoInstitutions[0].name, country: '中国', lang: '中文、英文', isDemo: true },
  { id: demoId('de1', 2), nameZh: '沈星禾', nameEn: 'Xinghe Shen', gender: '女', org: demoInstitutions[0].name, country: '中国', lang: '中文、英文', isDemo: true },
  { id: demoId('de1', 3), nameZh: '唐沐川', nameEn: 'Muchuan Tang', gender: '男', org: demoInstitutions[1].name, country: '中国', lang: '中文、英文', isDemo: true },
  { id: demoId('de1', 4), nameZh: '陆清和', nameEn: 'Qinghe Lu', gender: '女', org: demoInstitutions[1].name, country: '中国', lang: '中文、英文', isDemo: true },
  { id: demoId('de1', 5), nameZh: '顾南舟', nameEn: 'Nanzhou Gu', gender: '男', org: demoInstitutions[2].name, country: '新加坡', lang: '中文、英文', isDemo: true },
  { id: demoId('de1', 6), nameZh: '许云舒', nameEn: 'Yunshu Xu', gender: '女', org: demoInstitutions[3].name, country: '中国', lang: '中文、英文', isDemo: true },
  { id: demoId('de1', 7), nameZh: '程若溪', nameEn: 'Ruoxi Cheng', gender: '女', org: demoInstitutions[4].name, country: '中国', lang: '中文、英文', isDemo: true },
  { id: demoId('de1', 8), nameZh: '宋予安', nameEn: 'Yuan Song', gender: '男', org: demoInstitutions[4].name, country: '德国', lang: '中文、英文、德文', isDemo: true },
  { id: demoId('de1', 9), nameZh: '苏景澄', nameEn: 'Jingcheng Su', gender: '男', org: demoInstitutions[5].name, country: '中国', lang: '中文、英文', isDemo: true },
  { id: demoId('de1', 10), nameZh: '叶书宁', nameEn: 'Shuning Ye', gender: '女', org: demoInstitutions[6].name, country: '中国', lang: '中文、英文', isDemo: true },
  { id: demoId('de1', 11), nameZh: '何明珂', nameEn: 'Mingke He', gender: '男', org: demoInstitutions[6].name, country: '美国', lang: '中文、英文', isDemo: true },
  { id: demoId('de1', 12), nameZh: '周望舒', nameEn: 'Wangshu Zhou', gender: '女', org: demoInstitutions[7].name, country: '中国', lang: '中文、英文', isDemo: true },
].map(row => ({ ...row, orgId: demoInstitutions.find(institution => institution.name === row.org)?.id ?? '' }));
