/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { addNode, createDocument, type IdGenerator, updateNode } from '../tree'
import type { PspDocument } from '../types'

/** Deterministic ids: n1, n2, ... */
export function sequentialIds(prefix = 'n'): IdGenerator {
	let next = 0
	return () => `${prefix}${++next}`
}

export interface Sample {
	doc: PspDocument
	ids: {
		root: string
		konzept: string
		recherche: string
		fassung: string
		buehne: string
		prototyp: string
		premiere: string
		pr: string
	}
}

/**
 * A small theatre production:
 *
 * 0 Theaterproduktion
 * ├─ 1 Konzept
 * │  ├─ 1.1 Recherche
 * │  └─ 1.2 Stückfassung
 * ├─ 2 Bühne
 * │  └─ 2.1 Inflatable-Prototyp
 * ├─ M1 Premiere
 * └─ 3 Öffentlichkeitsarbeit
 */
export function buildSample(): Sample {
	const idGenerator = sequentialIds()
	let doc = createDocument('Theaterproduktion', { idGenerator })
	const root = doc.nodes[0].id
	const add = (parentId: string, title: string, type: 'subproject' | 'workpackage' | 'milestone' = 'workpackage') => {
		const result = addNode(doc, { parentId, title, type }, idGenerator)
		doc = result.doc
		return result.id
	}
	const konzept = add(root, 'Konzept', 'subproject')
	const recherche = add(konzept, 'Recherche')
	const fassung = add(konzept, 'Stückfassung')
	const buehne = add(root, 'Bühne', 'subproject')
	const prototyp = add(buehne, 'Inflatable-Prototyp')
	const premiere = add(root, 'Premiere', 'milestone')
	const pr = add(root, 'Öffentlichkeitsarbeit')

	doc = updateNode(doc, recherche, {
		effortDays: 3,
		costs: [{ category: 'Personal', amount: 300 }],
		start: '2027-01-04',
		end: '2027-01-15',
		status: 'done',
		owner: { uid: 'anni', displayName: 'Anni' },
	})
	doc = updateNode(doc, fassung, {
		effortDays: 5,
		costs: [{ category: 'Personal', amount: 500.1 }],
		start: '2027-01-18',
		end: '2027-02-05',
		status: 'in_progress',
	})
	doc = updateNode(doc, prototyp, {
		effortDays: 4.5,
		costs: [
			{ category: 'Sachkosten', amount: 800, note: 'Stoff, Gebläse' },
			{ category: 'Personal', amount: 199.95 },
		],
		start: '2027-02-08',
		end: '2027-03-05',
		dependsOn: [fassung],
		goal: 'Funktionierender Prototyp',
		deliverable: 'Ein aufblasbares Bühnenelement',
		description: 'Erster Prototyp',
	})
	doc = updateNode(doc, premiere, { date: '2027-06-01' })
	doc = updateNode(doc, pr, { effortDays: 2 })
	return { doc, ids: { root, konzept, recherche, fassung, buehne, prototyp, premiere, pr } }
}

/** Titles of the children of a node, in order. */
export function childTitles(doc: PspDocument, parentId: string): string[] {
	return doc.nodes
		.filter((node) => node.parentId === parentId)
		.sort((a, b) => a.order - b.order)
		.map((node) => node.title)
}
