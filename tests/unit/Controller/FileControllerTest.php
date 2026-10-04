<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 Malte Leonard Herz
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Psp\Tests\unit\Controller;

use OCA\Psp\Controller\FileController;
use OCA\Psp\Exception\ConflictException;
use OCA\Psp\Exception\PlanException;
use OCA\Psp\Service\PlanFileService;
use OCP\IRequest;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

final class FileControllerTest extends TestCase {
	private PlanFileService&MockObject $service;
	private FileController $controller;

	protected function setUp(): void {
		$this->service = $this->createMock(PlanFileService::class);
		$this->controller = new FileController('psp', $this->createMock(IRequest::class), $this->service);
	}

	public function testLoadPassesTheDataThrough(): void {
		$data = ['fileId' => 1, 'name' => 'a.psp', 'path' => '/a.psp', 'etag' => 'e', 'mtime' => 1, 'canEdit' => true, 'content' => '{}'];
		$this->service->method('load')->with(1)->willReturn($data);

		$response = $this->controller->load(1);

		$this->assertSame(200, $response->getStatus());
		$this->assertSame($data, $response->getData());
	}

	public function testErrorsBecomeStatusCodes(): void {
		$this->service->method('load')->willThrowException(new PlanException('File not found', 404));

		$response = $this->controller->load(1);

		$this->assertSame(404, $response->getStatus());
		$this->assertSame(['message' => 'File not found'], $response->getData());
	}

	public function testConflictsCarryTheCurrentVersion(): void {
		$this->service->method('save')->with(1, '{}', 'old', false)->willThrowException(new ConflictException('new', 99));

		$response = $this->controller->save(1, '{}', 'old');

		$this->assertSame(409, $response->getStatus());
		$this->assertSame(['message' => 'The file was changed by someone else', 'etag' => 'new', 'mtime' => 99], $response->getData());
	}

	public function testCreateAnswers201(): void {
		$this->service->method('create')->with('/', 'Plan', '{}')->willReturn(['fileId' => 2]);

		$this->assertSame(201, $this->controller->create('/', 'Plan', '{}')->getStatus());
	}

	public function testCreateReportsErrors(): void {
		$this->service->method('create')->willThrowException(new PlanException('Invalid file name'));

		$this->assertSame(400, $this->controller->create('/', '', '{}')->getStatus());
	}

	public function testSaveReturnsTheNewVersion(): void {
		$this->service->method('save')->with(1, '{}', 'e', true)->willReturn(['etag' => 'f']);

		$this->assertSame(['etag' => 'f'], $this->controller->save(1, '{}', 'e', true)->getData());
	}
}
