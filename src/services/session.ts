/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*
 * One open plan: the document, its undo history and the connection to the
 * file on the server. Changes are saved automatically a short moment after
 * the last edit. When someone else saved the file in between, saving stops
 * and the session enters the `conflict` state until the user decides.
 *
 * The session knows nothing about Vue; views subscribe with `subscribe()`.
 */

import {
	createDocument,
	History,
	type Issue,
	parseDocument,
	type PspDocument,
	serializeDocument,
} from '../core'
import type { LoadedPlan, PlanFileInfo, SaveResult } from './api'

export type SaveState =
	/** Everything is on the server. */
	| 'saved'
	/** Local changes wait for the next save. */
	| 'dirty'
	| 'saving'
	/** The file changed on the server; the user has to choose. */
	| 'conflict'
	/** The last save failed; it is retried with the next change or `save()`. */
	| 'error'
	/** The user may not change this file. */
	| 'readonly'

export interface SessionApi {
	load(fileId: number): Promise<LoadedPlan>
	save(fileId: number, content: string, etag: string, force?: boolean): Promise<SaveResult>
}

export interface SessionSnapshot {
	doc: PspDocument
	name: string
	path: string
	canEdit: boolean
	saveState: SaveState
	canUndo: boolean
	canRedo: boolean
	/** Warnings from loading the file. */
	issues: Issue[]
	/** Message of the last failed save. */
	error: string | null
}

export interface SessionOptions {
	/** Milliseconds between the last change and the automatic save. */
	autosaveDelay?: number
	setTimer?: (callback: () => void, ms: number) => unknown
	clearTimer?: (handle: unknown) => void
}

/** Raised by `open()` when the file cannot be used as a plan. */
export class OpenError extends Error {

	readonly issues: Issue[]

	constructor(message: string, issues: Issue[] = []) {
		super(message)
		this.name = 'OpenError'
		this.issues = issues
	}

}

/** File name without the .psp extension. */
export function planTitleFromName(name: string): string {
	return name.replace(/\.psp$/i, '')
}

export class EditorSession {

	readonly fileId: number
	readonly #api: SessionApi
	readonly #delay: number
	readonly #setTimer: (callback: () => void, ms: number) => unknown
	readonly #clearTimer: (handle: unknown) => void

	#history: History<PspDocument> | null = null
	#info: PlanFileInfo | null = null
	#savedText = ''
	#saveState: SaveState = 'saved'
	#issues: Issue[] = []
	#error: string | null = null
	#timer: unknown = null
	#saving: Promise<void> | null = null
	#saveAgain = false
	#listeners = new Set<(snapshot: SessionSnapshot) => void>()

	constructor(api: SessionApi, fileId: number, options: SessionOptions = {}) {
		this.#api = api
		this.fileId = fileId
		this.#delay = options.autosaveDelay ?? 1500
		this.#setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms))
		this.#clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
	}

	/** Loads the file. An empty file becomes a new plan named after the file. */
	async open(): Promise<SessionSnapshot> {
		const loaded = await this.#api.load(this.fileId)
		this.#apply(loaded)
		return this.snapshot
	}

	#apply(loaded: LoadedPlan): void {
		let doc: PspDocument
		if (loaded.content.trim() === '') {
			doc = createDocument(planTitleFromName(loaded.name))
			this.#issues = []
			this.#savedText = ''
		} else {
			const result = parseDocument(loaded.content)
			if (!result.doc) {
				throw new OpenError('The file is not a valid PSP document', result.issues)
			}
			doc = result.doc
			this.#issues = result.issues
			this.#savedText = loaded.content
		}
		const info: PlanFileInfo = {
			fileId: loaded.fileId,
			name: loaded.name,
			path: loaded.path,
			etag: loaded.etag,
			mtime: loaded.mtime,
			canEdit: loaded.canEdit,
		}
		this.#info = info
		this.#history = new History(doc)
		this.#error = null
		this.#saveState = info.canEdit ? 'saved' : 'readonly'
		// An empty file or a file written by another version is saved in our format right away.
		if (info.canEdit && serializeDocument(doc) !== this.#savedText) {
			this.#saveState = 'dirty'
			this.#schedule()
		}
		this.#emit()
	}

	get snapshot(): SessionSnapshot {
		const history = this.#requireHistory()
		const info = this.#info as PlanFileInfo
		return {
			doc: history.current,
			name: info.name,
			path: info.path,
			canEdit: info.canEdit,
			saveState: this.#saveState,
			canUndo: info.canEdit && history.canUndo,
			canRedo: info.canEdit && history.canRedo,
			issues: this.#issues,
			error: this.#error,
		}
	}

	get doc(): PspDocument {
		return this.#requireHistory().current
	}

	/** True while there are changes that are not on the server yet. */
	get hasUnsavedChanges(): boolean {
		return this.#saveState === 'dirty' || this.#saveState === 'saving' || this.#saveState === 'conflict' || this.#saveState === 'error'
	}

	subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
		this.#listeners.add(listener)
		return () => this.#listeners.delete(listener)
	}

	/**
	 * Applies a change. Returns false when nothing changed or the file is read-only.
	 * Errors thrown by `change` reach the caller and leave the document untouched.
	 */
	update(change: (doc: PspDocument) => PspDocument, mergeKey?: string): boolean {
		if (!this.#info?.canEdit) {
			return false
		}
		const history = this.#requireHistory()
		const next = change(history.current)
		if (next === history.current) {
			return false
		}
		history.push(next, mergeKey)
		this.#changed()
		return true
	}

	undo(): boolean {
		if (!this.#info?.canEdit || !this.#requireHistory().undo()) {
			return false
		}
		this.#changed()
		return true
	}

	redo(): boolean {
		if (!this.#info?.canEdit || !this.#requireHistory().redo()) {
			return false
		}
		this.#changed()
		return true
	}

	#changed(): void {
		if (this.#saveState !== 'conflict') {
			this.#saveState = 'dirty'
			this.#schedule()
		}
		this.#emit()
	}

	#schedule(): void {
		this.#cancelTimer()
		this.#timer = this.#setTimer(() => {
			this.#timer = null
			this.save()
		}, this.#delay)
	}

	#cancelTimer(): void {
		if (this.#timer !== null) {
			this.#clearTimer(this.#timer)
			this.#timer = null
		}
	}

	/** Saves now. Does nothing while a conflict is open or the file is read-only. */
	async save(): Promise<void> {
		if (!this.#info?.canEdit || this.#saveState === 'conflict') {
			return
		}
		this.#cancelTimer()
		if (this.#saving) {
			this.#saveAgain = true
			return this.#saving
		}
		this.#saving = this.#write(false).finally(() => {
			this.#saving = null
		})
		await this.#saving
		if (this.#saveAgain) {
			this.#saveAgain = false
			await this.save()
		}
	}

	async #write(force: boolean): Promise<void> {
		const info = this.#info as PlanFileInfo
		const text = serializeDocument(this.doc)
		if (text === this.#savedText && !force) {
			this.#saveState = 'saved'
			this.#emit()
			return
		}
		this.#saveState = 'saving'
		this.#emit()
		try {
			const result = await this.#api.save(this.fileId, text, info.etag, force)
			if (!result.ok) {
				this.#saveState = 'conflict'
				this.#emit()
				return
			}
			this.#info = result.info
			this.#savedText = text
			this.#error = null
			// Edits made while the request was running still need saving.
			this.#saveState = serializeDocument(this.doc) === text ? 'saved' : 'dirty'
			if (this.#saveState === 'dirty') {
				this.#schedule()
			}
		} catch (error) {
			this.#saveState = 'error'
			this.#error = (error as Error).message
		}
		this.#emit()
	}

	/** Conflict: drop local changes and load the version from the server. */
	async reload(): Promise<void> {
		this.#cancelTimer()
		const loaded = await this.#api.load(this.fileId)
		this.#apply(loaded)
	}

	/** Conflict: replace the server version with the local one. */
	async overwrite(): Promise<void> {
		this.#cancelTimer()
		if (this.#saving) {
			await this.#saving
		}
		this.#saving = this.#write(true).finally(() => {
			this.#saving = null
		})
		await this.#saving
	}

	dispose(): void {
		this.#cancelTimer()
		this.#listeners.clear()
	}

	#requireHistory(): History<PspDocument> {
		if (!this.#history) {
			throw new Error('Session is not open')
		}
		return this.#history
	}

	#emit(): void {
		const snapshot = this.snapshot
		for (const listener of this.#listeners) {
			listener(snapshot)
		}
	}

}
