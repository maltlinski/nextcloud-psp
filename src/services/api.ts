/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import axios, { isAxiosError } from '@nextcloud/axios'
import { generateOcsUrl, generateUrl } from '@nextcloud/router'

export interface PlanFileInfo {
	fileId: number
	name: string
	/** Path relative to the user's files. */
	path: string
	etag: string
	mtime: number
	canEdit: boolean
}

export interface LoadedPlan extends PlanFileInfo {
	content: string
}

export type SaveResult =
	| { ok: true, info: PlanFileInfo }
	| { ok: false, conflict: true, etag: string, mtime: number }

/** Error with a message the server sent, safe to show. */
export class ApiError extends Error {

	readonly status: number

	constructor(message: string, status: number) {
		super(message)
		this.name = 'ApiError'
		this.status = status
	}

}

interface OcsResponse<T> {
	ocs: { data: T }
}

const filesUrl = (fileId?: number) => generateOcsUrl('/apps/psp/api/v1/files' + (fileId === undefined ? '' : `/${fileId}`))

function toApiError(error: unknown): ApiError {
	if (isAxiosError(error)) {
		const data = (error.response?.data as OcsResponse<{ message?: string }> | undefined)?.ocs?.data
		return new ApiError(data?.message ?? error.message, error.response?.status ?? 0)
	}
	return new ApiError((error as Error).message ?? String(error), 0)
}

export async function loadPlan(fileId: number): Promise<LoadedPlan> {
	try {
		const response = await axios.get<OcsResponse<LoadedPlan>>(filesUrl(fileId))
		return response.data.ocs.data
	} catch (error) {
		throw toApiError(error)
	}
}

export async function savePlan(fileId: number, content: string, etag: string, force = false): Promise<SaveResult> {
	try {
		const response = await axios.put<OcsResponse<PlanFileInfo>>(filesUrl(fileId), { content, etag, force })
		return { ok: true, info: response.data.ocs.data }
	} catch (error) {
		if (isAxiosError(error) && error.response?.status === 409) {
			const data = (error.response.data as OcsResponse<{ etag: string, mtime: number }>).ocs.data
			return { ok: false, conflict: true, etag: data.etag, mtime: data.mtime }
		}
		throw toApiError(error)
	}
}

export async function createPlan(directory: string, name: string, content: string): Promise<PlanFileInfo> {
	try {
		const response = await axios.post<OcsResponse<PlanFileInfo>>(filesUrl(), { directory, name, content })
		return response.data.ocs.data
	} catch (error) {
		throw toApiError(error)
	}
}

/** URL of the editor for a file. */
export function editorUrl(fileId: number): string {
	return generateUrl('/apps/psp/') + `?fileId=${fileId}`
}
