<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Psp\Listener;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\Psp\AppInfo\Application;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/**
 * Adds the "New plan" entry and the "Open in PSP" action to the Files app.
 *
 * @template-implements IEventListener<Event>
 */
class LoadFilesScriptsListener implements IEventListener {
	#[\Override]
	public function handle(Event $event): void {
		if (!$event instanceof LoadAdditionalScriptsEvent) {
			return;
		}
		Util::addInitScript(Application::APP_ID, Application::APP_ID . '-files');
	}
}
