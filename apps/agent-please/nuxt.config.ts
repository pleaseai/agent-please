import process from 'node:process'

export default defineNuxtConfig({
  modules: [
    '@nuxt/ui',
    '@nuxt/eslint',
    '@vueuse/nuxt',
    '@nuxt/test-utils/module',
    ['@codecov/nuxt-plugin', {
      enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
      bundleName: 'agent-please',
      uploadToken: process.env.CODECOV_TOKEN,
    }],
  ],

  eslint: {
    config: {
      standalone: false,
    },
  },

  future: {
    compatibilityVersion: 4,
  },

  css: ['~/assets/css/main.css'],

  nitro: {
    preset: 'bun',
  },

  runtimeConfig: {
    workflowPath: '',
  },

  vite: {
    server: {
      allowedHosts: (() => {
        const hosts = process.env.NUXT_VITE_ALLOWED_HOSTS
        if (!hosts)
          return []
        return hosts.split(',').map(h => h.trim()).filter(Boolean)
      })(),
    },
  },

  compatibilityDate: '2026-03-19',
})
