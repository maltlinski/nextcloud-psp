/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it } from 'vitest'
import {
	addNode,
	addSiblingAfter,
	childrenIndex,
	createDocument,
	defaultIdGenerator,
	findNode,
	getAncestors,
	getChildren,
	getDepth,
	getNode,
	getParent,
	getRoot,
	getSubtreeIds,
	hasChildren,
	indentNode,
	isAncestor,
	moveDown,
	moveNode,
	moveUp,
	outdentNode,
	removeNode,
	updateMeta,
	updateNode,
	walk,
} from '../tree'
import { PspError, type PspDocument } from '../types'
import { buildSample, childTitles, sequentialIds } from './helpers'

function expectPspError(fn: () => unknown, code: PspError['code']): void {
	try {
		fn()
	} catch (error) {
		expect(error).toBeInstanceOf(PspError)
		expect((error as PspError).code).toBe(code)
		return
	}
	throw new Error(`Expected PspError ${code}`)
}

/** Sibling orders under every parent are 0..n-1. */
function expectDenseOrders(doc: PspDocument): void {
	for (const list of childrenIndex(doc).values()) {
		expect(list.map((node) => node.order)).toEqual(list.map((_, index) => index))
	}
}

describe('createDocument', () => {
	it('creates a document with a project root and defaults', () => {
		const doc = createDocument('Miesmotte', { idGenerator: () => 'root' })
		expect(doc.format).toBe('nextcloud-psp')
		expect(doc.schemaVersion).toBe(1)
		expect(doc.meta).toEqual({
			title: 'Miesmotte',
			currency: 'EUR',
			codeScheme: 'numeric',
			frozenCodes: false,
			costCategories: ['Personal', 'Sachkosten', 'Reise', 'Sonstiges'],
		})
		expect(doc.nodes).toEqual([{ id: 'root', parentId: null, order: 0, type: 'project', title: 'Miesmotte' }])
	})

	it('accepts currency and categories', () => {
		const categories = ['A', 'B']
		const doc = createDocument('X', { currency: 'CHF', costCategories: categories })
		expect(doc.meta.currency).toBe('CHF')
		expect(doc.meta.costCategories).toEqual(['A', 'B'])
		expect(doc.meta.costCategories).not.toBe(categories)
	})

	it('uses random UUIDs by default', () => {
		expect(defaultIdGenerator()).toMatch(/^[0-9a-f-]{36}$/)
		expect(createDocument('X').nodes[0].id).not.toBe(createDocument('X').nodes[0].id)
	})
})

describe('queries', () => {
	const { doc, ids } = buildSample()

	it('finds nodes and the root', () => {
		expect(getRoot(doc).id).toBe(ids.root)
		expect(getNode(doc, ids.fassung).title).toBe('Stückfassung')
		expect(findNode(doc, 'missing')).toBeUndefined()
		expectPspError(() => getNode(doc, 'missing'), 'not_found')
		expectPspError(() => getRoot({ ...doc, nodes: [] }), 'not_found')
	})

	it('lists children in order', () => {
		expect(getChildren(doc, ids.root).map((node) => node.title)).toEqual(['Konzept', 'Bühne', 'Premiere', 'Öffentlichkeitsarbeit'])
		expect(getChildren(doc, ids.recherche)).toEqual([])
		expect(hasChildren(doc, ids.konzept)).toBe(true)
		expect(hasChildren(doc, ids.recherche)).toBe(false)
	})

	it('breaks order ties by id', () => {
		const tied: PspDocument = {
			...doc,
			nodes: doc.nodes.map((node) => (node.parentId === ids.konzept ? { ...node, order: 0 } : node)),
		}
		expect(getChildren(tied, ids.konzept).map((node) => node.id)).toEqual([ids.recherche, ids.fassung].sort())
	})

	it('navigates up the tree', () => {
		expect(getParent(doc, ids.fassung)?.id).toBe(ids.konzept)
		expect(getParent(doc, ids.root)).toBeNull()
		expect(getAncestors(doc, ids.fassung).map((node) => node.id)).toEqual([ids.konzept, ids.root])
		expect(getDepth(doc, ids.root)).toBe(0)
		expect(getDepth(doc, ids.fassung)).toBe(2)
		expect(isAncestor(doc, ids.root, ids.fassung)).toBe(true)
		expect(isAncestor(doc, ids.buehne, ids.fassung)).toBe(false)
		expect(isAncestor(doc, ids.fassung, ids.fassung)).toBe(false)
	})

	it('walks in pre-order', () => {
		expect(walk(doc).map((node) => node.title)).toEqual([
			'Theaterproduktion',
			'Konzept',
			'Recherche',
			'Stückfassung',
			'Bühne',
			'Inflatable-Prototyp',
			'Premiere',
			'Öffentlichkeitsarbeit',
		])
		expect(walk(doc, ids.konzept).map((node) => node.title)).toEqual(['Konzept', 'Recherche', 'Stückfassung'])
		expect([...getSubtreeIds(doc, ids.buehne)]).toEqual([ids.buehne, ids.prototyp])
	})
})

describe('addNode', () => {
	it('appends a work package at the end by default', () => {
		const { doc, ids } = buildSample()
		const { doc: next, id } = addNode(doc, { parentId: ids.konzept, title: 'Dramaturgie' }, () => 'new')
		expect(id).toBe('new')
		expect(getNode(next, 'new')).toMatchObject({ type: 'workpackage', parentId: ids.konzept, title: 'Dramaturgie' })
		expect(childTitles(next, ids.konzept)).toEqual(['Recherche', 'Stückfassung', 'Dramaturgie'])
		expectDenseOrders(next)
	})

	it('inserts at an index and renumbers siblings', () => {
		const { doc, ids } = buildSample()
		const { doc: next } = addNode(doc, { parentId: ids.root, title: 'Finanzierung', type: 'subproject', index: 0 }, () => 'new')
		expect(childTitles(next, ids.root)).toEqual(['Finanzierung', 'Konzept', 'Bühne', 'Premiere', 'Öffentlichkeitsarbeit'])
		expectDenseOrders(next)
	})

	it('does not change the input document', () => {
		const { doc, ids } = buildSample()
		const before = JSON.stringify(doc)
		addNode(doc, { parentId: ids.root, index: 0 }, () => 'new')
		expect(JSON.stringify(doc)).toBe(before)
	})

	it('turns a work package that gets children into a sub-project', () => {
		const { doc, ids } = buildSample()
		const { doc: next } = addNode(doc, { parentId: ids.pr, title: 'Plakat' }, () => 'new')
		expect(getNode(next, ids.pr).type).toBe('subproject')
	})

	it('takes content fields but never structure fields', () => {
		const { doc, ids } = buildSample()
		const { doc: next } = addNode(doc, {
			parentId: ids.root,
			fields: { title: 'Aus Feldern', effortDays: 2, id: 'evil', parentId: 'evil', order: 99, type: 'milestone' } as never,
		}, () => 'new')
		const node = getNode(next, 'new')
		expect(node).toMatchObject({ id: 'new', parentId: ids.root, type: 'workpackage', title: 'Aus Feldern', effortDays: 2 })
		expect(node.order).toBe(4)
	})

	it('defaults to an empty title', () => {
		const { doc, ids } = buildSample()
		expect(getNode(addNode(doc, { parentId: ids.root }, () => 'new').doc, 'new').title).toBe('')
	})

	it('rejects impossible input', () => {
		const { doc, ids } = buildSample()
		expectPspError(() => addNode(doc, { parentId: ids.premiere }), 'invalid_parent')
		expectPspError(() => addNode(doc, { parentId: 'missing' }), 'not_found')
		expectPspError(() => addNode(doc, { parentId: ids.root, index: 9 }), 'invalid_position')
		expectPspError(() => addNode(doc, { parentId: ids.root, index: -1 }), 'invalid_position')
		expectPspError(() => addNode(doc, { parentId: ids.root, index: 0.5 }), 'invalid_position')
		expectPspError(() => addNode(doc, { parentId: ids.root, type: 'project' as never }), 'invalid_value')
		expectPspError(() => addNode(doc, { parentId: ids.root }, () => ids.konzept), 'invalid_value')
	})
})

describe('addSiblingAfter', () => {
	it('inserts right after the given node', () => {
		const { doc, ids } = buildSample()
		const { doc: next } = addSiblingAfter(doc, ids.recherche, { title: 'Interviews' }, () => 'new')
		expect(childTitles(next, ids.konzept)).toEqual(['Recherche', 'Interviews', 'Stückfassung'])
	})

	it('uses defaults and rejects the root', () => {
		const { doc, ids } = buildSample()
		expect(getNode(addSiblingAfter(doc, ids.pr, undefined, () => 'new').doc, 'new').parentId).toBe(ids.root)
		expectPspError(() => addSiblingAfter(doc, ids.root), 'root_immutable')
	})
})

describe('updateNode', () => {
	it('changes content fields', () => {
		const { doc, ids } = buildSample()
		const next = updateNode(doc, ids.recherche, { title: 'Recherche Insekten', effortDays: null, status: 'open' })
		expect(getNode(next, ids.recherche)).toMatchObject({ title: 'Recherche Insekten', effortDays: null, status: 'open' })
		expect(getNode(doc, ids.recherche).title).toBe('Recherche')
	})

	it('ignores structure fields in the patch', () => {
		const { doc, ids } = buildSample()
		const next = updateNode(doc, ids.recherche, { id: 'x', parentId: ids.buehne, order: 7, code: '9' } as never)
		expect(getNode(next, ids.recherche)).toMatchObject({ id: ids.recherche, parentId: ids.konzept, order: 0 })
		expect(getNode(next, ids.recherche).code).toBeUndefined()
	})

	it('keeps the root title and the document title in sync', () => {
		const { doc, ids } = buildSample()
		const next = updateNode(doc, ids.root, { title: 'Die Miesmotte' })
		expect(next.meta.title).toBe('Die Miesmotte')
		expect(updateNode(doc, ids.konzept, { title: 'Idee' }).meta.title).toBe('Theaterproduktion')
	})

	it('copies arrays instead of sharing them', () => {
		const { doc, ids } = buildSample()
		const costs = [{ category: 'Reise', amount: 50 }]
		const dependsOn = [ids.recherche]
		const next = updateNode(doc, ids.pr, { costs, dependsOn })
		costs[0].amount = 999
		dependsOn.push('x')
		expect(getNode(next, ids.pr).costs).toEqual([{ category: 'Reise', amount: 50 }])
		expect(getNode(next, ids.pr).dependsOn).toEqual([ids.recherche])
	})

	it('allows a leaf to become a milestone or sub-project', () => {
		const { doc, ids } = buildSample()
		expect(getNode(updateNode(doc, ids.pr, { type: 'milestone' }), ids.pr).type).toBe('milestone')
		expect(getNode(updateNode(doc, ids.pr, { type: 'subproject' }), ids.pr).type).toBe('subproject')
		expect(getNode(updateNode(doc, ids.pr, { type: 'workpackage' }), ids.pr).type).toBe('workpackage')
	})

	it('rejects invalid changes', () => {
		const { doc, ids } = buildSample()
		expectPspError(() => updateNode(doc, ids.root, { type: 'subproject' }), 'root_immutable')
		expectPspError(() => updateNode(doc, ids.pr, { type: 'project' }), 'root_immutable')
		expectPspError(() => updateNode(doc, ids.konzept, { type: 'milestone' }), 'invalid_value')
		expectPspError(() => updateNode(doc, ids.konzept, { type: 'workpackage' }), 'invalid_value')
		expectPspError(() => updateNode(doc, ids.pr, { effortDays: -1 }), 'invalid_value')
		expectPspError(() => updateNode(doc, ids.pr, { effortDays: Number.NaN }), 'invalid_value')
		expectPspError(() => updateNode(doc, ids.pr, { costs: [{ category: 'X', amount: -5 }] }), 'invalid_value')
		expectPspError(() => updateNode(doc, ids.pr, { costs: [{ category: 'X', amount: Number.POSITIVE_INFINITY }] }), 'invalid_value')
		expectPspError(() => updateNode(doc, ids.pr, { dependsOn: [ids.pr] }), 'invalid_value')
		expectPspError(() => updateNode(doc, ids.pr, { dependsOn: ['missing'] }), 'not_found')
		expectPspError(() => updateNode(doc, 'missing', { title: 'x' }), 'not_found')
	})
})

describe('moveNode', () => {
	it('moves a subtree to another parent and renumbers both sibling lists', () => {
		const { doc, ids } = buildSample()
		const next = moveNode(doc, ids.fassung, ids.buehne, 0)
		expect(childTitles(next, ids.konzept)).toEqual(['Recherche'])
		expect(childTitles(next, ids.buehne)).toEqual(['Stückfassung', 'Inflatable-Prototyp'])
		expectDenseOrders(next)
	})

	it('appends by default and reorders within the same parent', () => {
		const { doc, ids } = buildSample()
		expect(childTitles(moveNode(doc, ids.recherche, ids.buehne), ids.buehne)).toEqual(['Inflatable-Prototyp', 'Recherche'])
		const reordered = moveNode(doc, ids.pr, ids.root, 0)
		expect(childTitles(reordered, ids.root)).toEqual(['Öffentlichkeitsarbeit', 'Konzept', 'Bühne', 'Premiere'])
		expectDenseOrders(reordered)
	})

	it('moves the whole subtree', () => {
		const { doc, ids } = buildSample()
		const next = moveNode(doc, ids.konzept, ids.buehne)
		expect(getAncestors(next, ids.fassung).map((node) => node.id)).toEqual([ids.konzept, ids.buehne, ids.root])
	})

	it('promotes a work package that becomes a parent', () => {
		const { doc, ids } = buildSample()
		expect(getNode(moveNode(doc, ids.recherche, ids.pr), ids.pr).type).toBe('subproject')
	})

	it('rejects impossible moves', () => {
		const { doc, ids } = buildSample()
		expectPspError(() => moveNode(doc, ids.root, ids.konzept), 'root_immutable')
		expectPspError(() => moveNode(doc, ids.konzept, ids.recherche), 'cycle')
		expectPspError(() => moveNode(doc, ids.konzept, ids.konzept), 'cycle')
		expectPspError(() => moveNode(doc, ids.pr, ids.premiere), 'invalid_parent')
		expectPspError(() => moveNode(doc, ids.pr, ids.konzept, 5), 'invalid_position')
		expectPspError(() => moveNode(doc, ids.pr, 'missing'), 'not_found')
	})
})

describe('indent and outdent', () => {
	it('indents under the previous sibling', () => {
		const { doc, ids } = buildSample()
		const next = indentNode(doc, ids.buehne)
		expect(childTitles(next, ids.konzept)).toEqual(['Recherche', 'Stückfassung', 'Bühne'])
		expect(childTitles(next, ids.root)).toEqual(['Konzept', 'Premiere', 'Öffentlichkeitsarbeit'])
		expectDenseOrders(next)
	})

	it('does nothing when indenting is impossible', () => {
		const { doc, ids } = buildSample()
		expect(indentNode(doc, ids.konzept)).toBe(doc)
		expect(indentNode(doc, ids.pr)).toBe(doc)
		expect(indentNode(doc, ids.root)).toBe(doc)
	})

	it('outdents to the next position after the parent', () => {
		const { doc, ids } = buildSample()
		const next = outdentNode(doc, ids.recherche)
		expect(childTitles(next, ids.root)).toEqual(['Konzept', 'Recherche', 'Bühne', 'Premiere', 'Öffentlichkeitsarbeit'])
		expect(childTitles(next, ids.konzept)).toEqual(['Stückfassung'])
		expectDenseOrders(next)
	})

	it('does nothing when outdenting is impossible', () => {
		const { doc, ids } = buildSample()
		expect(outdentNode(doc, ids.konzept)).toBe(doc)
		expect(outdentNode(doc, ids.root)).toBe(doc)
	})

	it('indent and outdent are inverse for a last child', () => {
		const { doc, ids } = buildSample()
		const roundTrip = outdentNode(indentNode(doc, ids.buehne), ids.buehne)
		expect(childTitles(roundTrip, ids.root)).toEqual(childTitles(doc, ids.root))
	})
})

describe('moveUp and moveDown', () => {
	it('swaps with the neighbour', () => {
		const { doc, ids } = buildSample()
		expect(childTitles(moveUp(doc, ids.buehne), ids.root)).toEqual(['Bühne', 'Konzept', 'Premiere', 'Öffentlichkeitsarbeit'])
		expect(childTitles(moveDown(doc, ids.buehne), ids.root)).toEqual(['Konzept', 'Premiere', 'Bühne', 'Öffentlichkeitsarbeit'])
	})

	it('does nothing at the edges and for the root', () => {
		const { doc, ids } = buildSample()
		expect(moveUp(doc, ids.konzept)).toBe(doc)
		expect(moveDown(doc, ids.pr)).toBe(doc)
		expect(moveUp(doc, ids.root)).toBe(doc)
	})
})

describe('removeNode', () => {
	it('removes the subtree, renumbers siblings and drops dependencies on it', () => {
		const { doc, ids } = buildSample()
		const next = removeNode(doc, ids.konzept)
		expect(findNode(next, ids.konzept)).toBeUndefined()
		expect(findNode(next, ids.fassung)).toBeUndefined()
		expect(getNode(next, ids.prototyp).dependsOn).toEqual([])
		expect(childTitles(next, ids.root)).toEqual(['Bühne', 'Premiere', 'Öffentlichkeitsarbeit'])
		expectDenseOrders(next)
	})

	it('keeps unrelated dependencies', () => {
		const { doc, ids } = buildSample()
		expect(getNode(removeNode(doc, ids.pr), ids.prototyp).dependsOn).toEqual([ids.fassung])
	})

	it('cannot remove the root', () => {
		const { doc, ids } = buildSample()
		expectPspError(() => removeNode(doc, ids.root), 'root_immutable')
	})
})

describe('updateMeta', () => {
	it('changes settings and keeps the root title in sync', () => {
		const { doc, ids } = buildSample()
		const categories = ['Honorare']
		const next = updateMeta(doc, { title: 'Neu', currency: 'CHF', costCategories: categories })
		expect(next.meta).toMatchObject({ title: 'Neu', currency: 'CHF', costCategories: ['Honorare'] })
		expect(next.meta.costCategories).not.toBe(categories)
		expect(getNode(next, ids.root).title).toBe('Neu')
	})

	it('leaves nodes alone when the title is unchanged', () => {
		const { doc } = buildSample()
		expect(updateMeta(doc, { currency: 'USD' }).nodes).toBe(doc.nodes)
	})
})

describe('sequentialIds helper', () => {
	it('counts up', () => {
		const next = sequentialIds('x')
		expect([next(), next()]).toEqual(['x1', 'x2'])
	})
})
