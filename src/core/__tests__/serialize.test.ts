/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it } from 'vitest'
import { serializeDocument } from '../serialize'
import { addNode, getRoot, moveUp, updateNode } from '../tree'
import { parseDocument } from '../validate'
import { buildSample } from './helpers'
import example from '../../../docs/beispiel.psp?raw'

describe('serializeDocument', () => {
	it('writes nodes in tree order with a fixed key order', () => {
		const { doc } = buildSample()
		const shuffled = { ...doc, nodes: [...doc.nodes].reverse() }
		const text = serializeDocument(shuffled)
		expect(text).toBe(serializeDocument(doc))
		expect(text.endsWith('}\n')).toBe(true)
		const parsed = JSON.parse(text)
		expect(Object.keys(parsed)).toEqual(['format', 'schemaVersion', 'meta', 'nodes'])
		expect(parsed.nodes.map((node: { title: string }) => node.title)[0]).toBe('Theaterproduktion')
		expect(Object.keys(parsed.nodes[5])).toEqual([
			'id', 'parentId', 'order', 'type', 'title', 'goal', 'deliverable', 'description',
			'effortDays', 'costs', 'start', 'end', 'dependsOn',
		])
	})

	it('omits undefined fields', () => {
		const { doc } = buildSample()
		const rootJson = JSON.parse(serializeDocument(doc)).nodes[0]
		expect(rootJson).toEqual({ id: 'n1', parentId: null, order: 0, type: 'project', title: 'Theaterproduktion' })
	})

	it('survives a save and load cycle after edits', () => {
		const { doc, ids } = buildSample()
		const edited = moveUp(doc, ids.pr)
		const reloaded = parseDocument(serializeDocument(edited)).doc!
		expect(serializeDocument(reloaded)).toBe(serializeDocument(edited))
	})

	it('loads the example file, changes it and saves it without losing anything', () => {
		const loaded = parseDocument(example).doc!
		expect(serializeDocument(loaded)).toBe(example)
		const rootId = getRoot(loaded).id
		let edited = addNode(loaded, { parentId: rootId, title: 'Finanzierung', type: 'subproject' }, () => 'new').doc
		edited = updateNode(edited, 'new', { owner: { uid: 'malte', displayName: 'Malte' }, effortDays: 1.5 })
		const saved = serializeDocument(edited)
		const reloaded = parseDocument(saved)
		expect(reloaded.issues).toEqual([])
		expect(reloaded.doc).toEqual(parseDocument(saved).doc)
		expect(serializeDocument(reloaded.doc!)).toBe(saved)
		expect(reloaded.doc!.nodes).toHaveLength(loaded.nodes.length + 1)
	})
})
