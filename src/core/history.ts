/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Undo/redo for immutable states. Because tree operations never change a
 * document in place, keeping old documents costs only the changed nodes.
 *
 * `mergeKey` groups a run of small edits into one undo step: typing a title
 * letter by letter pushes many states with the same key, and one undo removes
 * the whole word.
 */
export class History<T> {

	#past: T[] = []
	#present: T
	#future: T[] = []
	#lastMergeKey: string | null = null
	readonly #limit: number

	constructor(initial: T, limit = 200) {
		this.#present = initial
		this.#limit = Math.max(1, limit)
	}

	get current(): T {
		return this.#present
	}

	get canUndo(): boolean {
		return this.#past.length > 0
	}

	get canRedo(): boolean {
		return this.#future.length > 0
	}

	/** Records a new state. Pushing the current state again is ignored. */
	push(next: T, mergeKey?: string): void {
		if (next === this.#present) {
			return
		}
		const merge = mergeKey !== undefined && mergeKey === this.#lastMergeKey && this.#past.length > 0
		if (!merge) {
			this.#past.push(this.#present)
			if (this.#past.length > this.#limit) {
				this.#past.shift()
			}
		}
		this.#present = next
		this.#future = []
		this.#lastMergeKey = mergeKey ?? null
	}

	undo(): T | null {
		const previous = this.#past.pop()
		if (previous === undefined) {
			return null
		}
		this.#future.push(this.#present)
		this.#present = previous
		this.#lastMergeKey = null
		return previous
	}

	redo(): T | null {
		const next = this.#future.pop()
		if (next === undefined) {
			return null
		}
		this.#past.push(this.#present)
		this.#present = next
		this.#lastMergeKey = null
		return next
	}

	/** Starts over, e.g. after loading a newer version of the file. */
	reset(state: T): void {
		this.#past = []
		this.#future = []
		this.#present = state
		this.#lastMergeKey = null
	}

}
