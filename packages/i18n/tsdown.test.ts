import Yaml from 'unplugin-yaml/rolldown'

import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'locales/index': 'src/locales/index.ts',
  },
  plugins: [
    Yaml(),
  ],
})
