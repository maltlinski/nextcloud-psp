/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it } from 'vitest'
import { serializeDocument } from '../serialize'
import { checkDocument, isIsoDate, parseDocument } from '../validate'
import type { PspDocument } from '../types'
import { buildSample } from './helpers'
import example from '../../../docs/beispiel.psp?raw'

type RawNode = Record<string, unknown>

function raw(nodes: RawNode[], extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		format: 'nextcloud-psp',
		schemaVersion: 1,
		meta: { title: 'T', currency: 'EUR', codeScheme: 'numeric', frozenCodes: false, costCategories: ['Personal'] },
		nodes,
		...extra,
	}
}

const root: RawNode = { id: 'r', parentId: null, order: 0, type: 'project', title: 'T' }

function codes(result: ReturnType<typeof parseDocument>): string[] {
	return result.issues.map((issue) => `${issue.severity}:${issue.code}`)
}

describe('isIsoDate', () => {
	it('accepts real calendar dates only', () => {
		expect(isIsoDate('2027-02-28')).toBe(true)
		expect(isIsoDate('2028-02-29')).toBe(true)
		expect(isIsoDate('2027-02-29')).toBe(false)
		expect(isIsoDate('2027-13-01')).toBe(false)
		expect(isIsoDate('27-01-01')).toBe(false)
		expect(isIsoDate('2027-1-1')).toBe(false)
		expect(isIsoDate(20270101)).toBe(false)
	})
})

describe('parseDocument', () => {
	it('reads the example file without issues', () => {
		const result = parseDocument(example)
		expect(result.issues).toEqual([])
		expect(result.doc?.nodes).toHaveLength(9)
	})

	it('round-trips a document through text', () => {
		const { doc } = buildSample()
		const result = parseDocument(serializeDocument(doc))
		expect(result.issues).toEqual([])
		expect(serializeDocument(result.doc as PspDocument)).toBe(serializeDocument(doc))
	})

	it('accepts already parsed JSON', () => {
		expect(parseDocument(raw([root])).doc?.nodes).toHaveLength(1)
	})

	it('rejects files that are not PSP documents', () => {
		expect(codes(parseDocument('{nope'))).toEqual(['error:invalid_json'])
		expect(codes(parseDocument('[1]'))).toEqual(['error:invalid_document'])
		expect(codes(parseDocument(null))).toEqual(['error:invalid_document'])
		expect(codes(parseDocument({ format: 'other' }))).toEqual(['error:wrong_format'])
		expect(codes(parseDocument(raw([root], { schemaVersion: '1' })))).toEqual(['error:invalid_version'])
		expect(codes(parseDocument(raw([root], { schemaVersion: 0 })))).toEqual(['error:invalid_version'])
		expect(codes(parseDocument(raw([root], { schemaVersion: 2 })))).toEqual(['error:unsupported_version'])
		expect(codes(parseDocument(raw([root], { nodes: {} })))).toEqual(['error:invalid_document'])
	})

	it('fills in missing settings', () => {
		const result = parseDocument(raw([root], { meta: undefined }))
		expect(codes(result)).toEqual(['warning:meta_missing'])
		expect(result.doc?.meta).toEqual({
			title: '',
			currency: 'EUR',
			codeScheme: 'numeric',
			frozenCodes: false,
			costCategories: ['Personal', 'Sachkosten', 'Reise', 'Sonstiges'],
		})
		const partial = parseDocument(raw([root], { meta: { title: 5, currency: '', frozenCodes: 'yes', costCategories: [1] } }))
		expect(partial.doc?.meta).toMatchObject({ title: '', currency: 'EUR', frozenCodes: false, costCategories: ['Personal', 'Sachkosten', 'Reise', 'Sonstiges'] })
		expect(parseDocument(raw([root], { meta: { frozenCodes: true } })).doc?.meta.frozenCodes).toBe(true)
	})

	it('rejects nodes without identity or place', () => {
		expect(codes(parseDocument(raw([root, 'x' as never])))).toEqual(['error:invalid_node'])
		expect(codes(parseDocument(raw([root, { parentId: 'r', type: 'workpackage' }])))).toEqual(['error:invalid_node'])
		expect(codes(parseDocument(raw([root, { id: 'a', parentId: 5, type: 'workpackage' }])))).toEqual(['error:invalid_node'])
		expect(codes(parseDocument(raw([root, { id: 'a', parentId: 'r', type: 'task' }])))).toEqual(['error:invalid_node'])
	})

	it('drops invalid fields with a warning and keeps the rest', () => {
		const node: RawNode = {
			id: 'a',
			parentId: 'r',
			type: 'workpackage',
			title: 7,
			owner: { uid: 3 },
			goal: 1,
			deliverable: 'Ergebnis',
			effortDays: -2,
			costs: [{ category: 'Personal', amount: 10, note: 'ok' }, { category: 'Personal', amount: -1 }, 'x'],
			start: '2027-02-30',
			end: null,
			status: 'later',
			dependsOn: 'r',
		}
		const result = parseDocument(raw([root, node]))
		expect(result.doc).not.toBeNull()
		const parsed = result.doc!.nodes[1]
		expect(parsed).toEqual({
			id: 'a',
			parentId: 'r',
			order: 0,
			type: 'workpackage',
			title: '',
			deliverable: 'Ergebnis',
			costs: [{ category: 'Personal', amount: 10, note: 'ok' }],
			end: null,
		})
		const fields = result.issues.map((issue) => issue.message.match(/"(\w+)"/)?.[1])
		expect(fields).toEqual(['title', 'owner', 'goal', 'effortDays', 'costs', 'costs', 'start', 'status', 'dependsOn'])
		expect(result.issues.every((issue) => issue.severity === 'warning' && issue.nodeId === 'a')).toBe(true)
	})

	it('keeps valid optional fields', () => {
		const node: RawNode = {
			id: 'a',
			parentId: 'r',
			order: 3,
			type: 'workpackage',
			title: 'A',
			owner: null,
			effortDays: null,
			costs: 'none',
			start: '2027-03-01',
			end: '2027-02-01',
			status: 'done',
			dependsOn: ['r', 'r'],
			code: '1',
		}
		const result = parseDocument(raw([root, { ...node }, { id: 'o', parentId: 'r', type: 'workpackage', title: 'O', owner: { uid: 'u', displayName: 'U' } }]))
		expect(codes(result)).toEqual(['warning:invalid_field', 'warning:start_after_end'])
		expect(result.doc!.nodes[1]).toMatchObject({ owner: null, effortDays: null, status: 'done', dependsOn: ['r'], code: '1', order: 1 })
		expect(result.doc!.nodes[2]).toMatchObject({ owner: { uid: 'u', displayName: 'U' }, order: 0 })
	})

	it('finds structural errors', () => {
		const wp = (id: string, parentId: string | null, type = 'workpackage'): RawNode => ({ id, parentId, type, title: id })
		expect(codes(parseDocument(raw([root, root])))).toContain('error:duplicate_id')
		expect(codes(parseDocument(raw([wp('a', 'b'), wp('b', 'a')])))).toEqual(['error:root_count'])
		expect(codes(parseDocument(raw([root, wp('x', null, 'project')])))).toEqual(['error:root_count'])
		expect(codes(parseDocument(raw([wp('x', null, 'subproject')])))).toEqual(['error:root_type'])
		expect(codes(parseDocument(raw([root, wp('x', 'r', 'project')])))).toEqual(['error:project_not_root'])
		expect(codes(parseDocument(raw([root, wp('x', 'missing')])))).toEqual(['error:orphan'])
		expect(codes(parseDocument(raw([root, wp('m', 'r', 'milestone'), wp('x', 'm')])))).toEqual(['error:milestone_children'])
		expect(codes(parseDocument(raw([root, wp('a', 'b'), wp('b', 'a')])))).toEqual(['error:cycle', 'error:cycle'])
	})

	it('cleans up dependencies', () => {
		const result = parseDocument(raw([
			root,
			{ id: 'a', parentId: 'r', type: 'workpackage', title: 'A', dependsOn: ['b', 'missing'] },
			{ id: 'b', parentId: 'r', type: 'workpackage', title: 'B', dependsOn: ['a'] },
			{ id: 'c', parentId: 'r', type: 'workpackage', title: 'C', dependsOn: ['c'] },
		]))
		expect(codes(result)).toEqual(['warning:invalid_dependency', 'warning:invalid_dependency', 'warning:dependency_cycle'])
		expect(result.doc!.nodes.find((node) => node.id === 'a')?.dependsOn).toEqual(['b'])
		expect(result.doc!.nodes.find((node) => node.id === 'c')?.dependsOn).toEqual([])
	})

	it('renumbers sibling orders', () => {
		const result = parseDocument(raw([
			root,
			{ id: 'b', parentId: 'r', order: 10, type: 'workpackage', title: 'B' },
			{ id: 'a', parentId: 'r', order: 10, type: 'workpackage', title: 'A' },
			{ id: 'c', parentId: 'r', order: -3, type: 'workpackage', title: 'C' },
		]))
		const orders = Object.fromEntries(result.doc!.nodes.map((node) => [node.id, node.order]))
		expect(orders).toEqual({ r: 0, c: 0, a: 1, b: 2 })
	})
})

describe('checkDocument', () => {
	it('finds no issues in a valid document', () => {
		expect(checkDocument(buildSample().doc)).toEqual([])
	})

	it('reports structural and dependency problems', () => {
		const { doc, ids } = buildSample()
		const broken = { ...doc, nodes: doc.nodes.map((node) => (node.id === ids.recherche ? { ...node, parentId: 'gone' } : node)) }
		expect(checkDocument(broken).map((issue) => issue.code)).toEqual(['orphan'])
		const looping = {
			...doc,
			nodes: doc.nodes.map((node) => (node.id === ids.fassung ? { ...node, dependsOn: [ids.prototyp] } : node)),
		}
		expect(checkDocument(looping).map((issue) => issue.code)).toEqual(['dependency_cycle'])
	})
})
