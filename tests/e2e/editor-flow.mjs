/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*
 * Browser test of the editor against a running Nextcloud.
 *
 *   npm i --no-save playwright
 *   PSP_BASE=http://127.0.0.1:8080 PSP_OCC=../../occ node tests/e2e/editor-flow.mjs
 *
 * Optional: PSP_CHROMIUM=/path/to/chrome, PSP_SHOTS=folder for screenshots.
 * Creates the users psp_owner, psp_editor and psp_reader (see api-test.sh).
 */
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const BASE = process.env.PSP_BASE ?? 'http://127.0.0.1:8080'
const OCC = process.env.PSP_OCC
const SHOTS = process.env.PSP_SHOTS
const NAME = `E2E ${Date.now()}`
const password = (user) => `pw-${user}-2026`

if (OCC) {
	for (const user of ['psp_owner', 'psp_editor', 'psp_reader']) {
		try {
			execFileSync('php', [OCC, 'user:info', user], { stdio: 'ignore' })
		} catch {
			execFileSync('php', [OCC, 'user:add', '--password-from-env', user], { env: { ...process.env, OC_PASS: password(user) }, stdio: 'ignore' })
		}
	}
}

const browser = await chromium.launch(process.env.PSP_CHROMIUM ? { executablePath: process.env.PSP_CHROMIUM } : {})
const errors = []
let failures = 0

async function login(user) {
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'de-DE' })
	const page = await context.newPage()
	page.on('pageerror', (error) => errors.push(`${user}: ${error.message}`))
	await page.goto(`${BASE}/index.php/login`)
	await page.fill('#user', user)
	await page.fill('#password', password(user))
	await page.click('button[type=submit]')
	await page.waitForURL(/apps/)
	return page
}

async function step(name, fn) {
	try {
		await fn()
		console.log(`ok    ${name}`)
	} catch (error) {
		failures++
		console.log(`FAIL  ${name}: ${error.message.split('\n')[0]}`)
	}
}

const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` })
const saved = (page) => page.locator('[data-test=save-status][data-state=saved]').waitFor({ timeout: 15000 })
const titles = (page) => page.locator('input[data-node-id]').evaluateAll((inputs) => inputs.map((input) => input.value))

async function typeAtEnd(page, index, text) {
	const input = page.locator('input[data-node-id]').nth(index)
	await input.click()
	await input.press('End')
	await page.keyboard.type(text)
}

const owner = await login('psp_owner')
let fileId = ''

await step('Files offers "Neuer Projektstrukturplan"', async () => {
	await owner.goto(`${BASE}/index.php/apps/files/files`)
	await owner.waitForLoadState('networkidle')
	await owner.getByRole('button', { name: /^(Neu|New)$/ }).first().click()
	await owner.getByText('Neuer Projektstrukturplan').click()
	await owner.getByLabel('Dateiname').fill(NAME)
	await owner.getByRole('button', { name: 'Erstellen' }).click()
	await owner.waitForURL(/apps\/psp\/\?fileId=/, { timeout: 15000 })
	fileId = new URL(owner.url()).searchParams.get('fileId')
	await saved(owner)
})

await step('outline can be built with the keyboard', async () => {
	await typeAtEnd(owner, 0, '')
	for (const [key, text] of [['Enter', 'Konzept'], ['Enter', 'Recherche'], ['Tab', null], ['Enter', 'Stückfassung'], ['Enter', null], ['Shift+Tab', 'Bühne']]) {
		await owner.keyboard.press(key)
		if (text) {
			await owner.keyboard.type(text)
		}
	}
	await saved(owner)
	await shot(owner, 'editor')
	const values = await titles(owner)
	if (values.join('|') !== `${NAME}|Konzept|Recherche|Stückfassung|Bühne`) {
		throw new Error(values.join('|'))
	}
})

await step('clicking the file in Files opens the editor', async () => {
	await owner.goto(`${BASE}/index.php/apps/files/files`)
	await owner.waitForLoadState('networkidle')
	await owner.getByRole('row').filter({ hasText: NAME }).getByRole('button', { name: new RegExp(NAME) }).first().click()
	await owner.waitForURL(new RegExp(`fileId=${fileId}`), { timeout: 15000 })
})

const share = async (user, permissions) => {
	const response = await owner.request.post(`${BASE}/ocs/v2.php/apps/files_sharing/api/v1/shares`, {
		headers: { 'OCS-APIRequest': 'true' },
		form: { path: `/${NAME}.psp`, shareType: '0', shareWith: user, permissions: String(permissions) },
	})
	if (!response.ok()) {
		throw new Error(`share failed: ${response.status()}`)
	}
}
await share('psp_editor', 19)
await share('psp_reader', 17)

const editor = await login('psp_editor')
const reader = await login('psp_reader')
await owner.goto(`${BASE}/index.php/apps/psp/?fileId=${fileId}`)
await editor.goto(`${BASE}/index.php/apps/psp/?fileId=${fileId}`)
await reader.goto(`${BASE}/index.php/apps/psp/?fileId=${fileId}`)
await saved(owner)
await saved(editor)

await step('reader sees the plan read-only', async () => {
	await reader.locator('[data-test=save-status][data-state=readonly]').waitFor()
	await shot(reader, 'readonly')
})

await step('saving over a newer version opens the conflict dialog', async () => {
	await typeAtEnd(editor, 2, ' (Editor)')
	await saved(editor)
	await typeAtEnd(owner, 3, ' (Owner)')
	await owner.getByText('Jemand anderes hat den Plan geändert').waitFor({ timeout: 15000 })
	await shot(owner, 'conflict')
})

await step('"Neu laden" shows the other version', async () => {
	await owner.getByRole('button', { name: 'Neu laden' }).click()
	await saved(owner)
	const values = await titles(owner)
	if (!values.includes('Recherche (Editor)') || values.some((value) => value.includes('(Owner)'))) {
		throw new Error(values.join('|'))
	}
})

await step('"Meine Fassung speichern" overwrites', async () => {
	await typeAtEnd(editor, 4, '!')
	await saved(editor)
	await typeAtEnd(owner, 1, ' v2')
	await owner.getByRole('button', { name: 'Meine Fassung speichern' }).click({ timeout: 15000 })
	await saved(owner)
	await editor.reload()
	await saved(editor)
	if (!(await titles(editor)).includes('Konzept v2')) {
		throw new Error('owner version missing')
	}
})

await step('Ctrl+Z undoes', async () => {
	const input = owner.locator('input[data-node-id]').nth(1)
	await input.click()
	await owner.keyboard.press('Control+z')
	if (await input.inputValue() !== 'Konzept') {
		throw new Error(await input.inputValue())
	}
})

await step('no JavaScript errors', async () => {
	if (errors.length > 0) {
		throw new Error(errors.join('; '))
	}
})

await browser.close()
process.exit(failures > 0 ? 1 : 0)
