/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*
 * Reading .psp files.
 *
 * Problems with the structure (missing root, unknown parents, cycles) are
 * errors: the file cannot be opened safely. Problems with single fields
 * (a malformed date, a negative amount, a dependency on a deleted node) are
 * warnings: the field is dropped and the rest of the plan opens, so one bad
 * value never locks a team out of its plan.
 */

import {
	DEFAULT_COST_CATEGORIES,
	FORMAT_ID,
	NODE_TYPES,
	type NodeType,
	type CostItem,
	type PspDocument,
	type PspMeta,
	type PspNode,
	SCHEMA_VERSION,
	STATUSES,
	type Status,
} from './types'

export type IssueSeverity = 'error' | 'warning'

export interface Issue {
	severity: IssueSeverity
	code: string
	message: string
	nodeId?: string
}

export interface ParseResult {
	/** The usable document, or null when there is at least one error. */
	doc: PspDocument | null
	issues: Issue[]
}

type Json = Record<string, unknown>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** True for a real calendar date in the form YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
	if (typeof value !== 'string') {
		return false
	}
	const match = DATE_PATTERN.exec(value)
	if (!match) {
		return false
	}
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
	const date = new Date(Date.UTC(year, month - 1, day))
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * Upgrades older files step by step. Each entry turns version `n` into `n + 1`.
 * Version 1 is the first version, so there is nothing to migrate yet.
 */
const MIGRATIONS: Record<number, (raw: Json) => Json> = {}

function migrate(raw: Json, from: number, issues: Issue[]): Json | null {
	let current = raw
	for (let version = from; version < SCHEMA_VERSION; version++) {
		const step = MIGRATIONS[version]
		if (!step) {
			issues.push({ severity: 'error', code: 'unsupported_version', message: `No migration from schema version ${version}` })
			return null
		}
		current = step(current)
	}
	return current
}

function readMeta(raw: unknown, issues: Issue[]): PspMeta {
	const meta = isObject(raw) ? raw : {}
	if (!isObject(raw)) {
		issues.push({ severity: 'warning', code: 'meta_missing', message: 'Document settings are missing; defaults are used' })
	}
	const categories = Array.isArray(meta.costCategories) && meta.costCategories.every((item) => typeof item === 'string')
		? [...meta.costCategories as string[]]
		: [...DEFAULT_COST_CATEGORIES]
	return {
		title: typeof meta.title === 'string' ? meta.title : '',
		currency: typeof meta.currency === 'string' && meta.currency !== '' ? meta.currency : 'EUR',
		codeScheme: 'numeric',
		frozenCodes: meta.frozenCodes === true,
		costCategories: categories,
	}
}

function warnField(issues: Issue[], nodeId: string, field: string): void {
	issues.push({ severity: 'warning', code: 'invalid_field', message: `Field "${field}" was ignored because its value is invalid`, nodeId })
}

function readOptionalString(raw: Json, node: Json & Partial<PspNode>, field: 'goal' | 'deliverable' | 'description' | 'code', issues: Issue[], id: string): void {
	const value = raw[field]
	if (value === undefined) {
		return
	}
	if (typeof value === 'string') {
		node[field] = value
	} else {
		warnField(issues, id, field)
	}
}

function readDate(raw: Json, node: Json & Partial<PspNode>, field: 'start' | 'end' | 'date', issues: Issue[], id: string): void {
	const value = raw[field]
	if (value === undefined) {
		return
	}
	if (value === null || isIsoDate(value)) {
		node[field] = value
	} else {
		warnField(issues, id, field)
	}
}

function readCosts(value: unknown, issues: Issue[], id: string): CostItem[] | undefined {
	if (value === undefined) {
		return undefined
	}
	if (!Array.isArray(value)) {
		warnField(issues, id, 'costs')
		return undefined
	}
	const items: CostItem[] = []
	for (const item of value) {
		if (isObject(item) && typeof item.category === 'string' && typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount >= 0) {
			const cost: CostItem = { category: item.category, amount: item.amount }
			if (typeof item.note === 'string') {
				cost.note = item.note
			}
			items.push(cost)
		} else {
			warnField(issues, id, 'costs')
		}
	}
	return items
}

/** Reads one node. Returns null when its identity or place in the tree is unusable. */
function readNode(raw: unknown, index: number, issues: Issue[]): PspNode | null {
	if (!isObject(raw)) {
		issues.push({ severity: 'error', code: 'invalid_node', message: `Node #${index} is not an object` })
		return null
	}
	const id = raw.id
	if (typeof id !== 'string' || id === '') {
		issues.push({ severity: 'error', code: 'invalid_node', message: `Node #${index} has no id` })
		return null
	}
	if (raw.parentId !== null && typeof raw.parentId !== 'string') {
		issues.push({ severity: 'error', code: 'invalid_node', message: `Node ${id} has an invalid parent`, nodeId: id })
		return null
	}
	if (!NODE_TYPES.includes(raw.type as NodeType)) {
		issues.push({ severity: 'error', code: 'invalid_node', message: `Node ${id} has an unknown type`, nodeId: id })
		return null
	}
	const node: Json & PspNode = {
		id,
		parentId: raw.parentId,
		order: typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index,
		type: raw.type as NodeType,
		title: typeof raw.title === 'string' ? raw.title : '',
	}
	if (typeof raw.title !== 'string') {
		warnField(issues, id, 'title')
	}
	if (raw.owner !== undefined) {
		const owner = raw.owner
		if (owner === null) {
			node.owner = null
		} else if (isObject(owner) && typeof owner.uid === 'string' && typeof owner.displayName === 'string') {
			node.owner = { uid: owner.uid, displayName: owner.displayName }
		} else {
			warnField(issues, id, 'owner')
		}
	}
	for (const field of ['goal', 'deliverable', 'description', 'code'] as const) {
		readOptionalString(raw, node, field, issues, id)
	}
	if (raw.effortDays !== undefined) {
		const effort = raw.effortDays
		if (effort === null || (typeof effort === 'number' && Number.isFinite(effort) && effort >= 0)) {
			node.effortDays = effort
		} else {
			warnField(issues, id, 'effortDays')
		}
	}
	const costs = readCosts(raw.costs, issues, id)
	if (costs) {
		node.costs = costs
	}
	for (const field of ['start', 'end', 'date'] as const) {
		readDate(raw, node, field, issues, id)
	}
	if (node.start && node.end && node.start > node.end) {
		issues.push({ severity: 'warning', code: 'start_after_end', message: `Node ${id} ends before it starts`, nodeId: id })
	}
	if (raw.status !== undefined) {
		if (STATUSES.includes(raw.status as Status)) {
			node.status = raw.status as Status
		} else {
			warnField(issues, id, 'status')
		}
	}
	if (raw.dependsOn !== undefined) {
		if (Array.isArray(raw.dependsOn) && raw.dependsOn.every((item) => typeof item === 'string')) {
			node.dependsOn = [...new Set(raw.dependsOn as string[])]
		} else {
			warnField(issues, id, 'dependsOn')
		}
	}
	return node
}

/** Structural checks shared by parsing and by `checkDocument`. Appends issues; returns false on errors. */
function checkStructure(nodes: PspNode[], issues: Issue[]): boolean {
	let ok = true
	const error = (code: string, message: string, nodeId?: string) => {
		ok = false
		issues.push({ severity: 'error', code, message, nodeId })
	}
	const byId = new Map<string, PspNode>()
	for (const node of nodes) {
		if (byId.has(node.id)) {
			error('duplicate_id', `Id ${node.id} is used more than once`, node.id)
		}
		byId.set(node.id, node)
	}
	const roots = nodes.filter((node) => node.parentId === null)
	if (roots.length !== 1) {
		error('root_count', `Expected exactly one root, found ${roots.length}`)
	} else if (roots[0].type !== 'project') {
		error('root_type', 'The root must be the project', roots[0].id)
	}
	for (const node of nodes) {
		if (node.parentId === null) {
			continue
		}
		if (node.type === 'project') {
			error('project_not_root', `Node ${node.id} is a project but not the root`, node.id)
		}
		const parent = byId.get(node.parentId)
		if (!parent) {
			error('orphan', `Node ${node.id} points to a missing parent`, node.id)
		} else if (parent.type === 'milestone') {
			error('milestone_children', `Milestone ${parent.id} has children`, parent.id)
		}
	}
	if (!ok) {
		return false
	}
	// Every node must reach the root without visiting a node twice.
	for (const node of nodes) {
		const seen = new Set<string>()
		let current: PspNode | undefined = node
		while (current && current.parentId !== null) {
			if (seen.has(current.id)) {
				error('cycle', `Node ${node.id} is part of a cycle`, node.id)
				break
			}
			seen.add(current.id)
			current = byId.get(current.parentId)
		}
	}
	return ok
}

/** Drops dependencies on unknown nodes and reports dependency cycles. */
function checkDependencies(nodes: PspNode[], issues: Issue[]): PspNode[] {
	const ids = new Set(nodes.map((node) => node.id))
	const cleaned = nodes.map((node) => {
		if (!node.dependsOn) {
			return node
		}
		const valid = node.dependsOn.filter((dependency) => ids.has(dependency) && dependency !== node.id)
		if (valid.length !== node.dependsOn.length) {
			issues.push({ severity: 'warning', code: 'invalid_dependency', message: `Node ${node.id} depended on a missing node or itself`, nodeId: node.id })
			return { ...node, dependsOn: valid }
		}
		return node
	})
	const graph = new Map(cleaned.map((node) => [node.id, node.dependsOn ?? []]))
	const state = new Map<string, 'visiting' | 'done'>()
	const reported = new Set<string>()
	const visit = (id: string) => {
		state.set(id, 'visiting')
		for (const next of graph.get(id) ?? []) {
			if (state.get(next) === 'visiting') {
				if (!reported.has(next)) {
					reported.add(next)
					issues.push({ severity: 'warning', code: 'dependency_cycle', message: `Dependencies around node ${next} form a cycle`, nodeId: next })
				}
			} else if (!state.has(next)) {
				visit(next)
			}
		}
		state.set(id, 'done')
	}
	for (const id of graph.keys()) {
		if (!state.has(id)) {
			visit(id)
		}
	}
	return cleaned
}

/** Renumbers sibling orders to 0..n-1, keeping their relative order. */
function normalizeOrders(nodes: PspNode[]): PspNode[] {
	const groups = new Map<string | null, PspNode[]>()
	for (const node of nodes) {
		const group = groups.get(node.parentId)
		if (group) {
			group.push(node)
		} else {
			groups.set(node.parentId, [node])
		}
	}
	const orders = new Map<string, number>()
	for (const group of groups.values()) {
		group
			.slice()
			.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
			.forEach((node, index) => orders.set(node.id, index))
	}
	return nodes.map((node) => (node.order === orders.get(node.id) ? node : { ...node, order: orders.get(node.id) as number }))
}

/** Reads a .psp file (text or already parsed JSON). */
export function parseDocument(input: string | unknown): ParseResult {
	const issues: Issue[] = []
	let raw: unknown = input
	if (typeof input === 'string') {
		try {
			raw = JSON.parse(input)
		} catch (e) {
			return { doc: null, issues: [{ severity: 'error', code: 'invalid_json', message: `The file is not valid JSON: ${(e as Error).message}` }] }
		}
	}
	if (!isObject(raw)) {
		return { doc: null, issues: [{ severity: 'error', code: 'invalid_document', message: 'The file does not contain a PSP document' }] }
	}
	if (raw.format !== FORMAT_ID) {
		return { doc: null, issues: [{ severity: 'error', code: 'wrong_format', message: 'The file is not a PSP document' }] }
	}
	const version = raw.schemaVersion
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		return { doc: null, issues: [{ severity: 'error', code: 'invalid_version', message: 'The schema version is missing or invalid' }] }
	}
	if (version > SCHEMA_VERSION) {
		return { doc: null, issues: [{ severity: 'error', code: 'unsupported_version', message: `The file was written by a newer version of the app (schema ${version})` }] }
	}
	const migrated = migrate(raw, version, issues)
	if (!migrated) {
		return { doc: null, issues }
	}
	if (!Array.isArray(migrated.nodes)) {
		return { doc: null, issues: [...issues, { severity: 'error', code: 'invalid_document', message: 'The document has no node list' }] }
	}
	const meta = readMeta(migrated.meta, issues)
	const nodes: PspNode[] = []
	let readable = true
	migrated.nodes.forEach((rawNode: unknown, index: number) => {
		const node = readNode(rawNode, index, issues)
		if (node) {
			nodes.push(node)
		} else {
			readable = false
		}
	})
	if (!readable || !checkStructure(nodes, issues)) {
		return { doc: null, issues }
	}
	const finalNodes = normalizeOrders(checkDependencies(nodes, issues))
	return {
		doc: { format: FORMAT_ID, schemaVersion: SCHEMA_VERSION, meta, nodes: finalNodes },
		issues,
	}
}

/** Checks an in-memory document; useful in tests and before saving. */
export function checkDocument(doc: PspDocument): Issue[] {
	const issues: Issue[] = []
	if (checkStructure(doc.nodes, issues)) {
		checkDependencies(doc.nodes, issues)
	}
	return issues
}
