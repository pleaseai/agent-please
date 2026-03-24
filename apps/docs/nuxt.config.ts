export default defineNuxtConfig({
  extends: ['docus'],

  modules: [
    '@nuxt/eslint',
  ],

  site: {
    name: 'Agent Please',
  },

  nitro: {
    preset: 'cloudflare_pages',
  },

  eslint: {
    config: {
      standalone: false,
    },
  },

  compatibilityDate: '2026-03-24',
})
