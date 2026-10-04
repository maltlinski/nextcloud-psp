/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it } from 'vitest'
import { History } from '../history'

describe('History', () => {
	it('undoes and redoes', () => {
		const history = new History('a')
		history.push('b')
		history.push('c')
		expect(history.current).toBe('c')
		expect(history.undo()).toBe('b')
		expect(history.undo()).toBe('a')
		expect(history.undo()).toBeNull()
		expect(history.canUndo).toBe(false)
		expect(history.redo()).toBe('b')
		expect(history.redo()).toBe('c')
		expect(history.redo()).toBeNull()
		expect(history.canRedo).toBe(false)
	})

	it('clears the redo stack on a new change', () => {
		const history = new History('a')
		history.push('b')
		history.undo()
		expect(history.canRedo).toBe(true)
		history.push('x')
		expect(history.canRedo).toBe(false)
		expect(history.undo()).toBe('a')
	})

	it('ignores pushing the current state', () => {
		const history = new History('a')
		history.push('a')
		expect(history.canUndo).toBe(false)
	})

	it('merges consecutive changes with the same key', () => {
		const history = new History('')
		history.push('H', 'title')
		history.push('Ha', 'title')
		history.push('Hal', 'title')
		expect(history.undo()).toBe('')
		history.push('x', 'title')
		history.push('xy', 'other')
		history.push('xyz', 'title')
		expect(history.undo()).toBe('xy')
	})

	it('does not merge into a state reached by undo', () => {
		const history = new History('a')
		history.push('b', 'k')
		history.undo()
		history.push('c', 'k')
		expect(history.undo()).toBe('a')
	})

	it('keeps at most `limit` undo steps', () => {
		const history = new History(0, 2)
		for (let i = 1; i <= 5; i++) {
			history.push(i)
		}
		expect(history.undo()).toBe(4)
		expect(history.undo()).toBe(3)
		expect(history.undo()).toBeNull()
		expect(new History(0, 0).canUndo).toBe(false)
	})

	it('can be reset', () => {
		const history = new History('a')
		history.push('b')
		history.reset('z')
		expect(history.current).toBe('z')
		expect(history.canUndo).toBe(false)
		expect(history.canRedo).toBe(false)
	})
})
