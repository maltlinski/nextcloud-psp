/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*
 * Roll-ups: every node shows the totals of itself and everything below it.
 * Amounts are added in cents and effort in hundredths of a day, so totals do
 * not drift through floating point errors.
 */

import { childrenIndex, getRoot } from './tree'
import type { PspDocument, PspNode } from './types'

export interface Rollup {
	/** Person-days of this node and all descendants. */
	effortDays: number
	/** Sum of all cost items, in the document currency. */
	costTotal: number
	costsByCategory: Record<string, number>
	/** Earliest start, end or milestone date in the subtree. */
	start: string | null
	/** Latest end, start or milestone date in the subtree. */
	end: string | null
	/** Work packages in the subtree, including the node itself. */
	workpackageCount: number
	/** Work packages with status `done`. */
	doneWorkpackageCount: number
	milestoneCount: number
}

const toHundredths = (value: number) => Math.round(value * 100)
const fromHundredths = (value: number) => value / 100

function minDate(a: string | null, b: string | null | undefined): string | null {
	if (!b) {
		return a
	}
	return a === null || b < a ? b : a
}

function maxDate(a: string | null, b: string | null | undefined): string | null {
	if (!b) {
		return a
	}
	return a === null || b > a ? b : a
}

interface Accumulator {
	effort: number
	costs: Map<string, number>
	start: string | null
	end: string | null
	workpackages: number
	done: number
	milestones: number
}

function own(node: PspNode): Accumulator {
	const costs = new Map<string, number>()
	for (const item of node.costs ?? []) {
		costs.set(item.category, (costs.get(item.category) ?? 0) + toHundredths(item.amount))
	}
	let start: string | null = null
	let end: string | null = null
	for (const date of [node.start, node.end, node.date]) {
		start = minDate(start, date)
		end = maxDate(end, date)
	}
	return {
		effort: toHundredths(node.effortDays ?? 0),
		costs,
		start,
		end,
		workpackages: node.type === 'workpackage' ? 1 : 0,
		done: node.type === 'workpackage' && node.status === 'done' ? 1 : 0,
		milestones: node.type === 'milestone' ? 1 : 0,
	}
}

function toRollup(acc: Accumulator): Rollup {
	const costsByCategory: Record<string, number> = {}
	let total = 0
	for (const [category, cents] of acc.costs) {
		costsByCategory[category] = fromHundredths(cents)
		total += cents
	}
	return {
		effortDays: fromHundredths(acc.effort),
		costTotal: fromHundredths(total),
		costsByCategory,
		start: acc.start,
		end: acc.end,
		workpackageCount: acc.workpackages,
		doneWorkpackageCount: acc.done,
		milestoneCount: acc.milestones,
	}
}

/** Totals for every node, keyed by node id. */
export function computeRollups(doc: PspDocument): Map<string, Rollup> {
	const children = childrenIndex(doc)
	const result = new Map<string, Rollup>()

	const visit = (node: PspNode): Accumulator => {
		const acc = own(node)
		for (const child of children.get(node.id) ?? []) {
			const sub = visit(child)
			acc.effort += sub.effort
			for (const [category, cents] of sub.costs) {
				acc.costs.set(category, (acc.costs.get(category) ?? 0) + cents)
			}
			acc.start = minDate(acc.start, sub.start)
			acc.end = maxDate(acc.end, sub.end)
			acc.workpackages += sub.workpackages
			acc.done += sub.done
			acc.milestones += sub.milestones
		}
		result.set(node.id, toRollup(acc))
		return acc
	}
	visit(getRoot(doc))
	return result
}

/** Share of finished work packages, 0..1, or null when there are none. */
export function progress(rollup: Rollup): number | null {
	return rollup.workpackageCount === 0 ? null : rollup.doneWorkpackageCount / rollup.workpackageCount
}
