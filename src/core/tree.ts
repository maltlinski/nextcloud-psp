/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*
 * Pure tree operations on a PSP document. Every function returns a new
 * document and leaves its input untouched, so any earlier state can be kept
 * for undo.
 *
 * Operations that are called with impossible arguments (unknown id, cycle)
 * throw a PspError. Keyboard-style operations (indent, outdent, move up/down)
 * return the unchanged document when there is nothing to do, so callers can
 * compare by reference.
 */

import {
	DEFAULT_COST_CATEGORIES,
	FORMAT_ID,
	type NodePatch,
	type NodeType,
	PspError,
	type PspDocument,
	type PspNode,
	SCHEMA_VERSION,
} from './types'

export type IdGenerator = () => string

export const defaultIdGenerator: IdGenerator = () => globalThis.crypto.randomUUID()

export interface CreateDocumentOptions {
	idGenerator?: IdGenerator
	currency?: string
	costCategories?: string[]
}

export function createDocument(title: string, options: CreateDocumentOptions = {}): PspDocument {
	const idGenerator = options.idGenerator ?? defaultIdGenerator
	return {
		format: FORMAT_ID,
		schemaVersion: SCHEMA_VERSION,
		meta: {
			title,
			currency: options.currency ?? 'EUR',
			codeScheme: 'numeric',
			frozenCodes: false,
			costCategories: [...(options.costCategories ?? DEFAULT_COST_CATEGORIES)],
		},
		nodes: [{ id: idGenerator(), parentId: null, order: 0, type: 'project', title }],
	}
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function findNode(doc: PspDocument, id: string): PspNode | undefined {
	return doc.nodes.find((node) => node.id === id)
}

export function getNode(doc: PspDocument, id: string): PspNode {
	const node = findNode(doc, id)
	if (!node) {
		throw new PspError('not_found', `Node ${id} does not exist`)
	}
	return node
}

export function getRoot(doc: PspDocument): PspNode {
	const root = doc.nodes.find((node) => node.parentId === null)
	if (!root) {
		throw new PspError('not_found', 'Document has no root node')
	}
	return root
}

function byOrder(a: PspNode, b: PspNode): number {
	return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** Children of a node, sorted by their order. */
export function getChildren(doc: PspDocument, parentId: string): PspNode[] {
	return doc.nodes.filter((node) => node.parentId === parentId).sort(byOrder)
}

export function hasChildren(doc: PspDocument, id: string): boolean {
	return doc.nodes.some((node) => node.parentId === id)
}

export function getParent(doc: PspDocument, id: string): PspNode | null {
	const node = getNode(doc, id)
	return node.parentId === null ? null : getNode(doc, node.parentId)
}

/** Ancestors of a node, nearest first, root last. */
export function getAncestors(doc: PspDocument, id: string): PspNode[] {
	const ancestors: PspNode[] = []
	let current = getNode(doc, id)
	while (current.parentId !== null) {
		current = getNode(doc, current.parentId)
		ancestors.push(current)
	}
	return ancestors
}

/** Depth below the root; the root has depth 0. */
export function getDepth(doc: PspDocument, id: string): number {
	return getAncestors(doc, id).length
}

/** True when `ancestorId` is a strict ancestor of `id`. */
export function isAncestor(doc: PspDocument, ancestorId: string, id: string): boolean {
	return getAncestors(doc, id).some((node) => node.id === ancestorId)
}

/** All nodes in depth-first pre-order, starting with the root. */
export function walk(doc: PspDocument, startId?: string): PspNode[] {
	const children = childrenIndex(doc)
	const result: PspNode[] = []
	const visit = (node: PspNode) => {
		result.push(node)
		for (const child of children.get(node.id) ?? []) {
			visit(child)
		}
	}
	visit(startId === undefined ? getRoot(doc) : getNode(doc, startId))
	return result
}

/** Ids of a node and all its descendants. */
export function getSubtreeIds(doc: PspDocument, id: string): Set<string> {
	return new Set(walk(doc, id).map((node) => node.id))
}

/** Map from parent id to its children, each list sorted by order. */
export function childrenIndex(doc: PspDocument): Map<string, PspNode[]> {
	const index = new Map<string, PspNode[]>()
	for (const node of doc.nodes) {
		if (node.parentId === null) {
			continue
		}
		const list = index.get(node.parentId)
		if (list) {
			list.push(node)
		} else {
			index.set(node.parentId, [node])
		}
	}
	for (const list of index.values()) {
		list.sort(byOrder)
	}
	return index
}

// ---------------------------------------------------------------------------
// Helpers for building new documents
// ---------------------------------------------------------------------------

/**
 * Returns a copy of the document where the given parents' children are
 * renumbered 0..n-1 following `orderedIds` (or their current order).
 */
function withSiblingOrder(nodes: PspNode[], parentId: string, orderedIds: string[]): PspNode[] {
	const position = new Map(orderedIds.map((id, index) => [id, index]))
	return nodes.map((node) => {
		if (node.parentId !== parentId) {
			return node
		}
		const order = position.get(node.id)
		if (order === undefined) {
			throw new PspError('invalid_position', `Node ${node.id} is missing from the new sibling order`)
		}
		return node.order === order ? node : { ...node, order }
	})
}

function siblingIds(doc: PspDocument, parentId: string): string[] {
	return getChildren(doc, parentId).map((node) => node.id)
}

function assertCanHaveChildren(parent: PspNode): void {
	if (parent.type === 'milestone') {
		throw new PspError('invalid_parent', 'A milestone cannot have children')
	}
}

/** A work package that receives children becomes a sub-project. */
function promoteParent(nodes: PspNode[], parentId: string): PspNode[] {
	return nodes.map((node) => (node.id === parentId && node.type === 'workpackage' ? { ...node, type: 'subproject' } : node))
}

function assertIndex(index: number, length: number): void {
	if (!Number.isInteger(index) || index < 0 || index > length) {
		throw new PspError('invalid_position', `Index ${index} is outside 0..${length}`)
	}
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export interface AddNodeInput {
	parentId: string
	type?: Exclude<NodeType, 'project'>
	title?: string
	/** Position among the new siblings; defaults to the end. */
	index?: number
	fields?: NodePatch
}

export interface AddNodeResult {
	doc: PspDocument
	id: string
}

export function addNode(doc: PspDocument, input: AddNodeInput, idGenerator: IdGenerator = defaultIdGenerator): AddNodeResult {
	const parent = getNode(doc, input.parentId)
	assertCanHaveChildren(parent)
	const type = input.type ?? 'workpackage'
	if ((type as NodeType) === 'project') {
		throw new PspError('invalid_value', 'Only the root can be a project')
	}
	const siblings = siblingIds(doc, parent.id)
	const index = input.index ?? siblings.length
	assertIndex(index, siblings.length)

	const id = idGenerator()
	if (findNode(doc, id)) {
		throw new PspError('invalid_value', `Id ${id} is already in use`)
	}
	const fields = sanitizePatch(input.fields ?? {})
	delete fields.type
	const node: PspNode = {
		...fields,
		id,
		parentId: parent.id,
		order: siblings.length,
		type,
		title: input.title ?? fields.title ?? '',
	}
	siblings.splice(index, 0, id)
	let nodes = promoteParent([...doc.nodes, node], parent.id)
	nodes = withSiblingOrder(nodes, parent.id, siblings)
	return { doc: { ...doc, nodes }, id }
}

/** Adds a node directly after `siblingId`, under the same parent. */
export function addSiblingAfter(
	doc: PspDocument,
	siblingId: string,
	input: Omit<AddNodeInput, 'parentId' | 'index'> = {},
	idGenerator: IdGenerator = defaultIdGenerator,
): AddNodeResult {
	const sibling = getNode(doc, siblingId)
	if (sibling.parentId === null) {
		throw new PspError('root_immutable', 'The root has no siblings')
	}
	const index = siblingIds(doc, sibling.parentId).indexOf(sibling.id) + 1
	return addNode(doc, { ...input, parentId: sibling.parentId, index }, idGenerator)
}

const NUMERIC_FIELDS = ['effortDays'] as const

function sanitizePatch(patch: NodePatch): NodePatch {
	const copy: NodePatch & Record<string, unknown> = { ...patch }
	for (const key of ['id', 'parentId', 'order', 'code']) {
		delete copy[key]
	}
	for (const key of NUMERIC_FIELDS) {
		const value = copy[key]
		if (value !== undefined && value !== null && (!Number.isFinite(value) || value < 0)) {
			throw new PspError('invalid_value', `${key} must be a non-negative number`)
		}
	}
	if (copy.costs) {
		for (const item of copy.costs) {
			if (!Number.isFinite(item.amount) || item.amount < 0) {
				throw new PspError('invalid_value', 'Cost amounts must be non-negative numbers')
			}
		}
		copy.costs = copy.costs.map((item) => ({ ...item }))
	}
	if (copy.dependsOn) {
		copy.dependsOn = [...copy.dependsOn]
	}
	return copy
}

/** Changes content fields of a node. Use the tree operations to move it. */
export function updateNode(doc: PspDocument, id: string, patch: NodePatch): PspDocument {
	const node = getNode(doc, id)
	const clean = sanitizePatch(patch)
	if (clean.type !== undefined && clean.type !== node.type) {
		if (node.parentId === null || clean.type === 'project') {
			throw new PspError('root_immutable', 'The root is always the project, and only the root is')
		}
		if ((clean.type === 'milestone' || clean.type === 'workpackage') && hasChildren(doc, id)) {
			throw new PspError('invalid_value', 'A node with children can only be a sub-project')
		}
	}
	if (clean.dependsOn) {
		for (const dependency of clean.dependsOn) {
			if (dependency === id) {
				throw new PspError('invalid_value', 'A node cannot depend on itself')
			}
			getNode(doc, dependency)
		}
	}
	const updated: PspNode = { ...node, ...clean }
	const nodes = doc.nodes.map((current) => (current.id === id ? updated : current))
	// The root title and the document title are the same thing.
	const meta = node.parentId === null && clean.title !== undefined ? { ...doc.meta, title: clean.title } : doc.meta
	return { ...doc, meta, nodes }
}

/** Moves a node with its subtree under `newParentId` at `index`. */
export function moveNode(doc: PspDocument, id: string, newParentId: string, index?: number): PspDocument {
	const node = getNode(doc, id)
	if (node.parentId === null) {
		throw new PspError('root_immutable', 'The root cannot be moved')
	}
	const newParent = getNode(doc, newParentId)
	if (newParent.id === id || isAncestor(doc, id, newParent.id)) {
		throw new PspError('cycle', 'A node cannot be moved into its own subtree')
	}
	assertCanHaveChildren(newParent)

	const oldParentId = node.parentId
	const targetSiblings = siblingIds(doc, newParent.id).filter((sibling) => sibling !== id)
	const targetIndex = index ?? targetSiblings.length
	assertIndex(targetIndex, targetSiblings.length)
	targetSiblings.splice(targetIndex, 0, id)

	let nodes = doc.nodes.map((current) => (current.id === id ? { ...current, parentId: newParent.id } : current))
	nodes = promoteParent(nodes, newParent.id)
	nodes = withSiblingOrder(nodes, newParent.id, targetSiblings)
	if (oldParentId !== newParent.id) {
		const remaining = doc.nodes.filter((current) => current.parentId === oldParentId && current.id !== id).sort(byOrder)
		nodes = withSiblingOrder(nodes, oldParentId, remaining.map((current) => current.id))
	}
	return { ...doc, nodes }
}

/** Makes the node the last child of its previous sibling (Tab in an outline). */
export function indentNode(doc: PspDocument, id: string): PspDocument {
	const node = getNode(doc, id)
	if (node.parentId === null) {
		return doc
	}
	const siblings = getChildren(doc, node.parentId)
	const position = siblings.findIndex((sibling) => sibling.id === id)
	const previous = siblings[position - 1]
	if (!previous || previous.type === 'milestone') {
		return doc
	}
	return moveNode(doc, id, previous.id)
}

/** Makes the node the next sibling of its parent (Shift+Tab in an outline). */
export function outdentNode(doc: PspDocument, id: string): PspDocument {
	const node = getNode(doc, id)
	if (node.parentId === null) {
		return doc
	}
	const parent = getNode(doc, node.parentId)
	if (parent.parentId === null) {
		return doc
	}
	const parentPosition = siblingIds(doc, parent.parentId).indexOf(parent.id)
	return moveNode(doc, id, parent.parentId, parentPosition + 1)
}

function shift(doc: PspDocument, id: string, delta: -1 | 1): PspDocument {
	const node = getNode(doc, id)
	if (node.parentId === null) {
		return doc
	}
	const siblings = siblingIds(doc, node.parentId)
	const position = siblings.indexOf(id)
	const target = position + delta
	if (target < 0 || target >= siblings.length) {
		return doc
	}
	siblings.splice(position, 1)
	siblings.splice(target, 0, id)
	return { ...doc, nodes: withSiblingOrder(doc.nodes, node.parentId, siblings) }
}

export function moveUp(doc: PspDocument, id: string): PspDocument {
	return shift(doc, id, -1)
}

export function moveDown(doc: PspDocument, id: string): PspDocument {
	return shift(doc, id, 1)
}

/** Removes a node and its whole subtree, and drops dependencies on removed nodes. */
export function removeNode(doc: PspDocument, id: string): PspDocument {
	const node = getNode(doc, id)
	if (node.parentId === null) {
		throw new PspError('root_immutable', 'The root cannot be removed')
	}
	const removed = getSubtreeIds(doc, id)
	let nodes = doc.nodes
		.filter((current) => !removed.has(current.id))
		.map((current) => {
			if (!current.dependsOn?.some((dependency) => removed.has(dependency))) {
				return current
			}
			return { ...current, dependsOn: current.dependsOn.filter((dependency) => !removed.has(dependency)) }
		})
	const remaining = nodes.filter((current) => current.parentId === node.parentId).sort(byOrder)
	nodes = withSiblingOrder(nodes, node.parentId, remaining.map((current) => current.id))
	return { ...doc, nodes }
}

/** Changes document-level settings such as title, currency or cost categories. */
export function updateMeta(doc: PspDocument, patch: Partial<Omit<PspDocument['meta'], 'frozenCodes' | 'codeScheme'>>): PspDocument {
	const meta = { ...doc.meta, ...patch }
	if (patch.costCategories) {
		meta.costCategories = [...patch.costCategories]
	}
	if (patch.title === undefined) {
		return { ...doc, meta }
	}
	const rootId = getRoot(doc).id
	const nodes = doc.nodes.map((node) => (node.id === rootId ? { ...node, title: patch.title as string } : node))
	return { ...doc, meta, nodes }
}
