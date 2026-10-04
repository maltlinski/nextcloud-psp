/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it } from 'vitest'
import { computeRollups, progress } from '../rollup'
import { addNode, createDocument, updateNode } from '../tree'
import { buildSample } from './helpers'

describe('computeRollups', () => {
	it('sums effort and costs up the tree', () => {
		const { doc, ids } = buildSample()
		const rollups = computeRollups(doc)
		expect(rollups.get(ids.konzept)).toMatchObject({ effortDays: 8, costTotal: 800.1, costsByCategory: { Personal: 800.1 } })
		expect(rollups.get(ids.buehne)).toMatchObject({ effortDays: 4.5, costTotal: 999.95, costsByCategory: { Sachkosten: 800, Personal: 199.95 } })
		expect(rollups.get(ids.root)).toMatchObject({
			effortDays: 14.5,
			costTotal: 1800.05,
			costsByCategory: { Personal: 1000.05, Sachkosten: 800 },
		})
	})

	it('takes the earliest and latest dates, including milestones', () => {
		const { doc, ids } = buildSample()
		const rollups = computeRollups(doc)
		expect(rollups.get(ids.konzept)).toMatchObject({ start: '2027-01-04', end: '2027-02-05' })
		expect(rollups.get(ids.root)).toMatchObject({ start: '2027-01-04', end: '2027-06-01' })
		expect(rollups.get(ids.pr)).toMatchObject({ start: null, end: null })
	})

	it('counts work packages, finished ones and milestones', () => {
		const { doc, ids } = buildSample()
		const root = computeRollups(doc).get(ids.root)!
		expect(root).toMatchObject({ workpackageCount: 4, doneWorkpackageCount: 1, milestoneCount: 1 })
		expect(progress(root)).toBe(0.25)
		expect(progress(computeRollups(doc).get(ids.premiere)!)).toBeNull()
	})

	it('adds money without floating point drift', () => {
		let doc = createDocument('X', { idGenerator: () => 'root' })
		doc = addNode(doc, { parentId: 'root' }, () => 'a').doc
		doc = addNode(doc, { parentId: 'root' }, () => 'b').doc
		doc = updateNode(doc, 'a', { costs: [{ category: 'Sonstiges', amount: 0.1 }], effortDays: 0.1 })
		doc = updateNode(doc, 'b', { costs: [{ category: 'Sonstiges', amount: 0.2 }], effortDays: 0.2 })
		const root = computeRollups(doc).get('root')!
		expect(root.costTotal).toBe(0.3)
		expect(root.effortDays).toBe(0.3)
	})

	it('counts the own values of a parent too', () => {
		const { doc, ids } = buildSample()
		const next = updateNode(doc, ids.konzept, { costs: [{ category: 'Reise', amount: 100 }], start: '2026-12-01' })
		expect(computeRollups(next).get(ids.konzept)).toMatchObject({ costTotal: 900.1, start: '2026-12-01' })
	})
})
