<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Psp\Exception;

use OCP\AppFramework\Http;

/**
 * The file changed on the server since the client loaded it.
 */
class ConflictException extends PlanException {
	public function __construct(
		private string $currentEtag,
		private int $currentMtime,
	) {
		parent::__construct('The file was changed by someone else', Http::STATUS_CONFLICT);
	}

	public function getCurrentEtag(): string {
		return $this->currentEtag;
	}

	public function getCurrentMtime(): int {
		return $this->currentMtime;
	}
}
