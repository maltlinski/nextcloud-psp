<!--
  - SPDX-FileCopyrightText: 2026 Malte Leonard Herz
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'

import { getUniqueName, isFilenameValid } from '@nextcloud/files'
import { t } from '@nextcloud/l10n'
import { computed, nextTick, onMounted, ref } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcTextField from '@nextcloud/vue/components/NcTextField'

const props = withDefaults(defineProps<{
	/** Names already used in the target folder. */
	otherNames?: string[]
}>(), {
	otherNames: () => [],
})

const emit = defineEmits<{
	(event: 'close', name: string | null): void
}>()

const EXTENSION = '.psp'

const name = ref(getUniqueName(t('psp', 'Projektstrukturplan') + EXTENSION, props.otherNames))
const input = ref<ComponentPublicInstance>()

/** The name as it will be saved, always with the extension. */
const fileName = computed(() => {
	const trimmed = name.value.trim()
	return trimmed.toLowerCase().endsWith(EXTENSION) ? trimmed : trimmed + EXTENSION
})

const problem = computed(() => {
	if (name.value.trim() === '' || name.value.trim().toLowerCase() === EXTENSION) {
		return t('psp', 'Bitte gib einen Namen ein.')
	}
	if (!isFilenameValid(fileName.value)) {
		return t('psp', 'Dieser Name ist nicht erlaubt.')
	}
	if (props.otherNames.includes(fileName.value)) {
		return t('psp', 'Dieser Name ist bereits vergeben.')
	}
	return ''
})

function submit() {
	if (problem.value === '') {
		emit('close', fileName.value)
	}
}

onMounted(() => nextTick(() => {
	const element = input.value?.$el.querySelector('input') as HTMLInputElement | null
	element?.focus()
	element?.setSelectionRange(0, name.value.length - EXTENSION.length)
}))
</script>

<template>
	<NcDialog :name="t('psp', 'Neuer Projektstrukturplan')"
		close-on-click-outside
		@update:open="emit('close', null)">
		<form :class="$style.form" @submit.prevent="submit">
			<NcTextField ref="input"
				v-model="name"
				:label="t('psp', 'Dateiname')"
				:error="problem !== ''"
				:helper-text="problem" />
		</form>
		<template #actions>
			<NcButton variant="primary" :disabled="problem !== ''" @click="submit">
				{{ t('psp', 'Erstellen') }}
			</NcButton>
		</template>
	</NcDialog>
</template>

<style module>
.form {
	min-height: calc(2 * var(--default-clickable-area));
}
</style>
