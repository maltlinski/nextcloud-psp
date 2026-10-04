<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

use OCA\Psp\AppInfo\Application;
use OCP\Util;

Util::addScript(Application::APP_ID, Application::APP_ID . '-main');
Util::addStyle(Application::APP_ID, Application::APP_ID . '-main');

?>

<div id="psp"></div>
