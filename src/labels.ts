/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { getCanonicalLocale, t } from '@nextcloud/l10n'
import type { NodeType } from './core'

export function typeLabel(type: NodeType): string {
	switch (type) {
	case 'project': return t('psp', 'Projekt')
	case 'subproject': return t('psp', 'Teilprojekt')
	case 'workpackage': return t('psp', 'Arbeitspaket')
	case 'milestone': return t('psp', 'Meilenstein')
	}
}

export function formatMoney(amount: number, currency: string): string {
	try {
		return new Intl.NumberFormat(getCanonicalLocale(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
	} catch {
		return `${amount.toFixed(2)} ${currency}`
	}
}

export function formatDays(days: number): string {
	const number = new Intl.NumberFormat(getCanonicalLocale(), { maximumFractionDigits: 2 }).format(days)
	return t('psp', '{days} PT', { days: number })
}
