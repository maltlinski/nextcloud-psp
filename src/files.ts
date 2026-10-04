/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*
 * Loaded into the Files app: opens .psp files in the editor and adds
 * "New work breakdown structure" to the "New" menu.
 */

import type { IFolder, INode } from '@nextcloud/files'

import { getCurrentUser } from '@nextcloud/auth'
import { showError } from '@nextcloud/dialogs'
import { addNewFileMenuEntry, DefaultType, Permission, registerFileAction } from '@nextcloud/files'
import { t } from '@nextcloud/l10n'
import { createDocument, serializeDocument } from './core'
import { createPlan, editorUrl } from './services/api'
import { planTitleFromName } from './services/session'

const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M8.5 2h7v5h-7zM11.25 7h1.5v2.5h-1.5zM3.25 9.5h17.5V11H3.25zM3.25 11h1.5v3h-1.5zM11.25 11h1.5v3h-1.5zM19.25 11h1.5v3h-1.5zM.5 14h7v5h-7zM8.5 14h7v5h-7zM16.5 14h7v5h-7z"/></svg>'

const isPlan = (node: INode) => node.basename.toLowerCase().endsWith('.psp')

registerFileAction({
	id: 'psp-open',
	displayName: () => t('psp', 'Im PSP-Editor öffnen'),
	iconSvgInline: () => ICON,
	enabled: ({ nodes }) => getCurrentUser() !== null
		&& nodes.length === 1
		&& isPlan(nodes[0])
		&& nodes[0].fileid !== undefined
		&& (nodes[0].permissions & Permission.READ) !== 0,
	exec: async ({ nodes }) => {
		window.location.href = editorUrl(nodes[0].fileid as number)
		return true
	},
	default: DefaultType.DEFAULT,
	order: -50,
})

addNewFileMenuEntry({
	id: 'psp-new',
	displayName: t('psp', 'Neuer Projektstrukturplan'),
	iconSvgInline: ICON,
	order: 50,
	enabled: (folder: IFolder) => getCurrentUser() !== null && (folder.permissions & Permission.CREATE) !== 0,
	async handler(folder: IFolder, content: INode[]) {
		// Load the dialog only when needed: this script runs on every Files page.
		const [{ spawnDialog }, { default: NewPlanDialog }] = await Promise.all([
			import('@nextcloud/vue/functions/dialog'),
			import('./components/NewPlanDialog.vue'),
		])
		const name = await spawnDialog(NewPlanDialog, { otherNames: content.map((node) => node.basename) })
		if (!name) {
			return
		}
		try {
			const document = serializeDocument(createDocument(planTitleFromName(name)))
			const created = await createPlan(folder.path, name, document)
			window.location.href = editorUrl(created.fileId)
		} catch (error) {
			showError(t('psp', 'Der Plan konnte nicht angelegt werden: {message}', { message: (error as Error).message }))
		}
	},
})
