<!--
  - SPDX-FileCopyrightText: 2026 Malte Leonard Herz
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import { t } from '@nextcloud/l10n'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcDialog from '@nextcloud/vue/components/NcDialog'

export type ConflictChoice = 'reload' | 'overwrite' | 'later'

const emit = defineEmits<{
	(event: 'choose', choice: ConflictChoice): void
}>()
</script>

<template>
	<NcDialog :name="t('psp', 'Jemand anderes hat den Plan geändert')"
		size="normal"
		no-close>
		<p>
			{{ t('psp', 'Seit du den Plan geöffnet hast, wurde er von jemand anderem gespeichert. Deine Änderungen sind noch nicht gespeichert.') }}
		</p>
		<ul :class="$style.choices">
			<li><strong>{{ t('psp', 'Neu laden:') }}</strong> {{ t('psp', 'die gespeicherte Fassung öffnen. Deine Änderungen gehen verloren.') }}</li>
			<li><strong>{{ t('psp', 'Meine Fassung speichern:') }}</strong> {{ t('psp', 'die andere Fassung überschreiben. Sie bleibt in den Dateiversionen erhalten.') }}</li>
		</ul>
		<template #actions>
			<NcButton variant="tertiary" @click="emit('choose', 'later')">
				{{ t('psp', 'Später entscheiden') }}
			</NcButton>
			<NcButton variant="secondary" @click="emit('choose', 'overwrite')">
				{{ t('psp', 'Meine Fassung speichern') }}
			</NcButton>
			<NcButton variant="primary" @click="emit('choose', 'reload')">
				{{ t('psp', 'Neu laden') }}
			</NcButton>
		</template>
	</NcDialog>
</template>

<style module>
.choices {
	margin-block: 8px;
	padding-inline-start: 20px;
	list-style: disc;
}
</style>
