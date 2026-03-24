export default defineAppConfig({
  docus: {
    locale: 'en',
  },
  seo: {
    title: 'Agent Please',
    description: 'Turn issue tracker tasks into autonomous Claude Code agent sessions.',
  },
  header: {
    title: 'Agent Please',
  },
  navigation: {
    sub: 'header',
  },
  socials: {
    github: 'https://github.com/pleaseai/agent-please',
  },
  toc: {
    title: 'On this page',
  },
  github: {
    url: 'https://github.com/pleaseai/agent-please',
    branch: 'main',
    rootDir: 'apps/docs',
  },
})
