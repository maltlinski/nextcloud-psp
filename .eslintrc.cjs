module.exports = {
	extends: [
		'@nextcloud/eslint-config/vue3',
	],
	rules: {
		'jsdoc/require-jsdoc': 'off',
		// TypeScript types document parameters and return values.
		'jsdoc/require-param': 'off',
		'jsdoc/require-returns': 'off',
		'vue/first-attribute-linebreak': 'off',
	},
}
