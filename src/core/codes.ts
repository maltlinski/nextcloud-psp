/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*
 * PSP codes (WBS numbers).
 *
 * The root is "0". Its structural children are numbered 1, 2, 3, their
 * children 1.1, 1.2 and so on. Milestones are not part of the structure
 * numbering; they are counted separately as M1, M2, ... in tree order.
 *
 * Once a plan has been handed in, its codes can be frozen: every node keeps
 * the code it had at that moment, even when nodes are moved or deleted. Nodes
 * added afterwards get the next free number under their parent.
 */

import { childrenIndex, getRoot, walk } from './tree'
import type { PspDocument, PspNode } from './types'

export const ROOT_CODE = '0'

const MILESTONE_PREFIX = 'M'

function childCode(parentCode: string, number: number): string {
	return parentCode === ROOT_CODE ? String(number) : `${parentCode}.${number}`
}

function lastSegment(code: string): number {
	const value = Number(code.split('.').at(-1))
	return Number.isInteger(value) ? value : 0
}

function milestoneNumber(code: string): number {
	const value = Number(code.slice(MILESTONE_PREFIX.length))
	return code.startsWith(MILESTONE_PREFIX) && Number.isInteger(value) ? value : 0
}

/** Codes for all nodes, keyed by node id. */
export function computeCodes(doc: PspDocument): Map<string, string> {
	const frozen = doc.meta.frozenCodes
	const codes = new Map<string, string>()
	const children = childrenIndex(doc)
	const root = getRoot(doc)
	codes.set(root.id, frozen && root.code ? root.code : ROOT_CODE)

	const assign = (parent: PspNode) => {
		const parentCode = codes.get(parent.id) as string
		const structural = (children.get(parent.id) ?? []).filter((node) => node.type !== 'milestone')
		if (frozen) {
			let next = Math.max(0, ...structural.filter((node) => node.code).map((node) => lastSegment(node.code as string)))
			for (const node of structural) {
				codes.set(node.id, node.code ? node.code : childCode(parentCode, ++next))
			}
		} else {
			structural.forEach((node, index) => codes.set(node.id, childCode(parentCode, index + 1)))
		}
		for (const node of structural) {
			assign(node)
		}
	}
	assign(root)

	const milestones = walk(doc).filter((node) => node.type === 'milestone')
	let nextMilestone = frozen ? Math.max(0, ...milestones.filter((node) => node.code).map((node) => milestoneNumber(node.code as string))) : 0
	for (const milestone of milestones) {
		codes.set(milestone.id, frozen && milestone.code ? milestone.code : `${MILESTONE_PREFIX}${++nextMilestone}`)
	}
	return codes
}

/** Stores the current codes in the nodes and switches the document to frozen codes. */
export function freezeCodes(doc: PspDocument): PspDocument {
	const codes = computeCodes(doc)
	return {
		...doc,
		meta: { ...doc.meta, frozenCodes: true },
		nodes: doc.nodes.map((node) => ({ ...node, code: codes.get(node.id) })),
	}
}

/** Drops stored codes; codes follow the positions in the tree again. */
export function unfreezeCodes(doc: PspDocument): PspDocument {
	return {
		...doc,
		meta: { ...doc.meta, frozenCodes: false },
		nodes: doc.nodes.map((node) => {
			if (node.code === undefined) {
				return node
			}
			const rest = { ...node }
			delete rest.code
			return rest
		}),
	}
}

/** Natural sort for codes: 1.2 < 1.10 < 2, structure codes before milestones. */
export function compareCodes(a: string, b: string): number {
	const aMilestone = a.startsWith(MILESTONE_PREFIX)
	const bMilestone = b.startsWith(MILESTONE_PREFIX)
	if (aMilestone !== bMilestone) {
		return aMilestone ? 1 : -1
	}
	if (aMilestone) {
		return milestoneNumber(a) - milestoneNumber(b)
	}
	const aParts = a.split('.').map(Number)
	const bParts = b.split('.').map(Number)
	for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
		const difference = (aParts[i] ?? -1) - (bParts[i] ?? -1)
		if (difference !== 0) {
			return difference
		}
	}
	return 0
}
