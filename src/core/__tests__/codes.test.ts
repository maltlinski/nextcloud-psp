/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it } from 'vitest'
import { compareCodes, computeCodes, freezeCodes, ROOT_CODE, unfreezeCodes } from '../codes'
import { addNode, moveNode, moveUp, removeNode, updateNode } from '../tree'
import { buildSample } from './helpers'

function codesByTitle(doc: Parameters<typeof computeCodes>[0]): Record<string, string> {
	const codes = computeCodes(doc)
	return Object.fromEntries(doc.nodes.map((node) => [node.title, codes.get(node.id) as string]))
}

describe('computeCodes', () => {
	it('numbers the structure and counts milestones separately', () => {
		const { doc } = buildSample()
		expect(codesByTitle(doc)).toEqual({
			Theaterproduktion: ROOT_CODE,
			Konzept: '1',
			Recherche: '1.1',
			Stückfassung: '1.2',
			Bühne: '2',
			'Inflatable-Prototyp': '2.1',
			Premiere: 'M1',
			Öffentlichkeitsarbeit: '3',
		})
	})

	it('goes deeper and follows the current positions', () => {
		const { doc, ids } = buildSample()
		let next = addNode(doc, { parentId: ids.fassung, title: 'Szene 1' }, () => 'a').doc
		next = addNode(next, { parentId: ids.fassung, title: 'Milestone', type: 'milestone', index: 0 }, () => 'b').doc
		next = moveUp(next, ids.buehne)
		const codes = codesByTitle(next)
		expect(codes['Szene 1']).toBe('2.2.1')
		expect(codes.Bühne).toBe('1')
		expect(codes.Milestone).toBe('M1')
		expect(codes.Premiere).toBe('M2')
	})
})

describe('frozen codes', () => {
	it('keeps codes when nodes move or disappear', () => {
		const { doc, ids } = buildSample()
		let frozen = freezeCodes(doc)
		expect(frozen.meta.frozenCodes).toBe(true)
		frozen = removeNode(frozen, ids.recherche)
		frozen = moveNode(frozen, ids.pr, ids.root, 0)
		const codes = codesByTitle(frozen)
		expect(codes.Stückfassung).toBe('1.2')
		expect(codes.Öffentlichkeitsarbeit).toBe('3')
		expect(codes.Konzept).toBe('1')
	})

	it('gives new nodes the next free number', () => {
		const { doc, ids } = buildSample()
		let frozen = freezeCodes(doc)
		frozen = addNode(frozen, { parentId: ids.konzept, title: 'Neu', index: 0 }, () => 'new').doc
		frozen = addNode(frozen, { parentId: ids.root, title: 'Neues Teilprojekt', type: 'subproject', index: 0 }, () => 'sub').doc
		frozen = addNode(frozen, { parentId: 'sub', title: 'Darunter' }, () => 'child').doc
		frozen = addNode(frozen, { parentId: ids.root, title: 'Neuer Meilenstein', type: 'milestone', index: 0 }, () => 'ms').doc
		const codes = codesByTitle(frozen)
		expect(codes.Neu).toBe('1.3')
		expect(codes['Neues Teilprojekt']).toBe('4')
		expect(codes.Darunter).toBe('4.1')
		expect(codes['Neuer Meilenstein']).toBe('M2')
		expect(codes.Premiere).toBe('M1')
	})

	it('tolerates odd stored codes', () => {
		const { doc, ids } = buildSample()
		let frozen = freezeCodes(doc)
		frozen = { ...frozen, nodes: frozen.nodes.map((node) => (node.id === ids.recherche ? { ...node, code: 'A' } : node.id === ids.premiere ? { ...node, code: 'Premiere' } : node)) }
		frozen = addNode(frozen, { parentId: ids.konzept, title: 'Neu' }, () => 'new').doc
		frozen = addNode(frozen, { parentId: ids.root, title: 'MS', type: 'milestone' }, () => 'ms').doc
		const codes = codesByTitle(frozen)
		expect(codes.Recherche).toBe('A')
		expect(codes.Neu).toBe('1.3')
		expect(codes.MS).toBe('M1')
	})

	it('uses a stored root code', () => {
		const { doc, ids } = buildSample()
		const frozen = updateNode(freezeCodes(doc), ids.root, {})
		const custom = { ...frozen, nodes: frozen.nodes.map((node) => (node.id === ids.root ? { ...node, code: 'P' } : node)) }
		expect(computeCodes(custom).get(ids.root)).toBe('P')
		expect(computeCodes(custom).get(ids.konzept)).toBe('1')
	})

	it('can be unfrozen again', () => {
		const { doc, ids } = buildSample()
		const thawed = unfreezeCodes(removeNode(freezeCodes(doc), ids.konzept))
		expect(thawed.meta.frozenCodes).toBe(false)
		expect(thawed.nodes.every((node) => node.code === undefined)).toBe(true)
		expect(codesByTitle(thawed).Bühne).toBe('1')
		expect(unfreezeCodes(doc).nodes[0]).toBe(doc.nodes[0])
	})
})

describe('compareCodes', () => {
	it('sorts naturally, milestones last', () => {
		const sorted = ['M10', '2', '1.10', 'M2', '1.2', '1', '0', '1.2.1'].sort(compareCodes)
		expect(sorted).toEqual(['0', '1', '1.2', '1.2.1', '1.10', '2', 'M2', 'M10'])
		expect(compareCodes('1.2', '1.2')).toBe(0)
	})
})
