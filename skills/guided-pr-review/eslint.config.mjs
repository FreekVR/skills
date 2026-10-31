// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  // Leaving out a field with `{ field, ...rest }` is how the scripts copy an object without it.
  rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] },
})
