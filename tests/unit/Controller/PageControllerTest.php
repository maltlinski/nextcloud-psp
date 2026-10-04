<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Psp\Tests\unit\Controller;

use OCA\Psp\AppInfo\Application;
use OCA\Psp\Controller\PageController;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

final class PageControllerTest extends TestCase {
	public function testIndexRendersAppTemplate(): void {
		$request = $this->createMock(IRequest::class);
		$controller = new PageController(Application::APP_ID, $request);

		$response = $controller->index();

		$this->assertInstanceOf(TemplateResponse::class, $response);
		$this->assertSame('index', $response->getTemplateName());
		$this->assertSame(Application::APP_ID, $response->getApp());
	}
}
