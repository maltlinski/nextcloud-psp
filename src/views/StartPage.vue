<!--
  - SPDX-FileCopyrightText: 2026 Malte Leonard Herz
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import type { INode } from '@nextcloud/files'

import { mdiFolderOpenOutline, mdiPlus } from '@mdi/js'
import { getFilePickerBuilder, showError } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { ref } from 'vue'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import { spawnDialog } from '@nextcloud/vue/functions/dialog'
import NewPlanDialog from '../components/NewPlanDialog.vue'
import PspIcon from '../components/PspIcon.vue'
import { createDocument, serializeDocument } from '../core'
import { createPlan, editorUrl } from '../services/api'
import { planTitleFromName } from '../services/session'

const busy = ref(false)

async function createNew() {
	const name = await spawnDialog(NewPlanDialog, {})
	if (!name) {
		return
	}
	busy.value = true
	try {
		const content = serializeDocument(createDocument(planTitleFromName(name)))
		const created = await createPlan('/', name, content)
		window.location.href = editorUrl(created.fileId)
	} catch (error) {
		showError((error as Error).message)
		busy.value = false
	}
}

async function open() {
	const picker = getFilePickerBuilder(t('psp', 'Projektstrukturplan öffnen'))
		.setMultiSelect(false)
		.allowDirectories(false)
		.setFilter((node: INode) => node.type === 'folder' || node.basename.toLowerCase().endsWith('.psp'))
		.addButton({
			label: t('psp', 'Öffnen'),
			variant: 'primary',
			callback: (nodes: INode[]) => {
				if (nodes[0]?.fileid) {
					window.location.href = editorUrl(nodes[0].fileid)
				}
			},
		})
		.build()
	try {
		await picker.pick()
	} catch {
		// closed without choosing
	}
}
</script>

<template>
	<NcAppContent :class="$style.content">
		<NcEmptyContent :name="t('psp', 'Projektstrukturplan')"
			:description="t('psp', 'Lege einen neuen Plan an oder öffne eine .psp-Datei. Pläne kannst du auch in Files über „Neu“ anlegen.')">
			<template #icon>
				<PspIcon />
			</template>
			<template #action>
				<div :class="$style.actions">
					<NcButton variant="primary" :disabled="busy" @click="createNew">
						<template #icon>
							<NcIconSvgWrapper :path="mdiPlus" />
						</template>
						{{ t('psp', 'Neuer Projektstrukturplan') }}
					</NcButton>
					<NcButton :disabled="busy" @click="open">
						<template #icon>
							<NcIconSvgWrapper :path="mdiFolderOpenOutline" />
						</template>
						{{ t('psp', 'Plan öffnen') }}
					</NcButton>
				</div>
			</template>
		</NcEmptyContent>
	</NcAppContent>
</template>

<style module>
.content {
	display: flex;
	align-items: center;
	justify-content: center;
}

.actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
}
</style>
