/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*
 * Writing .psp files. The output is stable: nodes in tree order, keys in a
 * fixed order, two-space indentation. Saving an unchanged plan produces the
 * same bytes, so file versions in Nextcloud only differ where the plan did.
 */

import { walk } from './tree'
import type { PspDocument, PspNode } from './types'

const NODE_KEYS: (keyof PspNode)[] = [
	'id',
	'parentId',
	'order',
	'type',
	'code',
	'title',
	'owner',
	'goal',
	'deliverable',
	'description',
	'effortDays',
	'costs',
	'start',
	'end',
	'date',
	'status',
	'dependsOn',
]

function orderedNode(node: PspNode): Record<string, unknown> {
	const out: Record<string, unknown> = {}
	for (const key of NODE_KEYS) {
		if (node[key] !== undefined) {
			out[key] = node[key]
		}
	}
	return out
}

export function serializeDocument(doc: PspDocument): string {
	const ordered = {
		format: doc.format,
		schemaVersion: doc.schemaVersion,
		meta: {
			title: doc.meta.title,
			currency: doc.meta.currency,
			codeScheme: doc.meta.codeScheme,
			frozenCodes: doc.meta.frozenCodes,
			costCategories: doc.meta.costCategories,
		},
		nodes: walk(doc).map(orderedNode),
	}
	return JSON.stringify(ordered, null, 2) + '\n'
}
