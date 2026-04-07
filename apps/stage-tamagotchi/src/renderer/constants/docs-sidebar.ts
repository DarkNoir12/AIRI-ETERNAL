export interface SidebarItem {
  text: string
  link?: string
  items?: SidebarItem[]
  icon?: string
}

export const DOCS_SECTIONS = [
  { id: 'overview', titleKey: 'settings.pages.docs.sections.overview', icon: 'i-lucide:rocket', defaultPath: 'overview/' },
  { id: 'manual', titleKey: 'settings.pages.docs.sections.manual', icon: 'i-lucide:book-open', defaultPath: 'manual/tamagotchi/' },
  { id: 'chronicles', titleKey: 'settings.pages.docs.sections.chronicles', icon: 'i-lucide:calendar-days', defaultPath: 'chronicles/integration-checklist' },
]

export const DOCS_SIDEBAR: Record<string, SidebarItem[]> = {
  overview: [
    {
      text: 'Overview',
      items: [
        { text: 'Introduction', link: 'overview/' },
        { text: 'Versions & Downloads', link: 'overview/versions' },
        { text: 'About AI VTuber', link: 'overview/about-ai-vtuber' },
        { text: 'About Neuro-sama', link: 'overview/about-neuro-sama' },
        { text: 'Other Similar Projects', link: 'overview/other-similar-projects' },
      ],
    },
  ],
  manual: [
    {
      text: 'User Guides',
      items: [
        {
          text: 'Quick Start',
          items: [
            { text: 'Desktop Version', link: 'manual/tamagotchi/' },
            { text: 'Web Version', link: 'manual/web/' },
          ],
        },
        {
          text: 'Configuration',
          items: [
            { text: 'Settings Overview', link: 'manual/config/settings-overview' },
            { text: 'Character & Card', link: 'manual/config/character-card' },
            { text: 'Intelligence & Modules', link: 'manual/config/modules' },
            { text: 'System & Data', link: 'manual/config/system-data' },
          ],
        },
      ],
    },
    {
      text: 'Deep Architecture',
      items: [
        { text: 'Architecture Overview', link: 'advanced/' },
        {
          text: 'Pipelines & Workflows',
          items: [
            { text: 'Interaction Pipelines', link: 'advanced/architecture/arch-chat-stt-proactivity-pipelines' },
            { text: 'ComfyUI Native Engine', link: 'advanced/architecture/arch-comfyui-native-api-engine' },
            { text: 'Gateway Security', link: 'advanced/architecture/arch-gateway-security-hardening' },
            { text: 'Memory System', link: 'advanced/architecture/arch-memory-system-overview' },
            { text: 'Live2D Optimization', link: 'advanced/architecture/arch-live2d-wasm-optimization' },
            { text: 'Long-term Memory Journal', link: 'advanced/architecture/arch-long-term-memory-journal' },
            { text: 'MCP Integration', link: 'advanced/architecture/arch-mcp-integration' },
            { text: 'Provider Store Structure', link: 'advanced/architecture/arch-provider-store-current-structure' },
            { text: 'Short-term Memory Summaries', link: 'advanced/architecture/arch-short-term-memory-summaries' },
          ],
        },
        {
          text: 'System Components',
          items: [
            { text: 'Minecraft Integration', link: 'advanced/architecture/design-minecraft' },
            { text: 'Discord Bot Integration', link: 'advanced/architecture/design-discord-bot-integration' },
            { text: 'Satori Protocol', link: 'advanced/architecture/design-satori' },
            { text: 'Telegram Bot', link: 'advanced/architecture/design-telegram' },
          ],
        },
      ],
    },
    {
      text: 'Development',
      items: [
        { text: 'Environment Setup', link: 'contributing/' },
        { text: 'Desktop Development', link: 'contributing/tamagotchi' },
        { text: 'Web Development', link: 'contributing/webui' },
        { text: 'Docs Development', link: 'contributing/docs' },
      ],
    },
  ],
  chronicles: [
    {
      text: 'Maintainer Status',
      items: [
        { text: 'Integration Checklist', link: 'chronicles/integration-checklist' },
      ],
    },
    {
      text: 'Project Evolution',
      items: [
        { text: 'Project Roadmap', link: 'chronicles/roadmap' },
        { text: 'Feature Report', link: 'chronicles/feature-report' },
      ],
    },
    {
      text: 'Version History',
      items: [
        { text: 'Initial Publish v0.1.0', link: 'chronicles/version-v0.1.0/' },
        { text: 'Before Story v0.0.1', link: 'chronicles/version-v0.0.1/' },
      ],
    },
  ],
}
