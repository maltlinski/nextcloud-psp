/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { describe, expect, it, vi } from 'vitest'
import { addNode, getRoot, serializeDocument, updateNode } from '../../core'
import type { LoadedPlan, SaveResult } from '../api'
import { EditorSession, OpenError, planTitleFromName, type SessionApi } from '../session'
import example from '../../../docs/beispiel.psp?raw'

/** An in-memory server holding one file. */
class FakeServer implements SessionApi {

	content: string
	etag = 'e1'
	canEdit = true
	saves: { content: string, etag: string, force: boolean }[] = []
	failNext: Error | null = null
	pending: (() => void) | null = null
	holdSaves = false

	constructor(content: string) {
		this.content = content
	}

	async load(fileId: number): Promise<LoadedPlan> {
		return { fileId, name: 'Plan.psp', path: '/Plan.psp', etag: this.etag, mtime: 1, canEdit: this.canEdit, content: this.content }
	}

	async save(fileId: number, content: string, etag: string, force = false): Promise<SaveResult> {
		if (this.holdSaves) {
			await new Promise<void>((resolve) => {
				this.pending = resolve
			})
		}
		this.saves.push({ content, etag, force })
		if (this.failNext) {
			const error = this.failNext
			this.failNext = null
			throw error
		}
		if (!force && etag !== this.etag) {
			return { ok: false, conflict: true, etag: this.etag, mtime: 2 }
		}
		this.content = content
		this.etag = `e${this.saves.length + 1}`
		return { ok: true, info: { fileId, name: 'Plan.psp', path: '/Plan.psp', etag: this.etag, mtime: 3, canEdit: true } }
	}

	/** Someone else saves the file. */
	externalEdit(content: string): void {
		this.content = content
		this.etag = 'external'
	}

}

/** Timers that run only when the test says so. */
function manualTimers() {
	let next: (() => void) | null = null
	return {
		options: {
			setTimer: (callback: () => void) => {
				next = callback
				return 1
			},
			clearTimer: () => {
				next = null
			},
		},
		pending: () => next !== null,
		fire: () => {
			const callback = next
			next = null
			callback?.()
		},
	}
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function openSession(content = example) {
	const server = new FakeServer(content)
	const timers = manualTimers()
	const session = new EditorSession(server, 7, timers.options)
	await session.open()
	return { server, timers, session }
}

function rename(session: EditorSession, title: string) {
	return session.update((doc) => updateNode(doc, getRoot(doc).id, { title }), 'title')
}

describe('planTitleFromName', () => {
	it('drops the extension', () => {
		expect(planTitleFromName('Miesmotte.PSP')).toBe('Miesmotte')
		expect(planTitleFromName('notes.txt')).toBe('notes.txt')
	})
})

describe('EditorSession', () => {
	it('opens a file without saving it again', async () => {
		const { session, timers, server } = await openSession()
		expect(session.snapshot).toMatchObject({ name: 'Plan.psp', saveState: 'saved', canEdit: true, canUndo: false, issues: [] })
		expect(session.hasUnsavedChanges).toBe(false)
		expect(timers.pending()).toBe(false)
		expect(server.saves).toHaveLength(0)
	})

	it('turns an empty file into a new plan and saves it', async () => {
		const { session, timers, server } = await openSession('')
		expect(session.doc.meta.title).toBe('Plan')
		expect(session.snapshot.saveState).toBe('dirty')
		timers.fire()
		await flush()
		expect(server.content).toBe(serializeDocument(session.doc))
		expect(session.snapshot.saveState).toBe('saved')
	})

	it('rejects files that are not plans', async () => {
		const server = new FakeServer('{"format":"other"}')
		const session = new EditorSession(server, 7)
		await expect(session.open()).rejects.toBeInstanceOf(OpenError)
		await expect(session.open()).rejects.toMatchObject({ issues: [{ code: 'wrong_format' }] })
	})

	it('reports load warnings', async () => {
		const broken = example.replace('"status": "open"', '"status": "later"')
		const { session } = await openSession(broken)
		expect(session.snapshot.issues.map((issue) => issue.code)).toEqual(['invalid_field'])
		expect(session.snapshot.saveState).toBe('dirty')
	})

	it('saves automatically after a change', async () => {
		const { session, timers, server } = await openSession()
		const states: string[] = []
		session.subscribe((snapshot) => states.push(snapshot.saveState))
		expect(rename(session, 'Neu')).toBe(true)
		expect(session.hasUnsavedChanges).toBe(true)
		timers.fire()
		await flush()
		expect(states).toEqual(['dirty', 'saving', 'saved'])
		expect(server.saves).toEqual([{ content: serializeDocument(session.doc), etag: 'e1', force: false }])
		expect(JSON.parse(server.content).meta.title).toBe('Neu')
	})

	it('uses the new ETag for the next save', async () => {
		const { session, timers, server } = await openSession()
		rename(session, 'A')
		timers.fire()
		await flush()
		rename(session, 'B')
		timers.fire()
		await flush()
		expect(server.saves.map((save) => save.etag)).toEqual(['e1', 'e2'])
		expect(session.snapshot.saveState).toBe('saved')
	})

	it('skips the request when nothing changed', async () => {
		const { session, server } = await openSession()
		rename(session, 'A')
		rename(session, 'Beispiel: Theaterproduktion')
		await session.save()
		expect(server.saves).toHaveLength(0)
		expect(session.snapshot.saveState).toBe('saved')
	})

	it('ignores changes that change nothing', async () => {
		const { session } = await openSession()
		expect(session.update((doc) => doc)).toBe(false)
		expect(session.snapshot.saveState).toBe('saved')
	})

	it('stops on a conflict and can reload', async () => {
		const { session, timers, server } = await openSession()
		server.externalEdit(example.replace('Recherche', 'Recherche (Ben)'))
		rename(session, 'Meins')
		timers.fire()
		await flush()
		expect(session.snapshot.saveState).toBe('conflict')
		rename(session, 'Noch mehr')
		expect(timers.pending()).toBe(false)
		await session.save()
		expect(server.saves).toHaveLength(1)
		await session.reload()
		expect(session.snapshot.saveState).toBe('saved')
		expect(session.doc.nodes.some((node) => node.title === 'Recherche (Ben)')).toBe(true)
		expect(session.snapshot.canUndo).toBe(false)
	})

	it('can overwrite after a conflict', async () => {
		const { session, timers, server } = await openSession()
		server.externalEdit(example)
		rename(session, 'Meins')
		timers.fire()
		await flush()
		await session.overwrite()
		expect(server.saves.at(-1)).toMatchObject({ force: true })
		expect(JSON.parse(server.content).meta.title).toBe('Meins')
		expect(session.snapshot.saveState).toBe('saved')
	})

	it('keeps changes made while a save is running', async () => {
		const { session, timers, server } = await openSession()
		server.holdSaves = true
		rename(session, 'Eins')
		timers.fire()
		await flush()
		expect(session.snapshot.saveState).toBe('saving')
		rename(session, 'Zwei')
		const second = session.save()
		server.holdSaves = false
		server.pending?.()
		await second
		await flush()
		expect(JSON.parse(server.content).meta.title).toBe('Zwei')
		expect(session.snapshot.saveState).toBe('saved')
	})

	it('schedules another save when an edit lands during a save', async () => {
		const { session, timers, server } = await openSession()
		server.holdSaves = true
		rename(session, 'Eins')
		timers.fire()
		await flush()
		session.update((doc) => addNode(doc, { parentId: getRoot(doc).id, title: 'Neu' }, () => 'x').doc)
		server.holdSaves = false
		server.pending?.()
		await flush()
		await flush()
		expect(session.snapshot.saveState).toBe('dirty')
		timers.fire()
		await flush()
		expect(session.snapshot.saveState).toBe('saved')
		expect(server.content).toContain('"Neu"')
	})

	it('reports failed saves and retries on the next save', async () => {
		const { session, timers, server } = await openSession()
		server.failNext = new Error('Netzwerkfehler')
		rename(session, 'X')
		timers.fire()
		await flush()
		expect(session.snapshot).toMatchObject({ saveState: 'error', error: 'Netzwerkfehler' })
		expect(session.hasUnsavedChanges).toBe(true)
		await session.save()
		expect(session.snapshot).toMatchObject({ saveState: 'saved', error: null })
	})

	it('undoes and redoes', async () => {
		const { session } = await openSession()
		rename(session, 'A')
		expect(session.snapshot.canUndo).toBe(true)
		expect(session.undo()).toBe(true)
		expect(session.doc.meta.title).toBe('Beispiel: Theaterproduktion')
		expect(session.redo()).toBe(true)
		expect(session.doc.meta.title).toBe('A')
		expect(session.redo()).toBe(false)
	})

	it('does not change read-only files', async () => {
		const server = new FakeServer(example)
		server.canEdit = false
		const session = new EditorSession(server, 7)
		await session.open()
		expect(session.snapshot.saveState).toBe('readonly')
		expect(rename(session, 'X')).toBe(false)
		expect(session.undo()).toBe(false)
		expect(session.redo()).toBe(false)
		await session.save()
		expect(server.saves).toHaveLength(0)
	})

	it('throws when used before opening', () => {
		const session = new EditorSession(new FakeServer(example), 7)
		expect(() => session.doc).toThrow('Session is not open')
	})

	it('stops its timer and listeners on dispose', async () => {
		const { session, timers } = await openSession()
		const listener = vi.fn()
		session.subscribe(listener)
		rename(session, 'X')
		session.dispose()
		expect(timers.pending()).toBe(false)
		rename(session, 'Y')
		expect(listener).toHaveBeenCalledTimes(1)
	})

	it('uses real timers by default', async () => {
		vi.useFakeTimers()
		try {
			const server = new FakeServer(example)
			const session = new EditorSession(server, 7, { autosaveDelay: 100 })
			await session.open()
			rename(session, 'Mit Timer')
			await vi.advanceTimersByTimeAsync(150)
			expect(JSON.parse(server.content).meta.title).toBe('Mit Timer')
			rename(session, 'Abgebrochen')
			session.dispose()
			await vi.advanceTimersByTimeAsync(150)
			expect(JSON.parse(server.content).meta.title).toBe('Mit Timer')
		} finally {
			vi.useRealTimers()
		}
	})
})
