<!--
  - SPDX-FileCopyrightText: 2026 Malte Leonard Herz
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import { t } from '@nextcloud/l10n'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcContent from '@nextcloud/vue/components/NcContent'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import PspIcon from './components/PspIcon.vue'
</script>

<template>
	<NcContent app-name="psp">
		<NcAppContent :class="$style.content">
			<NcEmptyContent
				:name="t('psp', 'Projektstrukturplan')"
				:description="t('psp', 'Hier entsteht der Editor für Projektstrukturpläne. Bald könnt ihr .psp-Dateien direkt aus Files öffnen.')">
				<template #icon>
					<PspIcon />
				</template>
			</NcEmptyContent>
		</NcAppContent>
	</NcContent>
</template>

<style module>
.content {
	display: flex;
	align-items: center;
	justify-content: center;
}
</style>
