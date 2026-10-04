<!--
  - SPDX-FileCopyrightText: 2026 Malte Leonard Herz
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import type { ConflictChoice } from '../components/ConflictDialog.vue'

import { mdiAlertCircleOutline, mdiCheck, mdiCloudUploadOutline, mdiContentSaveOutline, mdiLockOutline, mdiRedo, mdiUndo } from '@mdi/js'
import { showError } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import NcAppContent from '@nextcloud/vue/components/NcAppContent'
import NcButton from '@nextcloud/vue/components/NcButton'
import NcEmptyContent from '@nextcloud/vue/components/NcEmptyContent'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import NcLoadingIcon from '@nextcloud/vue/components/NcLoadingIcon'
import NcNoteCard from '@nextcloud/vue/components/NcNoteCard'
import ConflictDialog from '../components/ConflictDialog.vue'
import OutlineView from '../components/OutlineView.vue'
import { computeRollups, getRoot } from '../core'
import { formatDays, formatMoney } from '../labels'
import { loadPlan, savePlan } from '../services/api'
import { EditorSession, OpenError, type SessionSnapshot } from '../services/session'

const props = defineProps<{
	fileId: number
}>()

const session = new EditorSession({ load: loadPlan, save: savePlan }, props.fileId)
const snapshot = shallowRef<SessionSnapshot | null>(null)
const loadError = ref<string | null>(null)
const conflictPostponed = ref(false)
const busy = ref(false)

session.subscribe((next) => {
	snapshot.value = next
	if (next.saveState !== 'conflict') {
		conflictPostponed.value = false
	}
})

const showConflict = computed(() => snapshot.value?.saveState === 'conflict' && !conflictPostponed.value)

const status = computed(() => {
	switch (snapshot.value?.saveState) {
	case 'saved': return { icon: mdiCheck, text: t('psp', 'Gespeichert') }
	case 'dirty': return { icon: mdiContentSaveOutline, text: t('psp', 'Ungespeicherte Änderungen') }
	case 'saving': return { icon: mdiCloudUploadOutline, text: t('psp', 'Speichert …') }
	case 'conflict': return { icon: mdiAlertCircleOutline, text: t('psp', 'Konflikt – nicht gespeichert') }
	case 'error': return { icon: mdiAlertCircleOutline, text: t('psp', 'Speichern fehlgeschlagen') }
	case 'readonly': return { icon: mdiLockOutline, text: t('psp', 'Nur lesen') }
	default: return null
	}
})

const totals = computed(() => {
	if (!snapshot.value) {
		return ''
	}
	const doc = snapshot.value.doc
	const root = computeRollups(doc).get(getRoot(doc).id)
	if (!root) {
		return ''
	}
	const parts = [t('psp', '{count} Arbeitspakete', { count: root.workpackageCount })]
	if (root.effortDays > 0) {
		parts.push(formatDays(root.effortDays))
	}
	if (root.costTotal > 0) {
		parts.push(formatMoney(root.costTotal, doc.meta.currency))
	}
	return parts.join(' · ')
})

const filesLink = computed(() => {
	if (!snapshot.value) {
		return ''
	}
	const dir = snapshot.value.path.replace(/\/[^/]*$/, '') || '/'
	return generateUrl('/apps/files/') + `?dir=${encodeURIComponent(dir)}&openfile=${props.fileId}`
})

async function run(action: () => Promise<void>) {
	busy.value = true
	try {
		await action()
	} catch (error) {
		showError((error as Error).message)
	} finally {
		busy.value = false
	}
}

function onConflict(choice: ConflictChoice) {
	if (choice === 'later') {
		conflictPostponed.value = true
	} else if (choice === 'reload') {
		run(() => session.reload())
	} else {
		run(() => session.overwrite())
	}
}

function onKeydown(event: KeyboardEvent) {
	if (!(event.ctrlKey || event.metaKey) || event.altKey) {
		return
	}
	const key = event.key.toLowerCase()
	if (key === 's') {
		event.preventDefault()
		session.save()
	} else if (key === 'z' && !event.shiftKey) {
		event.preventDefault()
		session.undo()
	} else if (key === 'y' || (key === 'z' && event.shiftKey)) {
		event.preventDefault()
		session.redo()
	}
}

function onBeforeUnload(event: BeforeUnloadEvent) {
	if (session.hasUnsavedChanges) {
		session.save()
		event.preventDefault()
	}
}

onMounted(async () => {
	window.addEventListener('beforeunload', onBeforeUnload)
	try {
		await session.open()
		document.title = `${snapshot.value?.name} – PSP`
	} catch (error) {
		loadError.value = error instanceof OpenError
			? t('psp', 'Die Datei ist kein gültiger Projektstrukturplan.')
			: (error as Error).message
	}
})

onBeforeUnmount(() => {
	window.removeEventListener('beforeunload', onBeforeUnload)
	session.dispose()
})
</script>

<template>
	<NcAppContent :class="$style.content" @keydown="onKeydown">
		<NcEmptyContent v-if="loadError"
			:name="t('psp', 'Plan kann nicht geöffnet werden')"
			:description="loadError">
			<template #icon>
				<NcIconSvgWrapper :path="mdiAlertCircleOutline" />
			</template>
		</NcEmptyContent>

		<NcEmptyContent v-else-if="!snapshot" :name="t('psp', 'Plan wird geladen …')">
			<template #icon>
				<NcLoadingIcon />
			</template>
		</NcEmptyContent>

		<template v-else>
			<header :class="$style.header">
				<div :class="$style.file">
					<h2 :class="$style.name">
						{{ snapshot.name }}
					</h2>
					<a :href="filesLink" :class="$style.path">{{ snapshot.path }}</a>
				</div>
				<span v-if="status"
					:class="[$style.status, ['conflict', 'error'].includes(snapshot.saveState) && $style.statusProblem]"
					role="status"
					data-test="save-status"
					:data-state="snapshot.saveState">
					<NcIconSvgWrapper :path="status.icon" :size="18" />
					{{ status.text }}
				</span>
				<span :class="$style.totals">{{ totals }}</span>
				<div v-if="snapshot.canEdit" :class="$style.buttons">
					<NcButton variant="tertiary"
						:aria-label="t('psp', 'Rückgängig')"
						:title="t('psp', 'Rückgängig (Strg+Z)')"
						:disabled="!snapshot.canUndo"
						@click="session.undo()">
						<template #icon>
							<NcIconSvgWrapper :path="mdiUndo" />
						</template>
					</NcButton>
					<NcButton variant="tertiary"
						:aria-label="t('psp', 'Wiederholen')"
						:title="t('psp', 'Wiederholen (Strg+Y)')"
						:disabled="!snapshot.canRedo"
						@click="session.redo()">
						<template #icon>
							<NcIconSvgWrapper :path="mdiRedo" />
						</template>
					</NcButton>
				</div>
			</header>

			<NcNoteCard v-if="snapshot.saveState === 'readonly'" type="info">
				{{ t('psp', 'Du kannst diesen Plan ansehen, aber nicht ändern.') }}
			</NcNoteCard>
			<NcNoteCard v-if="snapshot.saveState === 'conflict' && conflictPostponed" type="warning">
				<p>{{ t('psp', 'Der Plan wurde inzwischen von jemand anderem gespeichert. Deine Änderungen werden erst gespeichert, wenn du entscheidest.') }}</p>
				<NcButton :class="$style.inlineButton" @click="conflictPostponed = false">
					{{ t('psp', 'Jetzt entscheiden') }}
				</NcButton>
			</NcNoteCard>
			<NcNoteCard v-if="snapshot.saveState === 'error'" type="error">
				<p>{{ t('psp', 'Speichern fehlgeschlagen: {message}', { message: snapshot.error ?? '' }) }}</p>
				<NcButton :class="$style.inlineButton" @click="session.save()">
					{{ t('psp', 'Erneut versuchen') }}
				</NcButton>
			</NcNoteCard>
			<NcNoteCard v-if="snapshot.issues.length > 0" type="warning">
				{{ t('psp', 'Beim Öffnen wurden {count} ungültige Angaben ignoriert. Sie werden beim nächsten Speichern entfernt.', { count: snapshot.issues.length }) }}
			</NcNoteCard>

			<OutlineView :doc="snapshot.doc" :session="session" :can-edit="snapshot.canEdit" />

			<p v-if="snapshot.canEdit" :class="$style.hint">
				{{ t('psp', 'Enter: neuer Punkt · Tab / Umschalt+Tab: ein- und ausrücken · Alt+Pfeil: verschieben · Strg+Z: rückgängig') }}
			</p>

			<ConflictDialog v-if="showConflict && !busy" @choose="onConflict" />
		</template>
	</NcAppContent>
</template>

<style module>
.content {
	padding: 16px 24px 48px;
}

.header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 16px;
	margin-block-end: 16px;
	/* leave room for the app navigation toggle */
	padding-inline-start: 40px;
}

.file {
	display: flex;
	flex-direction: column;
	min-width: 0;
	margin-inline-end: auto;
}

.name {
	margin: 0;
	font-size: 1.4em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.path {
	color: var(--color-text-maxcontrast);
	font-size: 0.9em;
}

.status {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--color-text-maxcontrast);
}

.statusProblem {
	color: var(--color-error-text, var(--color-error));
}

.totals {
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.buttons {
	display: flex;
}

.inlineButton {
	margin-block-start: 8px;
}

.hint {
	max-width: 960px;
	margin-block-start: 16px;
	color: var(--color-text-maxcontrast);
	font-size: 0.9em;
}
</style>
