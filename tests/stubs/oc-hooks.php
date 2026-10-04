<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// OCP\Files\IRootFolder extends this private server interface. The
// nextcloud/ocp package does not ship it, so unit tests that mock the root
// folder need this copy of its signature.

namespace OC\Hooks;

interface Emitter {
	/**
	 * @param string $scope
	 * @param string $method
	 */
	public function listen($scope, $method, callable $callback);

	/**
	 * @param string|null $scope
	 * @param string|null $method
	 */
	public function removeListener($scope = null, $method = null, ?callable $callback = null);
}
