<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Unit tests run without a Nextcloud server: the OCP interfaces come from
// the nextcloud/ocp package and server classes are mocked.
require_once __DIR__ . '/../vendor/autoload.php';

if (!interface_exists(\OC\Hooks\Emitter::class)) {
	require_once __DIR__ . '/stubs/oc-hooks.php';
}
