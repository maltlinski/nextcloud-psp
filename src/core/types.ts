/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Identifies a PSP file, independent of its file name. */
export const FORMAT_ID = 'nextcloud-psp'

/** The schema version this code writes. Older files are migrated on load. */
export const SCHEMA_VERSION = 1

/**
 * Kinds of nodes in a work breakdown structure.
 *
 * - `project`: the single root
 * - `subproject`: groups other nodes (Teilprojekt / Teilaufgabe)
 * - `workpackage`: the smallest planned unit (Arbeitspaket)
 * - `milestone`: a point in time; never has children
 */
export type NodeType = 'project' | 'subproject' | 'workpackage' | 'milestone'

export const NODE_TYPES: readonly NodeType[] = ['project', 'subproject', 'workpackage', 'milestone']

export type Status = 'open' | 'in_progress' | 'done'

export const STATUSES: readonly Status[] = ['open', 'in_progress', 'done']

/** A Nextcloud user. The display name is cached so files stay readable without the server. */
export interface Owner {
	uid: string
	displayName: string
}

export interface CostItem {
	category: string
	/** Amount in the document currency, never negative. */
	amount: number
	note?: string
}

/**
 * One node of the structure. The tree is stored flat: every node points to
 * its parent and has an `order` among its siblings.
 */
export interface PspNode {
	id: string
	parentId: string | null
	order: number
	type: NodeType
	title: string
	owner?: Owner | null
	goal?: string
	deliverable?: string
	description?: string
	/** Planned effort in person-days. */
	effortDays?: number | null
	costs?: CostItem[]
	/** ISO date `YYYY-MM-DD`. */
	start?: string | null
	/** ISO date `YYYY-MM-DD`, inclusive. */
	end?: string | null
	/** Milestones only: ISO date `YYYY-MM-DD`. */
	date?: string | null
	status?: Status
	/** Ids of nodes that must finish before this one starts. */
	dependsOn?: string[]
	/** Stored code, only used while `meta.frozenCodes` is true. */
	code?: string
}

export interface PspMeta {
	title: string
	/** ISO 4217 currency code, e.g. `EUR`. */
	currency: string
	codeScheme: 'numeric'
	/** When true, codes are read from `node.code` instead of being derived from positions. */
	frozenCodes: boolean
	costCategories: string[]
}

export interface PspDocument {
	format: typeof FORMAT_ID
	schemaVersion: number
	meta: PspMeta
	nodes: PspNode[]
}

/** Fields a caller may change through `updateNode`. Structure fields are changed by tree operations only. */
export type NodePatch = Partial<Omit<PspNode, 'id' | 'parentId' | 'order' | 'code'>>

export const DEFAULT_COST_CATEGORIES: readonly string[] = ['Personal', 'Sachkosten', 'Reise', 'Sonstiges']

export type PspErrorCode =
	| 'not_found'
	| 'root_immutable'
	| 'cycle'
	| 'invalid_parent'
	| 'invalid_position'
	| 'invalid_value'

/** Thrown when an operation would break the structure. */
export class PspError extends Error {

	readonly code: PspErrorCode

	constructor(code: PspErrorCode, message: string) {
		super(message)
		this.name = 'PspError'
		this.code = code
	}

}
