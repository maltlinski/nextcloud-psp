<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Psp\AppInfo;

use OCA\Files\Event\LoadAdditionalScriptsEvent;
use OCA\Psp\Listener\LoadFilesScriptsListener;
use OCA\Psp\Service\PlanFileService;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\Files\IMimeTypeDetector;

class Application extends App implements IBootstrap {
	public const APP_ID = 'psp';

	/** @psalm-suppress PossiblyUnusedMethod */
	public function __construct() {
		parent::__construct(self::APP_ID);
	}

	#[\Override]
	public function register(IRegistrationContext $context): void {
		$context->registerEventListener(LoadAdditionalScriptsEvent::class, LoadFilesScriptsListener::class);
	}

	#[\Override]
	public function boot(IBootContext $context): void {
		// The app is of type "filesystem", so this also runs for WebDAV and
		// sync client uploads: new .psp files get their own MIME type.
		$context->injectFn(static function (IMimeTypeDetector $detector): void {
			// registerType() is not part of the public interface yet, but the
			// server's implementation has offered it for many releases.
			if (method_exists($detector, 'registerType')) {
				$detector->registerType('psp', PlanFileService::MIME_TYPE, 'application/json');
			}
		});
	}
}
