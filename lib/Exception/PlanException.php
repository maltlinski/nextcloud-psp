<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Psp\Exception;

use OCP\AppFramework\Http;

/**
 * Error with an HTTP status, raised by the plan file service.
 */
class PlanException extends \Exception {
	/**
	 * @param Http::STATUS_* $status
	 */
	public function __construct(
		string $message,
		private int $status = Http::STATUS_BAD_REQUEST,
	) {
		parent::__construct($message);
	}

	/**
	 * @return Http::STATUS_*
	 */
	public function getStatus(): int {
		return $this->status;
	}
}
