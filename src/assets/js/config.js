export const LINK_GROUPS = Object.freeze([
  {
    id: "ai-tools",
    label: "AI 工具",
    description: "只保存公开访问地址，不保存密钥、账号或私人文件路径。"
  },
  {
    id: "project-resources",
    label: "项目资料",
    description: "可指向云盘、文档或团队协作空间；请自行确认访问权限。"
  }
]);

export const SITE_CONFIG = Object.freeze({
  name: "庭野智作",
  englishName: "TINGYE STUDIO",
  tagline: "景观判断为骨，AI 工作流为器。",
  description:
    "面向庭院与景观设计的个人 AI 工作平台，以统一入口连接案例、作品、工具与可迭代的工作流。",
  version: "V1",
  updatedAt: "2026-10-18",
  storageKey: "tingye-portal.link-overrides.v1",
  links: Object.freeze([
    {
      id: "comfyui",
      group: "ai-tools",
      title: "ComfyUI",
      kicker: "LOCAL ENGINE",
      description: "本地图像生成与编辑工作台，用于概念推演、风格探索和图像变体。",
      actionLabel: "打开工作台",
      defaultUrl: ""
    },
    {
      id: "codex",
      group: "ai-tools",
      title: "Codex",
      kicker: "BUILD PARTNER",
      description: "用于脚本、站点和自动化工具开发的协作入口。",
      actionLabel: "打开 Codex",
      defaultUrl: "https://chatgpt.com/codex"
    },
    {
      id: "knowledge",
      group: "ai-tools",
      title: "个人知识库",
      kicker: "KNOWLEDGE BASE",
      description: "沉淀案例笔记、方法卡片、植物材料与设计判断。",
      actionLabel: "进入知识库",
      defaultUrl: ""
    },
    {
      id: "archive",
      group: "ai-tools",
      title: "项目档案",
      kicker: "PROJECT ARCHIVE",
      description: "集中访问在研项目、交付文件与版本记录。",
      actionLabel: "打开档案",
      defaultUrl: ""
    },
    {
      id: "project-files",
      group: "project-resources",
      title: "项目资料",
      kicker: "PROJECT FILES",
      description: "任务书、总图、模型、汇报文件与交付成果的统一入口。",
      actionLabel: "打开资料入口",
      defaultUrl: ""
    },
    {
      id: "site-research",
      group: "project-resources",
      title: "场地研究",
      kicker: "SITE RESEARCH",
      description: "场地影像、测绘资料、气候信息与背景研究。",
      actionLabel: "打开研究资料",
      defaultUrl: ""
    },
    {
      id: "case-reference",
      group: "project-resources",
      title: "案例参考",
      kicker: "REFERENCE LIBRARY",
      description: "按空间类型、材料与设计策略整理的参考案例。",
      actionLabel: "打开案例库",
      defaultUrl: ""
    }
  ])
});
