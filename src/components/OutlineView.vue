<!--
  - SPDX-FileCopyrightText: 2026 Malte Leonard Herz
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
<script setup lang="ts">
import type { EditorSession } from '../services/session'

import { mdiChevronDown, mdiChevronRight, mdiDelete, mdiFlagVariant, mdiFolderOutline, mdiPackageVariantClosed, mdiPlus, mdiSubdirectoryArrowRight } from '@mdi/js'
import { showError, showInfo } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { computed, nextTick, ref } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcActions from '@nextcloud/vue/components/NcActions'
import NcActionSeparator from '@nextcloud/vue/components/NcActionSeparator'
import NcIconSvgWrapper from '@nextcloud/vue/components/NcIconSvgWrapper'
import {
	addNode,
	addSiblingAfter,
	computeCodes,
	computeRollups,
	hasChildren,
	indentNode,
	moveDown,
	moveUp,
	type NodeType,
	outdentNode,
	type PspDocument,
	type PspNode,
	removeNode,
	updateNode,
	walk,
} from '../core'
import { formatDays, formatMoney, typeLabel } from '../labels'

const props = defineProps<{
	doc: PspDocument
	session: EditorSession
	canEdit: boolean
}>()

const collapsed = ref(new Set<string>())
const list = ref<HTMLElement>()

const codes = computed(() => computeCodes(props.doc))
const rollups = computed(() => computeRollups(props.doc))

interface Row {
	node: PspNode
	depth: number
	hasChildren: boolean
}

/** Visible rows in tree order; children of collapsed nodes are skipped. */
const rows = computed<Row[]>(() => {
	const depth = new Map<string, number>()
	const result: Row[] = []
	let hiddenBelow: number | null = null
	for (const node of walk(props.doc)) {
		const level = node.parentId === null ? 0 : (depth.get(node.parentId) as number) + 1
		depth.set(node.id, level)
		if (hiddenBelow !== null && level > hiddenBelow) {
			continue
		}
		hiddenBelow = collapsed.value.has(node.id) ? level : null
		result.push({ node, depth: level, hasChildren: hasChildren(props.doc, node.id) })
	}
	return result
})

const typeIcons: Record<NodeType, string> = {
	project: mdiFolderOutline,
	subproject: mdiFolderOutline,
	workpackage: mdiPackageVariantClosed,
	milestone: mdiFlagVariant,
}

function summary(node: PspNode): string {
	const rollup = rollups.value.get(node.id)
	if (!rollup) {
		return ''
	}
	const parts: string[] = []
	if (rollup.effortDays > 0) {
		parts.push(formatDays(rollup.effortDays))
	}
	if (rollup.costTotal > 0) {
		parts.push(formatMoney(rollup.costTotal, props.doc.meta.currency))
	}
	if (node.type === 'milestone' && node.date) {
		parts.push(node.date)
	}
	return parts.join(' · ')
}

function toggle(id: string) {
	const next = new Set(collapsed.value)
	if (next.has(id)) {
		next.delete(id)
	} else {
		next.add(id)
	}
	collapsed.value = next
}

async function focusRow(id: string, caretAtEnd = true) {
	await nextTick()
	const input = list.value?.querySelector<HTMLInputElement>(`input[data-node-id="${id}"]`)
	if (input) {
		input.focus()
		if (caretAtEnd) {
			input.setSelectionRange(input.value.length, input.value.length)
		}
	}
}

/** Runs a structure change and reports invalid operations instead of failing silently. */
function change(fn: (doc: PspDocument) => PspDocument, mergeKey?: string): boolean {
	try {
		return props.session.update(fn, mergeKey)
	} catch (error) {
		showError((error as Error).message)
		return false
	}
}

function setTitle(node: PspNode, event: Event) {
	const title = (event.target as HTMLInputElement).value
	change((doc) => updateNode(doc, node.id, { title }), `title:${node.id}`)
}

function addChild(node: PspNode) {
	let newId = ''
	if (change((doc) => {
		const result = addNode(doc, { parentId: node.id })
		newId = result.id
		return result.doc
	})) {
		const next = new Set(collapsed.value)
		next.delete(node.id)
		collapsed.value = next
		focusRow(newId)
	}
}

function addAfter(node: PspNode) {
	if (node.parentId === null) {
		let newId = ''
		if (change((doc) => {
			const result = addNode(doc, { parentId: node.id, index: 0 })
			newId = result.id
			return result.doc
		})) {
			focusRow(newId)
		}
		return
	}
	let newId = ''
	const type = node.type === 'milestone' ? 'workpackage' : node.type === 'subproject' ? 'subproject' : 'workpackage'
	if (change((doc) => {
		const result = addSiblingAfter(doc, node.id, { type })
		newId = result.id
		return result.doc
	})) {
		focusRow(newId)
	}
}

function setType(node: PspNode, type: Exclude<NodeType, 'project'>) {
	change((doc) => updateNode(doc, node.id, { type }))
}

function remove(node: PspNode, focusPrevious = false) {
	const index = rows.value.findIndex((row) => row.node.id === node.id)
	const previous = rows.value[index - 1]?.node.id
	if (change((doc) => removeNode(doc, node.id))) {
		showInfo(t('psp', '„{title}“ gelöscht. Rückgängig mit Strg+Z.', { title: node.title || t('psp', 'Ohne Titel') }))
		if (focusPrevious && previous) {
			focusRow(previous)
		}
	}
}

function onKeydown(event: KeyboardEvent, row: Row) {
	const { node } = row
	const index = rows.value.indexOf(row)
	if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
		event.preventDefault()
		addAfter(node)
	} else if (event.key === 'Tab') {
		event.preventDefault()
		if (change((doc) => (event.shiftKey ? outdentNode : indentNode)(doc, node.id))) {
			focusRow(node.id)
		}
	} else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
		event.preventDefault()
		if (change((doc) => (event.key === 'ArrowUp' ? moveUp : moveDown)(doc, node.id))) {
			focusRow(node.id)
		}
	} else if (event.key === 'ArrowUp' && index > 0) {
		event.preventDefault()
		focusRow(rows.value[index - 1].node.id)
	} else if (event.key === 'ArrowDown' && index < rows.value.length - 1) {
		event.preventDefault()
		focusRow(rows.value[index + 1].node.id)
	} else if (event.key === 'Backspace' && node.title === '' && node.parentId !== null && !row.hasChildren) {
		event.preventDefault()
		remove(node, true)
	}
}
</script>

<template>
	<ul ref="list" :class="$style.outline" role="tree">
		<li v-for="row in rows"
			:key="row.node.id"
			:class="[$style.row, row.node.type === 'milestone' && $style.milestone]"
			:style="{ '--depth': row.depth }"
			role="treeitem"
			:aria-level="row.depth + 1"
			:aria-expanded="row.hasChildren ? !collapsed.has(row.node.id) : undefined">
			<button v-if="row.hasChildren"
				type="button"
				:class="$style.toggle"
				:aria-label="collapsed.has(row.node.id) ? t('psp', 'Aufklappen') : t('psp', 'Zuklappen')"
				@click="toggle(row.node.id)">
				<NcIconSvgWrapper :path="collapsed.has(row.node.id) ? mdiChevronRight : mdiChevronDown" :size="20" />
			</button>
			<span v-else :class="$style.toggle" />
			<span :class="$style.code">{{ codes.get(row.node.id) }}</span>
			<NcIconSvgWrapper :class="$style.typeIcon"
				:path="typeIcons[row.node.type]"
				:name="typeLabel(row.node.type)"
				:size="18" />
			<input :class="[$style.title, row.depth === 0 && $style.rootTitle]"
				:data-node-id="row.node.id"
				:value="row.node.title"
				:readonly="!canEdit"
				:placeholder="typeLabel(row.node.type)"
				:aria-label="t('psp', 'Titel von {code}', { code: codes.get(row.node.id) ?? '' })"
				type="text"
				@input="setTitle(row.node, $event)"
				@keydown="onKeydown($event, row)">
			<span :class="$style.summary">{{ summary(row.node) }}</span>
			<NcActions v-if="canEdit" :class="$style.actions" :force-menu="true">
				<NcActionButton v-if="row.node.type !== 'milestone'" close-after-click @click="addChild(row.node)">
					<template #icon>
						<NcIconSvgWrapper :path="mdiSubdirectoryArrowRight" />
					</template>
					{{ t('psp', 'Unterpunkt hinzufügen') }}
				</NcActionButton>
				<NcActionButton close-after-click @click="addAfter(row.node)">
					<template #icon>
						<NcIconSvgWrapper :path="mdiPlus" />
					</template>
					{{ row.node.parentId === null ? t('psp', 'Ersten Unterpunkt einfügen') : t('psp', 'Darunter einfügen') }}
				</NcActionButton>
				<template v-if="row.node.parentId !== null">
					<NcActionSeparator />
					<NcActionButton v-if="row.node.type !== 'workpackage' && !row.hasChildren"
						close-after-click
						@click="setType(row.node, 'workpackage')">
						<template #icon>
							<NcIconSvgWrapper :path="mdiPackageVariantClosed" />
						</template>
						{{ t('psp', 'Als Arbeitspaket') }}
					</NcActionButton>
					<NcActionButton v-if="row.node.type !== 'subproject'"
						close-after-click
						@click="setType(row.node, 'subproject')">
						<template #icon>
							<NcIconSvgWrapper :path="mdiFolderOutline" />
						</template>
						{{ t('psp', 'Als Teilprojekt') }}
					</NcActionButton>
					<NcActionButton v-if="row.node.type !== 'milestone' && !row.hasChildren"
						close-after-click
						@click="setType(row.node, 'milestone')">
						<template #icon>
							<NcIconSvgWrapper :path="mdiFlagVariant" />
						</template>
						{{ t('psp', 'Als Meilenstein') }}
					</NcActionButton>
					<NcActionSeparator />
					<NcActionButton close-after-click @click="remove(row.node)">
						<template #icon>
							<NcIconSvgWrapper :path="mdiDelete" />
						</template>
						{{ row.hasChildren ? t('psp', 'Mit Unterpunkten löschen') : t('psp', 'Löschen') }}
					</NcActionButton>
				</template>
			</NcActions>
		</li>
	</ul>
</template>

<style module>
.outline {
	display: flex;
	flex-direction: column;
	gap: 2px;
	max-width: 960px;
}

.row {
	display: flex;
	align-items: center;
	gap: 6px;
	min-height: var(--default-clickable-area);
	padding-inline: calc(var(--depth) * 28px) 4px;
	border-radius: var(--border-radius-element, 8px);
}

.row:hover,
.row:focus-within {
	background-color: var(--color-background-hover);
}

/* Nextcloud styles every <button> and <input>; the selectors below are specific enough to win. */
.row .toggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 28px;
	width: 28px;
	min-width: 28px;
	height: 28px;
	min-height: 28px;
	padding: 0;
	margin: 0;
	border: none;
	border-radius: 50%;
	background-color: transparent;
	color: var(--color-text-maxcontrast);
	cursor: pointer;
}

.row button.toggle:hover,
.row button.toggle:focus-visible {
	background-color: var(--color-background-dark);
}

.code {
	flex: 0 0 auto;
	min-width: 3.5em;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.typeIcon {
	flex: 0 0 auto;
	color: var(--color-text-maxcontrast);
}

.milestone .typeIcon {
	color: var(--color-primary-element);
}

.row input.title {
	flex: 1 1 auto;
	min-width: 8em;
	height: calc(var(--default-clickable-area) - 6px);
	margin: 0;
	border-color: transparent;
	background-color: transparent;
}

.row input.title:hover,
.row input.title:focus {
	border-color: var(--color-border-maxcontrast);
	background-color: var(--color-main-background);
}

.rootTitle {
	font-weight: bold;
	font-size: 1.1em;
}

.summary {
	flex: 0 0 auto;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

.actions {
	flex: 0 0 auto;
}
</style>
